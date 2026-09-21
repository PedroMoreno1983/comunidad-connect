import { Browser, Builder, By } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { normalize, parseCartTotal } from './cartTotal.mjs';
import { verifyLiderCart, verifyDirectCart } from './cartVerification.mjs';
import {
  LIDER_CART_API_SCRIPT,
  apiEligibleItems,
  apiRequestItems,
  confirmLiderItems,
  parseLiderCartResponse,
} from './liderCartApi.mjs';

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

/** Mismos valores que compose.yaml le da al contenedor del navegador. */
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
    '--disable-blink-features=AutomationControlled',
    '--disable-features=OptimizationHints,PasswordManagerOnboarding,Translate',
    '--disable-search-engine-choice-screen',
    '--no-default-browser-check',
    '--no-first-run',
    // Que la ventana llene la pantalla remota. Flotando sobre un escritorio
    // vacio se ve como si uno estuviera mirando el computador de otra persona,
    // y nadie mete su compra ahi. Llenando el marco se lee como lo que es: un
    // navegador que Convive maneja para ti.
    // Kiosco: sin pestanas, sin barra de direcciones, sin botones de ventana.
    // Flotando con su marco sobre un escritorio vacio, la sesion se leia como el
    // computador de otra persona y nadie mete su compra ahi. El dominio del
    // supermercado se muestra en la cabecera de Convive, que la tienda no puede
    // falsificar, asi que no se pierde la senal de en que sitio se esta.
    // Kiosco y nada mas. `--start-maximized` y `--window-size` piden una ventana
    // con medidas, que es lo contrario de pantalla completa: entre las dos
    // ordenes gana la ultima y el kiosco se pierde.
    '--kiosk',
  );
  // Excluir 'enable-automation' y apagar 'AutomationControlled' es imprescindible
  // para que los desafios humanos (PerimeterX / HUMAN en Lider, Cloudflare Turnstile)
  // no queden en bucle infinito ("..."): cuando navigator.webdriver === true, el
  // backend anti-bot de la tienda rechaza silenciosamente la respuesta del usuario
  // aunque este mantenga presionado el boton en pantalla. Ademas elimina la barra
  // de 56 px de aviso, completando el modo kiosco al 100%.
  //
  // Sin user-agent fijo a proposito: uno inventado ("Windows / Chrome 130") en
  // un Chromium de Linux mas nuevo contradice a navigator.userAgentData, los
  // client hints y el renderer. PerimeterX cruza esas senales y la incoherencia
  // es por si sola motivo de bloqueo; el UA real es coherente consigo mismo.
  options.excludeSwitches('enable-automation');
  const proxyServer = process.env.SUPERMARKET_HTTP_PROXY?.trim();
  if (proxyServer) {
    options.addArguments(`--proxy-server=${proxyServer}`);
  }
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
  // `script` cubre executeAsyncScript: la carga por API de Lider baja el bundle
  // del sitio y llama a GraphQL a traves del proxy residencial, que suma latencia.
  await driver.manage().setTimeouts({ implicit: 0, pageLoad: 60_000, script: 45_000 });

  // Nada de sendDevToolsCommand para ocultar navigator.webdriver: abrir el
  // protocolo CDP es en si mismo una senal que PerimeterX detecta, y con
  // AutomationControlled apagado la propiedad ya queda en false nativamente.

  await warnIfBrowserChromeVisible(driver);
  return driver;
}

/**
 * El kiosco se pierde en silencio: la sesion sigue funcionando, solo se ve mal.
 * Medir el alto de las barras deja el sintoma en los logs en vez de esperar a
 * que alguien mande una captura.
 */
const EXPECTED_CHROME_HEIGHT = 80;

async function warnIfBrowserChromeVisible(driver) {
  try {
    const height = await driver.executeScript(
      'return window.outerHeight - window.innerHeight;',
    );
    if (Number(height) > EXPECTED_CHROME_HEIGHT) {
      console.warn(`[cart] la ventana no quedo en kiosco: ${height} px de barras`);
    }
  } catch {
    // Medir es opcional; que falle no puede tumbar una sesion de compra.
  }
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
  const deadline = Date.now() + 25_000;
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
  const reachable = await driver.executeScript(`
    const element = arguments[0];
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return top === element || element.contains(top);
  `, element).catch(() => true);
  if (!reachable) {
    await driver.executeScript('arguments[0].click()', element);
    return;
  }
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
        added: result.quantityComplete,
        detail: result.quantityComplete
          ? `Carga intentada con cantidad ${item.quantity}; pendiente de comprobar en el carro.`
          : 'No se completó la cantidad solicitada; revisa este producto en el carro.',
      };
    }
    if (result.kind === 'unavailable') {
      return { added: false, detail: 'Producto sin stock; vuelve a Convive para elegir un reemplazo.' };
    }

    const detail = result.kind === 'blocked'
      ? 'La tienda pide una verificación humana. Complétala en el navegador y continúa.'
      : result.kind === 'intervention'
        ? 'La tienda necesita ubicación, despacho o inicio de sesión. Completa el paso y continúa.'
        : result.kind === 'unconfirmed'
          ? 'Hicimos clic en agregar, pero el carro no cambió. Revisa si la tienda pide algo más y continúa.'
          : 'No encontramos el botón de agregar. Agrégalo manualmente si aparece y luego continúa.';
    const resumed = await hooks.waitForUser(detail);
    if (!resumed) hooks.assertOpen();
    const after = await cartSignature(driver, session.config);
    if (result.before && after && after !== result.before) {
      return { added: false, detail: 'La página cambió después de tu intervención; falta comprobar producto y cantidad en el carro.' };
    }
    if (attempt < 2) await sleep(500);
  }
  return { added: false, detail: 'No fue posible confirmar este producto en el carro.' };
}

async function directCartVerified(driver, session) {
  const mode = session.config.cartMode;
  if (mode !== 'vtex' && mode !== 'shopify') return false;
  const endpoint = mode === 'vtex' ? '/api/checkout/pub/orderForm' : '/cart.js';
  const payload = await driver.executeAsyncScript(`
    const endpoint = arguments[0];
    const done = arguments[arguments.length - 1];
    fetch(endpoint, { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(response => response.ok ? response.json() : null)
      .then(payload => done(payload))
      .catch(() => done(null));
  `, endpoint).catch(() => null);
  return verifyDirectCart(session.directCartUrl, mode, payload);
}

async function processDirectCart(driver, session, hooks) {
  await navigate(driver, session.directCartUrl);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    hooks.assertOpen();
    if (await directCartVerified(driver, session)) return true;
    const text = await bodyText(driver);
    const detail = containsAny(text, BLOCKED_TEXT)
      ? 'La tienda pide una verificación humana. Complétala y continúa.'
      : 'Revisa ubicación o inicio de sesión; aún no pudimos confirmar el carro y sus cantidades.';
    if (!await hooks.waitForUser(detail)) hooks.assertOpen();
    if (await directCartVerified(driver, session)) return true;
    // Reopening an add URL can duplicate products already present.
  }
  return false;
}

async function readCartTotal(driver) {
  return parseCartTotal(await bodyText(driver));
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

async function currentHost(driver) {
  try {
    return new URL(await driver.getCurrentUrl()).hostname;
  } catch {
    return '';
  }
}

/**
 * Camino rapido de Lider: una navegacion a super.lider.cl y una llamada a la
 * API de la tienda con toda la canasta. Devuelve los items que siguen
 * pendientes para el recorrido por fichas: los que no traen sku/offerId y los
 * que la tienda no confirmo. Si la API no esta disponible (contrato cambiado,
 * sin release-metadata, etc.) no se asume nada y todo cae al recorrido.
 */
async function processLiderApi(driver, session, hooks) {
  const config = session.config;
  const eligible = apiEligibleItems(session.items);
  if (!config.cartApi || eligible.length === 0) return session.items;

  hooks.update({
    status: 'loading',
    current: 0,
    detail: `Abriendo ${session.store} para cargar ${eligible.length} productos de una vez…`,
  });
  await navigate(driver, config.cartApiUrl);

  let landed = null;
  for (let attempt = 0; attempt < 3 && !landed; attempt += 1) {
    hooks.assertOpen();
    const text = await bodyText(driver);
    const onApiHost = config.cartApiHosts.includes(await currentHost(driver));
    if (!onApiHost || containsAny(text, BLOCKED_TEXT) || containsAny(text, INTERVENTION_TEXT)) {
      const detail = containsAny(text, BLOCKED_TEXT)
        ? 'La tienda pide una verificación humana. Complétala en el navegador y continúa.'
        : 'La tienda necesita ubicación, despacho o inicio de sesión. Completa el paso y continúa.';
      if (!await hooks.waitForUser(detail)) hooks.assertOpen();
      if (!config.cartApiHosts.includes(await currentHost(driver))) await navigate(driver, config.cartApiUrl);
      continue;
    }

    const outcome = await driver
      .executeAsyncScript(LIDER_CART_API_SCRIPT, apiRequestItems(eligible))
      .catch(error => ({ ok: false, reason: error?.message || String(error) }));
    if (!outcome?.ok) {
      console.warn(`[cart] Lider API no disponible: ${outcome?.reason || 'sin respuesta'}`);
      break;
    }
    landed = parseLiderCartResponse(outcome.payload);
    if (!landed) {
      console.warn(`[cart] Lider API respondio ${outcome.status} sin lineItems; se sigue por fichas.`);
      break;
    }
  }
  if (!landed) {
    hooks.update({ detail: 'La carga rápida no estuvo disponible; se cargará producto por producto.' });
    return session.items;
  }

  const { confirmed, unconfirmed } = confirmLiderItems(eligible, landed);
  for (const entry of unconfirmed) console.warn(`[cart] Lider API: ${entry.item.name}: ${entry.detail}`);
  const confirmedIds = new Set(confirmed.map(entry => entry.item.id));
  const pending = session.items.filter(item => !confirmedIds.has(item.id));
  hooks.update({
    current: confirmed.length,
    detail: pending.length === 0
      ? `${confirmed.length} productos confirmados por ${session.store}.`
      : `${confirmed.length} de ${session.items.length} confirmados por ${session.store}; el resto se carga producto por producto.`,
  });
  return pending;
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
      status: confirmed && session.missingItems.length === 0 ? 'ready' : 'partial',
      current: session.total,
      added: confirmed ? session.plannedCount : 0,
      failed: confirmed ? 0 : session.plannedCount,
      detail: confirmed
        ? `Carro verificado con ${session.plannedCount} productos. Revísalo antes de pagar.`
        : 'El carro quedó abierto, pero no pudimos verificar automáticamente todos los productos.',
    });
    return;
  }

  // Lo que la API confirmo ya esta en el carro; por fichas va solo el resto.
  // Para tiendas sin API `pending` es la lista completa y nada cambia.
  const pending = await processLiderApi(driver, session, hooks);
  const offset = session.items.length - pending.length;
  for (let index = 0; index < pending.length; index += 1) {
    hooks.assertOpen();
    const item = pending[index];
    hooks.update({
      status: 'loading',
      current: offset + index + 1,
      itemName: item.name,
      detail: `Cargando producto ${offset + index + 1} de ${session.items.length}…`,
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
  // La tienda ya muestra su total aca. Es el unico numero real que tenemos para
  // Lider y aCuenta, que no exponen una simulacion como las cadenas VTEX.
  session.cartTotal = await readCartTotal(driver).catch(() => 0);
  let verified = false;
  if (session.store === 'Lider') {
    const links = await driver.executeScript(`
      return [...document.querySelectorAll('a[href]')]
        .filter(a => /en el carro/i.test(a.getAttribute('aria-label') || ''))
        .map(a => ({ href: a.href, label: a.getAttribute('aria-label') }));
    `).catch(() => []);
    const result = verifyLiderCart(session.items, links);
    session.added = result.verified;
    session.failed = session.items.length - result.verified;
    const attemptedNames = new Set(session.items.map(item => item.name));
    session.missingItems = [...new Set([
      ...session.missingItems.filter(name => !attemptedNames.has(name)),
      ...result.missingItems,
      ...(result.unexpectedProducts.length > 0 ? ['El carro contiene productos no solicitados.'] : []),
    ])];
    verified = result.complete && session.missingItems.length === 0;
  } else {
    // These stores expose no cart API that lets us prove the final SKU and
    // quantity. A click or changing header is only an attempt, so every item
    // remains pending until the buyer checks the retailer's cart.
    session.added = 0;
    session.failed = session.items.length;
    session.missingItems = [...new Set([
      ...session.missingItems,
      ...session.items.map(item => item.name),
    ])];
  }
  hooks.update({
    status: verified ? 'ready' : 'partial',
    current: session.total,
    itemName: '',
    cartTotal: session.cartTotal,
    detail: verified
      ? `Productos y cantidades verificados: ${session.added}. El acceso al pago aún depende de la tienda.`
      : 'Carga terminada con revisión pendiente: no pudimos comprobar todos los productos y cantidades. El inicio de sesión o pago no está verificado.',
  });
}
