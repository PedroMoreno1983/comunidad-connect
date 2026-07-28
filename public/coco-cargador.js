/*
 * CoCo · Cargador de carros (versión bookmarklet)
 *
 * Se inyecta desde un marcador del navegador en la pestaña del supermercado,
 * con la sesión del comprador ya iniciada. No es una extensión: no necesita
 * instalación ni permisos especiales del navegador.
 *
 * Diferencia clave con extensions/convive-cart-loader (que hace lo mismo vía
 * chrome.tabs.update): un bookmarklet muere en cuanto la pestaña navega, así
 * que aquí NUNCA se navega la pestaña visible. Cada producto se carga dentro
 * de un iframe oculto del mismo origen, se agrega al carro ahí, y la pestaña
 * visible solo se recarga al final para reflejar el carro actualizado.
 *
 * Esto exige que la tienda permita auto-enmarcarse (X-Frame-Options:
 * SAMEORIGIN). Verificado 2026-07: Lider, Jumbo, Santa Isabel, Unimarc y
 * Tottus lo permiten. aCuenta e Irurzun responden DENY, así que ahí se cae a
 * un modo asistido de un producto por clic (ver MODO_ASISTIDO).
 *
 * Nunca confirma la compra ni paga: solo deja el carro preparado.
 */
(() => {
  const VERSION = '1.0.0';
  const CONTAINER_ID = 'coco-cargador';
  const MAX_ITEMS = 200;
  const PLAN_ENDPOINT = 'https://conviveconnect.com/api/supermarket/cart-plan/';

  if (document.getElementById(CONTAINER_ID)) {
    window.alert('CoCo ya está cargando productos en esta pestaña.');
    return;
  }

  // ── Configuración por tienda ────────────────────────────────────────────
  // Mantener alineado con extensions/convive-cart-loader/store-config.js.
  const blockedText = [
    'robot or human', 'robot o humano', 'confirma que eres humano',
    'confirm that you are human', 'activate and hold',
    'verificacion de seguridad', 'verificación de seguridad',
    'security verification', 'un momento',
  ];

  const locationText = [
    'como quieres recibir tu compra', 'cómo quieres recibir tu compra',
    'elige un metodo de entrega', 'elige un método de entrega',
    'elige tu modo de entrega', 'selecciona tu comuna', 'selecciona una comuna',
    'despacho a domicilio retiro en tienda',
  ];

  const cencosud = {
    addSelectors: [
      'button[data-cnstrc-btn="add_to_cart"]',
      'button.product-add-cart[aria-label="Agregar"]',
    ],
    plusSelectors: [
      'button.product-change-quantity-btn.add',
      'button[aria-label="Agregar otro"]',
    ],
    quantitySelectors: ['.product-control input[type="number"]', '.product-control [data-quantity]'],
    cartSelectors: ['button[aria-label*="carro de compras"]'],
  };

  const STORES = {
    Lider: {
      label: 'Lider',
      hosts: ['super.lider.cl', 'www.lider.cl', 'lider.cl'],
      searchUrl: q => `https://www.lider.cl/supermercado/search?query=${encodeURIComponent(q)}`,
      addSelectors: [
        '[data-testid*="add-to-cart"]', 'button[aria-label*="Agregar al carro"]',
        'button[aria-label="Agregar"]', 'button[class*="add-to-cart"]',
      ],
      plusSelectors: [
        'button[aria-label*="Aumentar"]', 'button[aria-label*="Agregar otro"]',
        'button[data-testid*="increment"]',
      ],
      quantitySelectors: ['input[aria-label*="Cantidad"]', '[data-testid*="quantity"] input'],
      cartSelectors: ['button[aria-label*="El carro tiene"]', '[data-testid*="cart"]'],
      framable: true,
    },
    Jumbo: {
      label: 'Jumbo',
      hosts: ['www.jumbo.cl', 'jumbo.cl'],
      searchUrl: q => `https://www.jumbo.cl/busqueda?ft=${encodeURIComponent(q)}`,
      ...cencosud,
      framable: true,
    },
    'Santa Isabel': {
      label: 'Santa Isabel',
      hosts: ['www.santaisabel.cl', 'santaisabel.cl'],
      searchUrl: q => `https://www.santaisabel.cl/busqueda?ft=${encodeURIComponent(q)}`,
      ...cencosud,
      framable: true,
    },
    Unimarc: {
      label: 'Unimarc',
      hosts: ['www.unimarc.cl', 'unimarc.cl'],
      searchUrl: q => `https://www.unimarc.cl/search?q=${encodeURIComponent(q)}&suggestions=true`,
      addSelectors: [
        '[aria-label="Agregar"]', 'svg[aria-label="Agregar al carrito"]',
        '[class*="ShelfAddToCart_addToCart"]',
      ],
      plusSelectors: [
        'button[aria-label="Agregar otro"]', '[aria-label*="Aumentar"]',
        'svg[aria-label*="Agregar al carrito"]', '[class*="ShelfAddToCart"] [aria-label="Agregar"]',
      ],
      quantitySelectors: ['[class*="ShelfAddToCart"] input', '[class*="ShelfAddToCart"] [class*="quantity"]'],
      cartSelectors: ['[aria-label*="carrito"]', '[class*="Cart"] [class*="quantity"]'],
      framable: true,
    },
    Tottus: {
      label: 'Tottus',
      hosts: ['www.tottus.cl', 'tottus.cl'],
      searchUrl: q => `https://www.tottus.cl/tottus-cl/buscar?Ntt=${encodeURIComponent(q)}`,
      addSelectors: [
        'button[data-testid*="add-to-cart"]', 'button[aria-label*="Agregar"]',
        'button[class*="add-to-cart"]', 'button[class*="AddToCart"]',
      ],
      plusSelectors: [
        'button[aria-label*="Aumentar"]', 'button[aria-label*="Agregar otro"]',
        'button[data-testid*="increment"]',
      ],
      quantitySelectors: ['input[aria-label*="Cantidad"]', '[data-testid*="quantity"] input'],
      cartSelectors: ['[data-testid*="cart"]', 'button[aria-label*="carro"]'],
      framable: true,
    },
    aCuenta: {
      label: 'aCuenta',
      hosts: ['www.acuenta.cl', 'acuenta.cl'],
      searchUrl: q => `https://www.acuenta.cl/busqueda?ft=${encodeURIComponent(q)}`,
      addSelectors: [
        'button[data-add-button="true"]', '[data-testid="detail-cart-quantifier"] button',
        'button[class*="add__remove__product"]',
      ],
      plusSelectors: [
        'button[aria-label="Agregar otro"]', 'button[data-plus-button="true"]',
        'button[aria-label*="Aumentar"]', '[data-testid*="cart-quantifier"] button:last-of-type',
      ],
      quantitySelectors: ['[data-testid*="cart-quantifier"] input', '[data-testid*="cart-quantifier"] [class*="quantity"]'],
      cartSelectors: ['[data-testid="header-cart-button"]', '[data-testid*="cart-count"]'],
      framable: false,
    },
    Irurzun: {
      label: 'Irurzun',
      hosts: ['irurzun.cl', 'www.irurzun.cl'],
      searchUrl: q => `https://irurzun.cl/search?q=${encodeURIComponent(q)}`,
      addSelectors: [
        'button.sticky-add-to-cart__button', 'button[data-testid="standalone-add-to-cart"]',
        'button[name="add"].add-to-cart-button',
      ],
      plusSelectors: ['button[aria-label="Agregar otro"]', 'button[name="plus"]', 'button.quantity-plus'],
      quantitySelectors: ['input[name="quantity"]'],
      cartSelectors: ['[data-testid="cart-drawer-trigger"]', 'button[aria-label="Carrito"]'],
      allowHiddenControls: true,
      quantityBeforeAdd: true,
      quantityControlAddsToCart: true,
      framable: false,
    },
  };

  const store = Object.values(STORES).find(config => config.hosts.includes(window.location.hostname));
  if (!store) {
    window.alert(
      'CoCo no reconoce este sitio.\n\n'
      + 'Abre primero el supermercado que elegiste en Convive (Lider, Jumbo, '
      + 'Santa Isabel, Unimarc, Tottus, aCuenta o Irurzun), inicia sesión ahí, '
      + 'y recién entonces pulsa el marcador de CoCo.',
    );
    return;
  }

  // ── Utilidades de DOM (operan sobre un documento arbitrario: la página
  //    visible en modo asistido, o el documento del iframe en modo automático)
  const normalize = value => String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const isVisible = (element, view) => {
    if (!(element instanceof view.Element)) return false;
    const style = view.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  };

  const isEnabled = element => !element.hasAttribute('disabled')
    && element.getAttribute('aria-disabled') !== 'true';

  const elementLabel = element => normalize([
    element?.textContent, element?.getAttribute?.('aria-label'),
    element?.getAttribute?.('title'), element?.getAttribute?.('data-testid'),
    element?.getAttribute?.('name'),
  ].filter(Boolean).join(' '));

  const firstVisible = (selectors, doc, view, allowHidden) => {
    for (const selector of selectors) {
      const element = [...doc.querySelectorAll(selector)].find(candidate => (
        (allowHidden || isVisible(candidate, view)) && isEnabled(candidate)
      ));
      if (element) return element;
    }
    return null;
  };

  const findAddControl = (doc, view) => {
    const configured = firstVisible(store.addSelectors, doc, view, store.allowHiddenControls);
    if (configured) return configured;
    const forbidden = ['direccion', 'lista', 'favorito', 'medio de pago'];
    return [...doc.querySelectorAll('[data-testid*="add-to-cart"],[class*="add-to-cart"],button,[role="button"],[tabindex="0"]')]
      .filter(element => isVisible(element, view) && isEnabled(element))
      .map(element => {
        const label = elementLabel(element);
        const exactAdd = label === 'agregar' || label === 'anadir' || label === 'agregar al carrito';
        const cartIntent = label.includes('agregar al carro') || label.includes('add to cart');
        const testIdIntent = normalize(element.getAttribute('data-testid')).includes('add to cart');
        return {
          element,
          insideProductLink: Boolean(element.closest('a[href]')),
          forbiddenLabel: forbidden.some(fragment => label.includes(fragment)),
          score: testIdIntent ? 100 : exactAdd ? 90 : cartIntent ? 80 : 0,
        };
      })
      .filter(c => c.score > 0 && !c.insideProductLink && !c.forbiddenLabel)
      .sort((a, b) => b.score - a.score)[0]?.element || null;
  };

  const findPlusControl = (doc, view, preferredRoot) => {
    if (preferredRoot?.isConnected) {
      const nearby = firstVisible(store.plusSelectors, preferredRoot, view, store.allowHiddenControls);
      if (nearby) return nearby;
    }
    return firstVisible(store.plusSelectors, doc, view, store.allowHiddenControls);
  };

  const pageIsBlocked = doc => {
    const text = normalize(doc.body?.innerText).slice(0, 20000);
    return blockedText.some(fragment => text.includes(normalize(fragment)));
  };

  const needsDeliveryChoice = (doc, view) => [...doc.querySelectorAll(
    'dialog,[role="dialog"],[aria-modal="true"],[class*="modal"],[class*="Modal"],[class*="drawer"],[class*="Drawer"]',
  )].filter(element => isVisible(element, view)).some(container => {
    const text = normalize(container.textContent);
    return locationText.some(fragment => text.includes(normalize(fragment)));
  });

  const tokenScore = (candidate, expected) => {
    const candidateTokens = new Set(normalize(candidate).split(' ').filter(t => t.length > 1));
    const expectedTokens = normalize(expected).split(' ').filter(t => t.length > 1);
    if (expectedTokens.length === 0) return 0;
    return expectedTokens.filter(token => candidateTokens.has(token)).length / expectedTokens.length;
  };

  const findBestProductLink = (doc, view, item) => [...doc.querySelectorAll('a[href]')]
    .filter(element => isVisible(element, view))
    .map(anchor => ({
      anchor,
      score: tokenScore([
        anchor.textContent,
        anchor.querySelector('img')?.getAttribute('alt'),
        anchor.closest('[data-cnstrc-item-name]')?.getAttribute('data-cnstrc-item-name'),
      ].filter(Boolean).join(' '), item.name),
    }))
    .filter(candidate => candidate.score >= 0.72)
    .sort((a, b) => b.score - a.score)[0]?.anchor || null;

  const parseCartCount = (doc, view) => {
    for (const selector of store.cartSelectors) {
      for (const element of [...doc.querySelectorAll(selector)].filter(e => isVisible(e, view))) {
        const label = [element.textContent, element.getAttribute('aria-label'), element.getAttribute('title')]
          .filter(Boolean).join(' ');
        const cartMatch = label.match(/(?:carro|carrito|cart)[^\d]{0,30}(\d{1,4})/i);
        if (cartMatch) return Number(cartMatch[1]);
        const plainMatch = label.trim().match(/^(\d{1,4})$/);
        if (plainMatch) return Number(plainMatch[1]);
      }
    }
    return null;
  };

  const quantitySignature = (doc, view) => store.quantitySelectors.map(selector => (
    [...doc.querySelectorAll(selector)].filter(e => isVisible(e, view))
      .map(e => e instanceof view.HTMLInputElement ? e.value : elementLabel(e)).join('|')
  )).join('::');

  const plusCount = (doc, view) => store.plusSelectors.reduce((sum, selector) => (
    sum + [...doc.querySelectorAll(selector)].filter(e => isVisible(e, view)).length
  ), 0);

  const snapshot = (doc, view, addControl) => ({
    addLabel: elementLabel(addControl),
    addVisible: isVisible(addControl, view),
    cartCount: parseCartCount(doc, view),
    quantity: quantitySignature(doc, view),
    plus: plusCount(doc, view),
  });

  // Solo confirma un producto cuando el carro cambió de verdad -- nunca por el
  // simple hecho de haber hecho clic (evita reportar éxitos falsos).
  const additionVerified = (doc, view, addControl, before) => {
    const afterCount = parseCartCount(doc, view);
    if (before.cartCount !== null && afterCount !== null && afterCount > before.cartCount) return true;
    if (!addControl.isConnected || (before.addVisible && !isVisible(addControl, view))) return true;
    const afterLabel = elementLabel(addControl);
    if (afterLabel && afterLabel !== before.addLabel && !afterLabel.includes('agregar')) return true;
    const afterQuantity = quantitySignature(doc, view);
    if (afterQuantity && afterQuantity !== before.quantity) return true;
    return plusCount(doc, view) > before.plus;
  };

  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  const waitFor = (check, timeoutMs = 20000) => new Promise(resolve => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      let result = null;
      try { result = check(); } catch { result = null; }
      if (result || Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer);
        resolve(result || null);
      }
    }, 350);
  });

  // ── Interfaz del cargador ───────────────────────────────────────────────
  const ui = document.createElement('aside');
  ui.id = CONTAINER_ID;
  ui.style.cssText = [
    'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
    'width:320px', 'max-width:calc(100vw - 32px)', 'background:#12100e',
    'color:#f5f1ea', 'border-radius:14px', 'padding:16px',
    'box-shadow:0 18px 48px rgba(0,0,0,.34)', 'font:14px/1.45 system-ui,sans-serif',
  ].join(';');
  ui.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <strong style="font-size:14px">CoCo está preparando tu carro</strong>
      <span data-coco="store" style="font-size:11px;opacity:.7;white-space:nowrap"></span>
    </div>
    <div style="margin:12px 0 8px;height:6px;border-radius:99px;background:rgba(245,241,234,.16);overflow:hidden">
      <span data-coco="bar" style="display:block;height:100%;width:0;background:#c8783c;transition:width .3s"></span>
    </div>
    <p data-coco="detail" style="margin:0;font-size:13px">Conectando con Convive…</p>
    <p data-coco="item" style="margin:6px 0 0;font-size:12px;opacity:.72"></p>
    <button data-coco="action" hidden type="button" style="margin-top:12px;width:100%;padding:9px;border:0;border-radius:9px;background:#c8783c;color:#fff;font-weight:600;cursor:pointer"></button>
    <p style="margin:10px 0 0;font-size:11px;opacity:.6">CoCo solo agrega productos. Nunca confirma ni paga la compra.</p>
  `;
  document.documentElement.appendChild(ui);

  const el = name => ui.querySelector(`[data-coco="${name}"]`);
  el('store').textContent = `${store.label} · v${VERSION}`;

  const render = ({ done = 0, total = 0, detail, item }) => {
    el('bar').style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
    if (detail) el('detail').textContent = detail;
    el('item').textContent = item ? `${done + 1} de ${total} · ${item}` : (total ? `${done} de ${total}` : '');
  };

  const showAction = (label, handler) => {
    const button = el('action');
    button.hidden = false;
    button.disabled = false;
    button.textContent = label;
    button.onclick = () => { button.disabled = true; handler(); };
  };

  const hideAction = () => { el('action').hidden = true; };

  // ── Obtención del plan de compra ────────────────────────────────────────
  async function fetchPlan() {
    const raw = window.prompt(
      `Pega aquí el código que te mostró CoCo para cargar tu compra en ${store.label}:`,
    );
    const code = String(raw || '').trim().toUpperCase();
    if (!code) return null;
    if (!/^[A-Z0-9]{4,12}$/.test(code)) throw new Error('El código no tiene un formato válido.');

    const response = await fetch(PLAN_ENDPOINT + encodeURIComponent(code), { mode: 'cors' });
    if (response.status === 404) throw new Error('Ese código no existe, ya se usó o expiró. Genera uno nuevo en Convive.');
    if (!response.ok) throw new Error(`No se pudo obtener la lista (HTTP ${response.status}).`);

    const plan = await response.json();
    if (plan?.store !== store.label) {
      throw new Error(`Esa lista es para ${plan?.store || 'otra tienda'}, no para ${store.label}.`);
    }
    const items = Array.isArray(plan.items) ? plan.items.slice(0, MAX_ITEMS) : [];
    if (items.length === 0) throw new Error('La lista llegó vacía.');
    return items.map((item, index) => ({
      id: String(item?.id || `item-${index + 1}`).slice(0, 100),
      name: String(item?.name || '').trim().slice(0, 240),
      quantity: Math.min(99, Math.max(1, Math.round(Number(item?.quantity) || 1))),
      productUrl: typeof item?.productUrl === 'string' ? item.productUrl : undefined,
    })).filter(item => item.name);
  }

  // ── Agregado de un producto dentro de un documento dado ─────────────────
  async function addItemIn(doc, view, item) {
    if (pageIsBlocked(doc)) return { status: 'blocked' };
    if (needsDeliveryChoice(doc, view)) return { status: 'delivery' };

    // Si caímos en resultados de búsqueda, entrar al producto que mejor calce.
    let addControl = findAddControl(doc, view);
    if (!addControl) {
      const link = await waitFor(() => findBestProductLink(doc, view, item), 12000);
      if (link?.href) return { status: 'navigate', url: link.href };
      addControl = await waitFor(() => findAddControl(doc, view), 8000);
    }
    if (!addControl) return { status: 'failed', detail: 'No se encontró un botón de agregar disponible.' };

    const preferredRoot = addControl.closest(
      'article,li,[data-testid*="product"],[data-testid*="quantifier"],[class*="product-control"],[class*="product-form"],product-form',
    );

    let addedDuringQuantity = false;
    if (store.quantityBeforeAdd && item.quantity > 1) {
      const cartBefore = parseCartCount(doc, view);
      let clicks = 0;
      for (let index = 1; index < item.quantity; index += 1) {
        const plus = await waitFor(() => findPlusControl(doc, view, preferredRoot), 5000);
        if (!plus) break;
        plus.click();
        clicks += 1;
        await sleep(450);
      }
      const cartAfter = parseCartCount(doc, view);
      addedDuringQuantity = (store.quantityControlAddsToCart && clicks === item.quantity - 1)
        || (clicks > 0 && cartAfter !== null && cartAfter > (cartBefore ?? 0));
      addControl = findAddControl(doc, view) || addControl;
    }

    const before = snapshot(doc, view, addControl);
    if (!addedDuringQuantity) addControl.click();

    const outcome = addedDuringQuantity ? 'added' : await waitFor(() => {
      if (pageIsBlocked(doc)) return 'blocked';
      if (needsDeliveryChoice(doc, view)) return 'delivery';
      if (additionVerified(doc, view, addControl, before)) return 'added';
      return null;
    }, 8000);

    if (outcome === 'blocked') return { status: 'blocked' };
    if (outcome === 'delivery') return { status: 'delivery' };
    if (outcome !== 'added') {
      return {
        status: 'failed',
        detail: 'El sitio recibió el clic pero el carro no cambió; se deja pendiente para no informar un éxito falso.',
      };
    }

    if (!store.quantityBeforeAdd && item.quantity > 1) {
      for (let index = 1; index < item.quantity; index += 1) {
        const plus = await waitFor(() => findPlusControl(doc, view, preferredRoot), 5000);
        if (!plus) break;
        plus.click();
        await sleep(450);
      }
    }
    return { status: 'added' };
  }

  // ── Modo automático: cada producto se carga en un iframe del mismo origen,
  //    así la pestaña visible nunca navega y el script sobrevive.
  function openFrame(url) {
    return new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:900px;border:0;opacity:0';
      frame.setAttribute('aria-hidden', 'true');
      const timer = window.setTimeout(() => {
        frame.remove();
        reject(new Error('La tienda tardó demasiado en responder.'));
      }, 30000);
      frame.onload = () => {
        window.clearTimeout(timer);
        try {
          if (!frame.contentDocument) throw new Error('sin acceso');
          resolve(frame);
        } catch {
          frame.remove();
          reject(new Error(`${store.label} bloqueó la carga en segundo plano.`));
        }
      };
      frame.onerror = () => {
        window.clearTimeout(timer);
        frame.remove();
        reject(new Error('No se pudo abrir la página del producto.'));
      };
      frame.src = url;
      document.body.appendChild(frame);
    });
  }

  async function runAutomatic(items) {
    let done = 0;
    const failed = [];

    for (const item of items) {
      render({ done, total: items.length, item: item.name, detail: `Buscando ${item.name}…` });
      let frame = null;
      try {
        frame = await openFrame(item.productUrl || store.searchUrl(item.name));
        await sleep(1200);
        let result = await addItemIn(frame.contentDocument, frame.contentWindow, item);

        // Un solo salto de resultados de búsqueda a la ficha del producto.
        if (result.status === 'navigate') {
          frame.remove();
          frame = await openFrame(result.url);
          await sleep(1200);
          result = await addItemIn(frame.contentDocument, frame.contentWindow, item);
        }

        if (result.status === 'blocked' || result.status === 'delivery') {
          frame?.remove();
          const message = result.status === 'blocked'
            ? `${store.label} pide una verificación humana (CAPTCHA).`
            : `${store.label} necesita que elijas despacho, retiro o comuna.`;
          render({ done, total: items.length, detail: `${message} Resuélvelo en esta pestaña y reanuda.` });
          await new Promise(resolve => showAction('Reanudar carga', resolve));
          hideAction();
          continue;
        }

        if (result.status === 'added') done += 1;
        else failed.push({ name: item.name, detail: result.detail });
      } catch (error) {
        failed.push({ name: item.name, detail: error instanceof Error ? error.message : 'Error inesperado.' });
      } finally {
        frame?.remove();
      }
      await sleep(500);
    }

    return { done, failed };
  }

  // ── Modo asistido: para tiendas que bloquean el enmarcado (aCuenta,
  //    Irurzun). La pestaña sí navega, así que el script no sobrevive: se
  //    guarda el avance y la persona pulsa el marcador otra vez por producto.
  const RESUME_KEY = 'coco-cargador-pendiente';

  function saveAssisted(state) {
    try { window.sessionStorage.setItem(RESUME_KEY, JSON.stringify(state)); } catch { /* sin sessionStorage */ }
  }

  function loadAssisted() {
    try {
      const raw = window.sessionStorage.getItem(RESUME_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function runAssisted(state) {
    const { items, index } = state;
    const item = items[index];
    if (!item) {
      window.sessionStorage.removeItem(RESUME_KEY);
      render({ done: items.length, total: items.length, detail: `Carro de ${store.label} completo.` });
      return;
    }

    render({
      done: index,
      total: items.length,
      item: item.name,
      detail: `${store.label} no permite carga en segundo plano, así que vamos de a un producto.`,
    });

    const result = await addItemIn(document, window, item);
    if (result.status === 'navigate') {
      saveAssisted({ ...state, index });
      window.location.assign(result.url);
      return;
    }

    saveAssisted({ ...state, index: index + 1 });
    const remaining = items.length - index - 1;
    const message = result.status === 'added'
      ? `${item.name} agregado.`
      : `${item.name} quedó pendiente: ${result.detail || 'no se pudo confirmar.'}`;

    if (remaining === 0) {
      window.sessionStorage.removeItem(RESUME_KEY);
      render({ done: index + 1, total: items.length, detail: `${message} Carro completo, revisa y paga cuando quieras.` });
      return;
    }

    render({ done: index + 1, total: items.length, detail: `${message} Quedan ${remaining}.` });
    showAction(`Cargar siguiente (${remaining})`, () => {
      const next = items[index + 1];
      window.location.assign(next.productUrl || store.searchUrl(next.name));
    });
  }

  // ── Arranque ────────────────────────────────────────────────────────────
  void (async () => {
    try {
      if (!store.framable) {
        const pending = loadAssisted();
        const items = pending?.items || await fetchPlan();
        if (!items) { ui.remove(); return; }
        await runAssisted(pending || { items, index: 0 });
        return;
      }

      const items = await fetchPlan();
      if (!items) { ui.remove(); return; }

      render({ done: 0, total: items.length, detail: `Cargando ${items.length} productos en ${store.label}…` });
      const { done, failed } = await runAutomatic(items);

      const summary = failed.length === 0
        ? `Listo: ${done} productos agregados. Revisa el carro y paga cuando quieras.`
        : `${done} agregados y ${failed.length} pendientes: ${failed.slice(0, 3).map(f => f.name).join(', ')}${failed.length > 3 ? '…' : ''}`;
      render({ done, total: items.length, detail: summary });
      showAction('Ver mi carro', () => window.location.reload());
    } catch (error) {
      render({ detail: error instanceof Error ? error.message : 'La carga se detuvo por un error inesperado.' });
      showAction('Cerrar', () => ui.remove());
    }
  })();
})();
