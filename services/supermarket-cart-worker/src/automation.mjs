import { Browser, Builder, By } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const BLOCKED_TEXT = [
  'robot or human',
  'robot o humano',
  'confirma que eres humano',
  'confirm that you are human',
  'activate and hold',
  'verificacion de seguridad',
  'verificación de seguridad',
  'security verification',
  'just a moment',
  'verifying you are human',
  'verificando que eres humano',
  'checking your browser',
  'review the security of your connection',
  'revisando la seguridad de tu conexion',
];

const UNAVAILABLE_TEXT = [
  'el producto que estas buscando ya no esta disponible',
  'el producto que estás buscando ya no está disponible',
  'este producto no se encuentra disponible en el momento',
  'este producto no esta disponible',
  'este producto no está disponible',
  'producto no disponible',
  'producto agotado',
  'sin stock',
  'justo se agoto',
  'se agoto justo',
];

const INTERVENTION_TEXT = [
  'ingresa tu ubicacion',
  'ingresa tu ubicación',
  'ingresa tu direccion',
  'ingresa tu dirección',
  'selecciona tu comuna',
  'selecciona una comuna',
  'como quieres recibir tu compra',
  'cómo quieres recibir tu compra',
  'elige un metodo de entrega',
  'elige un método de entrega',
  'elige un modo de entrega',
  'inicia sesion',
  'inicia sesión',
  'ingresa a tu cuenta',
];

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const ITEM_PACING_MS = 4_000;

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function seleniumReady(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/status`, { signal: controller.signal });
    const payload = await response.json();
    return response.ok && payload?.value?.ready === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createDriver(webDriverUrl) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && !await seleniumReady(webDriverUrl)) await sleep(1_000);

  const options = new chrome.Options();
  options.addArguments(
    '--lang=es-CL',
    '--disable-features=OptimizationHints,PasswordManagerOnboarding,Translate',
    '--disable-search-engine-choice-screen',
    '--no-default-browser-check',
    '--no-first-run',
  );
  options.setUserPreferences({
    'credentials_enable_service': false,
    'profile.password_manager_enabled': false,
    'profile.default_content_setting_values.notifications': 2,
  });

  const driver = await new Builder()
    .forBrowser(Browser.CHROME)
    .setChromeOptions(options)
    .usingServer(webDriverUrl)
    .build();
  await driver.manage().setTimeouts({ implicit: 0, pageLoad: 60_000, script: 20_000 });
  await driver.manage().window().setRect({ x: 0, y: 0, width: 1440, height: 900 });
  return driver;
}

async function navigate(driver, url) {
  try {
    await driver.get(url);
  } catch (error) {
    const current = await driver.getCurrentUrl().catch(() => '');
    if (!current || current === 'data:,') throw error;
  }
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const state = await driver.executeScript('return document.readyState').catch(() => '');
    if (state === 'interactive' || state === 'complete') break;
    await sleep(250);
  }
  await sleep(1_500);
}

async function bodyText(driver) {
  return normalize(await driver.executeScript('return document.body ? document.body.innerText : ""').catch(() => ''));
}

function containsAny(text, values) {
  return values.some(value => text.includes(normalize(value)));
}

async function firstVisible(driver, selectors) {
  for (const selector of selectors) {
    let elements = [];
    try {
      elements = await driver.findElements(By.css(selector));
    } catch {
      continue;
    }
    for (const element of elements) {
      const visible = await element.isDisplayed().catch(() => false);
      const enabled = visible && await element.isEnabled().catch(() => false);
      if (enabled) return element;
    }
  }
  return null;
}

async function settledPageText(driver, config) {
  const deadline = Date.now() + 15_000;
  let text = await bodyText(driver);
  while (Date.now() < deadline) {
    if (containsAny(text, UNAVAILABLE_TEXT) || containsAny(text, BLOCKED_TEXT)) return text;
    if (await firstVisible(driver, config.addSelectors)) return text;
    await sleep(750);
    text = await bodyText(driver);
  }
  return text;
}

async function nativeClick(driver, element) {
  await driver.executeScript('arguments[0].scrollIntoView({block:"center",inline:"center"})', element).catch(() => undefined);
  await sleep(200);
  try {
    await driver.actions({ async: true }).move({ origin: element }).click().perform();
  } catch {
    await element.click();
  }
}

async function signature(driver, selectors) {
  return driver.executeScript(`
    const selectors = arguments[0];
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    return selectors.flatMap(selector => {
      try { return [...document.querySelectorAll(selector)]; } catch { return []; }
    }).filter(visible).map(element => [
      element.getAttribute('aria-label') || '',
      element.getAttribute('title') || '',
      'value' in element ? element.value : '',
      element.textContent || '',
    ].join('|').replace(/\\s+/g, ' ').trim()).join('::');
  `, selectors).catch(() => '');
}

async function cartSignature(driver, config) {
  const [cart, quantity] = await Promise.all([
    signature(driver, config.cartSelectors),
    signature(driver, config.quantitySelectors),
  ]);
  return `${cart}##${quantity}`;
}

async function waitForSignatureChange(driver, config, before, timeout = 9_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const after = await cartSignature(driver, config);
    if (after && after !== before) return true;
    await sleep(350);
  }
  return false;
}

async function addExtraQuantity(driver, config, quantity) {
  let clicked = 0;
  for (let index = 1; index < quantity; index += 1) {
    const plus = await firstVisible(driver, config.plusSelectors);
    if (!plus) return { complete: false, clicked };
    await nativeClick(driver, plus);
    clicked += 1;
    await sleep(650);
  }
  return { complete: true, clicked };
}

async function automaticItemAttempt(driver, config, item) {
  const text = await settledPageText(driver, config);
  if (containsAny(text, UNAVAILABLE_TEXT)) return { kind: 'unavailable' };
  const before = await cartSignature(driver, config);
  if (containsAny(text, BLOCKED_TEXT)) return { kind: 'blocked', before };

  const add = await firstVisible(driver, config.addSelectors);
  if (!add) {
    return {
      kind: containsAny(text, INTERVENTION_TEXT) ? 'intervention' : 'manual',
      before,
    };
  }

  let quantity = { complete: true, clicked: 0 };
  if (config.quantityBeforeAdd) quantity = await addExtraQuantity(driver, config, item.quantity);
  if (!(config.quantityControlAddsToCart && quantity.clicked > 0)) await nativeClick(driver, add);
  const changed = await waitForSignatureChange(driver, config, before);
  if (!changed) return { kind: 'unconfirmed', before };
  if (!config.quantityBeforeAdd) quantity = await addExtraQuantity(driver, config, item.quantity);
  return { kind: 'added', quantityComplete: quantity.complete };
}

async function processManagedItem(driver, session, hooks, item) {
  await navigate(driver, item.productUrl);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    hooks.assertOpen();
    const result = await automaticItemAttempt(driver, session.config, item);
    if (result.kind === 'added') {
      return {
        added: true,
        detail: result.quantityComplete
          ? `Agregado y verificado con cantidad ${item.quantity}.`
          : 'Producto agregado; revisa la cantidad antes de pagar.',
      };
    }
    if (result.kind === 'unavailable') {
      return { added: false, detail: 'Producto sin stock; vuelve a Convive para elegir un reemplazo.' };
    }

    const detail = result.kind === 'blocked'
      ? 'La tienda pide una verificación humana. Complétala en el navegador y continúa.'
      : result.kind === 'intervention'
        ? 'La tienda necesita ubicación, despacho o inicio de sesión. Completa el paso y continúa.'
        : 'No pudimos confirmar el botón. Agrégalo manualmente si aparece y luego continúa.';
    const resumed = await hooks.waitForUser(detail);
    if (!resumed) hooks.assertOpen();
    const after = await cartSignature(driver, session.config);
    if (result.before && after && after !== result.before) {
      return { added: true, detail: 'Cambio del carro confirmado después de tu intervención.' };
    }
    if (attempt < 2) await sleep(500);
  }
  return { added: false, detail: 'No fue posible confirmar este producto en el carro.' };
}

async function cartLineCount(driver, mode) {
  if (mode !== 'vtex' && mode !== 'shopify') return 0;
  const endpoint = mode === 'vtex' ? '/api/checkout/pub/orderForm' : '/cart.js';
  return Number(await driver.executeAsyncScript(`
    const endpoint = arguments[0];
    const done = arguments[arguments.length - 1];
    fetch(endpoint, { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(response => response.ok ? response.json() : null)
      .then(payload => done(Array.isArray(payload?.items) ? payload.items.length : 0))
      .catch(() => done(0));
  `, endpoint).catch(() => 0)) || 0;
}

async function processDirectCart(driver, session, hooks) {
  await navigate(driver, session.directCartUrl);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    hooks.assertOpen();
    const lines = await cartLineCount(driver, session.config.cartMode);
    if (lines >= session.plannedCount) return true;
    const text = await bodyText(driver);
    const detail = containsAny(text, BLOCKED_TEXT)
      ? 'La tienda pide una verificación humana. Complétala y continúa.'
      : 'Revisa ubicación o inicio de sesión; aún no pudimos confirmar el carro y sus cantidades.';
    if (!await hooks.waitForUser(detail)) hooks.assertOpen();
    const afterUser = await cartLineCount(driver, session.config.cartMode);
    if (afterUser >= session.plannedCount) return true;
    if (attempt < 2) await navigate(driver, session.directCartUrl);
  }
  return false;
}

async function openCart(driver, config) {
  const button = config.openCartSelectors
    ? await firstVisible(driver, config.openCartSelectors)
    : null;
  if (button) {
    await nativeClick(driver, button).catch(() => undefined);
    await sleep(1_000);
    return;
  }
  await navigate(driver, config.cartUrl).catch(() => undefined);
}

export async function runCartAutomation(driver, session, hooks) {
  if (session.directCartUrl) {
    hooks.update({
      status: 'loading',
      current: 0,
      detail: `Abriendo y verificando el carro de ${session.store}…`,
    });
    const confirmed = await processDirectCart(driver, session, hooks);
    hooks.update({
      status: confirmed ? 'ready' : 'partial',
      current: session.total,
      added: confirmed ? session.plannedCount : 0,
      failed: confirmed ? 0 : session.plannedCount,
      detail: confirmed
        ? `Carro verificado con ${session.plannedCount} productos. Revísalo antes de pagar.`
        : 'El carro quedó abierto, pero no pudimos verificar automáticamente todos los productos.',
    });
    return;
  }

  for (let index = 0; index < session.items.length; index += 1) {
    hooks.assertOpen();
    const item = session.items[index];
    hooks.update({
      status: 'loading',
      current: index + 1,
      itemName: item.name,
      detail: `Cargando producto ${index + 1} de ${session.items.length}…`,
    });
    if (index > 0) await sleep(ITEM_PACING_MS);
    const result = await processManagedItem(driver, session, hooks, item);
    if (result.added) session.added += 1;
    else {
      session.failed += 1;
      session.missingItems = [...new Set([...session.missingItems, item.name])];
    }
    hooks.update({ detail: result.detail });
  }

  await openCart(driver, session.config);
  hooks.update({
    status: session.failed === 0 ? 'ready' : 'partial',
    current: session.total,
    itemName: '',
    detail: session.failed === 0
      ? `Carro verificado con ${session.added} productos. Revísalo antes de pagar.`
      : `Carro abierto: ${session.added} productos confirmados y ${session.failed} pendientes.`,
  });
}
