(() => {
  const STORE_CONFIGS = globalThis.CONVIVE_STORE_CONFIGS;
  const PAGE_SIGNALS = globalThis.CONVIVE_PAGE_SIGNALS;

  function runtimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) !== 0
      && rect.width > 0
      && rect.height > 0;
  }

  function isEnabled(element) {
    return !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true';
  }

  function elementLabel(element) {
    return normalize([
      element?.textContent,
      element?.getAttribute?.('aria-label'),
      element?.getAttribute?.('title'),
      element?.getAttribute?.('data-testid'),
      element?.getAttribute?.('name'),
    ].filter(Boolean).join(' '));
  }

  function firstVisible(selectors, root = document, allowHidden = false) {
    for (const selector of selectors) {
      const element = [...root.querySelectorAll(selector)].find(candidate => (
        (allowHidden || isVisible(candidate)) && isEnabled(candidate)
      ));
      if (element) return element;
    }
    return null;
  }

  function cartControlCandidates(config) {
    const scored = new Map();
    const offer = (candidate, score) => {
      if (!(candidate instanceof Element)) return;
      const element = candidate.matches('a[href],button,[role="button"]')
        ? candidate
        : candidate.closest('a[href],button,[role="button"]');
      if (!element || !isVisible(element) || !isEnabled(element)) return;
      if (element.closest('#convive-cart-loader')) return;
      const metadata = normalize([
        elementLabel(element),
        element.getAttribute('class'),
        element.getAttribute('id'),
        element.getAttribute('href'),
        element.getAttribute('data-testid'),
      ].filter(Boolean).join(' '));
      if (/\b(agregar|anadir|add to cart|comprar|pagar|confirmar|finalizar)\b/.test(metadata)) return;
      const previous = scored.get(element) || 0;
      scored.set(element, Math.max(previous, score));
    };

    for (const selector of config.cartSelectors) {
      for (const element of document.querySelectorAll(selector)) offer(element, 130);
    }

    for (const element of document.querySelectorAll(
      'header a[href],header button,header [role="button"],nav a[href],nav button,nav [role="button"]',
    )) {
      const metadata = normalize([
        elementLabel(element),
        element.getAttribute('class'),
        element.getAttribute('id'),
        element.getAttribute('href'),
        element.getAttribute('data-testid'),
      ].filter(Boolean).join(' '));
      if (/\b(agregar|anadir|comprar|pagar|confirmar|finalizar)\b/.test(metadata)) continue;
      const cartIntent = ['cart', 'carro', 'carrito', 'basket', 'shopping bag']
        .some(fragment => metadata.includes(fragment));
      if (!cartIntent) continue;
      const href = normalize(element.getAttribute('href'));
      const score = (href.includes('cart') || href.includes('carro') ? 110 : 0)
        + (metadata.includes('cart') || metadata.includes('carro') || metadata.includes('carrito') ? 80 : 0);
      offer(element, score);
    }

    return [...scored.entries()]
      .map(([element, score]) => ({ element, score }))
      .sort((left, right) => right.score - left.score);
  }

  function findCartControl(config) {
    return cartControlCandidates(config)[0]?.element || null;
  }

  /**
   * Si la URL actual es una ficha de producto.
   *
   * Se mira la RUTA y nada mas. Las dos alternativas fallaron contra las
   * tiendas reales:
   *   * `initialAddControl && <h1>`: una lista de resultados tiene ambos, y el
   *     cargador terminaba pulsando el primer "Agregar" de 40 (Santa Isabel).
   *   * "un solo control de alta visible": una ficha de Jumbo tiene 32, por los
   *     carruseles de relacionados, y quedaba clasificada como no-ficha.
   * La ruta, en cambio, es inequivoca en las seis cadenas.
   */
  function isProductDetailPage() {
    const path = window.location.pathname.toLowerCase();
    return /\/p\/?$/.test(path)      // VTEX: Jumbo, Santa Isabel (.../slug/p)
      || path.startsWith('/p/')       // aCuenta (/p/slug) - prefijo, no sufijo
      || path.includes('/ip/')        // Lider
      || path.includes('/product/')   // Unimarc
      || path.includes('/articulo/')  // Tottus
      || path.includes('/products/'); // Irurzun (Shopify)
  }

  /**
   * Si hay un panel modal tapando la pagina.
   *
   * `interventionPrompt` solo reconoce los modales cuya frase esta catalogada.
   * Cuando aparece uno nuevo -Tottus estreno "Ingresa tu ubicacion"- el cargador
   * no encontraba boton de agregar y cerraba el producto como faltante, que es
   * una conclusion falsa: el producto existe, solo estaba tapado. Ante un modal
   * desconocido conviene pausar y pedir ayuda, no inventar un faltante.
   *
   * El filtro de "cubre el centro" es obligatorio: `class*=drawer` y
   * `class*=modal` matchean el widget permanente de despacho del header en
   * Tottus, Lider y aCuenta. Ese widget no tapa el producto; pausar por el
   * dejaba la carga congelada en el item 1 con el CTA de ubicación.
   */
  function blockingOverlay() {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    return [...document.querySelectorAll(
      'dialog,[role="dialog"],[aria-modal="true"],[class*="modal" i],[class*="overlay" i],[class*="drawer" i]',
    )].filter(element => {
      if (!isVisible(element) || element.closest('#convive-cart-loader')) return false;
      const inChrome = Boolean(element.closest(
        'header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"]',
      ));
      if (inChrome && !element.matches('dialog, [role="dialog"], [aria-modal="true"]')) return false;
      return PAGE_SIGNALS.overlayIsBlocking(element.getBoundingClientRect(), viewport);
    })[0] || null;
  }

  function isAddSkeleton(element) {
    const meta = normalize([
      element?.getAttribute?.('data-testid'),
      element?.getAttribute?.('class'),
      element?.getAttribute?.('id'),
      element?.getAttribute?.('aria-label'),
    ].filter(Boolean).join(' '));
    return meta.includes('skeleton') || meta.includes('placeholder') || meta.includes('add to cart skeleton');
  }

  function isClickableAddControl(element) {
    if (!(element instanceof Element) || isAddSkeleton(element)) return false;
    if (element.closest('#convive-cart-loader')) return false;
    const tag = element.tagName.toLowerCase();
    return tag === 'button'
      || tag === 'input'
      || element.getAttribute('role') === 'button'
      || element.getAttribute('data-automation-id') === 'add-to-cart';
  }

  function findAddControl(config) {
    const configured = firstVisible(config.addSelectors, document, config.allowHiddenControls);
    if (configured && isClickableAddControl(configured)) return configured;
    const forbidden = ['direccion', 'lista', 'favorito', 'medio de pago', 'skeleton'];
    const candidates = [...document.querySelectorAll(
      'button[data-automation-id="add-to-cart"],[data-automation-id="add-to-cart"],[data-testid*="add-to-cart"],[class*="add-to-cart"],button,[role="button"]',
    )]
      .filter(element => isVisible(element) && isEnabled(element) && isClickableAddControl(element))
      .map(element => {
        const label = elementLabel(element);
        const insideProductLink = Boolean(element.closest('a[href]'));
        const forbiddenLabel = forbidden.some(fragment => label.includes(fragment));
        const exactAdd = label === 'agregar' || label === 'anadir' || label === 'agregar al carrito';
        const cartIntent = label.includes('agregar al carro') || label.includes('add to cart');
        const automationIntent = normalize(element.getAttribute('data-automation-id')) === 'add to cart';
        const testIdIntent = normalize(element.getAttribute('data-testid')).includes('add to cart')
          && !normalize(element.getAttribute('data-testid')).includes('skeleton');
        const score = automationIntent ? 110 : testIdIntent ? 100 : exactAdd ? 90 : cartIntent ? 80 : 0;
        return { element, insideProductLink, forbiddenLabel, score };
      })
      .filter(candidate => candidate.score > 0 && !candidate.insideProductLink && !candidate.forbiddenLabel)
      .sort((left, right) => right.score - left.score);
    return candidates[0]?.element || null;
  }

  function findPlusControl(config, preferredRoot) {
    if (preferredRoot?.isConnected) {
      const nearby = firstVisible(config.plusSelectors, preferredRoot, config.allowHiddenControls);
      if (nearby) return nearby;
    }
    return firstVisible(config.plusSelectors, document, config.allowHiddenControls);
  }

  function pageIsBlocked(config) {
    const text = normalize(document.body?.innerText).slice(0, 20000);
    return config.blockedText.some(fragment => text.includes(normalize(fragment)));
  }

  function interventionPrompt(config) {
    const overlay = blockingOverlay();
    if (!overlay) return null;
    if (PAGE_SIGNALS.overlayLooksLikeTerms(overlay.textContent)) return 'terms';
    return PAGE_SIGNALS.overlayLooksLikeDelivery(overlay.textContent, config.locationText)
      ? 'delivery'
      : null;
  }

  function termsPauseDetail(store) {
    return `${store} muestra los Términos de Puntos Cencosud. Ciérralos o pulsa Reintentar tú — CoCo no acepta términos ni paga — y luego pulsa “Reanudar carga”.`;
  }

  function productDetailRoot() {
    return document.querySelector('main, [role="main"], article') || document.body;
  }

  /**
   * La ficha dice que no hay stock. Seguir esperando un botón de agregar
   * congelaba TODA la lista en el producto 1 (Avena Tradicional Tottus 700 gr
   * el 2026-08-27: "¡Qué mal! Justo se agotó").
   */
  function productIsOutOfStock(config) {
    if (!isProductDetailPage()) return false;
    if (findAddControl(config)) return false;
    const root = productDetailRoot();
    const text = String(root?.innerText || root?.textContent || '').slice(0, 12000);
    return PAGE_SIGNALS.textLooksOutOfStock(text);
  }

  function outOfStockDetail(item, store) {
    return `${item.name} está agotado en ${store}. Se omitió y se continúa con el resto de la lista.`;
  }

  function productPath(urlValue) {
    try {
      return new URL(urlValue).pathname.replace(/\/+$/, '');
    } catch {
      return '';
    }
  }

  function sameProductPage(targetUrl) {
    const targetPath = productPath(targetUrl);
    return Boolean(targetPath) && window.location.pathname.replace(/\/+$/, '') === targetPath;
  }

  function tokenScore(candidate, expected) {
    const candidateTokens = new Set(normalize(candidate).split(' ').filter(token => token.length > 1));
    const expectedTokens = normalize(expected).split(' ').filter(token => token.length > 1);
    if (expectedTokens.length === 0) return 0;
    return expectedTokens.filter(token => candidateTokens.has(token)).length / expectedTokens.length;
  }

  function findBestProductLink(item) {
    const candidates = [...document.querySelectorAll('a[href]')]
      .filter(isVisible)
      .map(anchor => ({
        anchor,
        score: tokenScore([
          anchor.textContent,
          anchor.querySelector('img')?.getAttribute('alt'),
          anchor.closest('[data-cnstrc-item-name]')?.getAttribute('data-cnstrc-item-name'),
        ].filter(Boolean).join(' '), item.name),
      }))
      .filter(candidate => candidate.score >= 0.72)
      .sort((left, right) => right.score - left.score);
    return candidates[0]?.anchor || null;
  }

  function createOverlay(store) {
    const existing = document.getElementById('convive-cart-loader');
    if (existing) return existing;
    const overlay = document.createElement('aside');
    overlay.id = 'convive-cart-loader';
    overlay.innerHTML = `
      <div class="coco-loader__head">
        <strong>CoCo está preparando tu carro</strong>
        <span class="coco-loader__badge"></span>
      </div>
      <div class="coco-loader__progress"><span></span></div>
      <p class="coco-loader__detail">Conectando con Convive Connect…</p>
      <p class="coco-loader__item"></p>
      <button type="button" class="coco-loader__retry" hidden>Reanudar carga</button>
      <p class="coco-loader__safety">CoCo agrega productos. Nunca confirma ni paga la compra.</p>
    `;
    const version = chrome.runtime.getManifest().version;
    overlay.querySelector('.coco-loader__badge').textContent = `${store} · v${version}`;
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function render(overlay, state) {
    const completed = state.added + state.failed;
    const percent = state.total > 0 ? Math.round((completed / state.total) * 100) : 0;
    overlay.querySelector('.coco-loader__progress span').style.width = `${percent}%`;
    overlay.querySelector('.coco-loader__detail').textContent = state.detail;
    overlay.querySelector('.coco-loader__item').textContent = state.item
      ? `${completed + 1} de ${state.total} · ${state.item}`
      : `${completed} de ${state.total}`;
  }

  function waitFor(check, timeoutMs = 20000) {
    return new Promise(resolve => {
      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        const result = check();
        if (result || Date.now() - startedAt >= timeoutMs) {
          window.clearInterval(timer);
          resolve(result || null);
        }
      }, 350);
    });
  }

  function isCheckoutOrCampaignLabel(label) {
    return /\b(pagar|comprar|confirmar|finalizar|checkout|intentelo aqui|intentalo aqui|aceptar terminos)\b/.test(label);
  }

  function hasVisibleEmptyCartState() {
    const nodes = [...document.querySelectorAll(
      'h1,h2,h3,[role="heading"],p,[data-empty-cart-state]',
    )].filter(isVisible);
    if (nodes.some(element => PAGE_SIGNALS.textLooksLikeEmptyCart(
      elementLabel(element) || element.textContent,
    ))) {
      return true;
    }
    const containers = [...document.querySelectorAll(
      'aside,dialog,[role="dialog"],[aria-modal="true"],[class*="drawer" i],[class*="minicart" i],[class*="empty-cart" i]',
    )].filter(element => isVisible(element) && !element.closest('#convive-cart-loader'));
    if (containers.some(element => PAGE_SIGNALS.textLooksLikeEmptyCart(element.textContent))) {
      return true;
    }
    const overlay = blockingOverlay();
    return Boolean(overlay && PAGE_SIGNALS.textLooksLikeEmptyCart(overlay.textContent));
  }

  /**
   * Cuántas unidades hay en el carro, o 0 si la tienda ya muestra copy de vacío.
   *
   * El contador del header a veces no parsea (las 7 tiendas, 2026-08-28: Jumbo
   * "Tu carro está vacío"; misma clase de stall en Santa Isabel, Lider, Tottus,
   * Unimarc, aCuenta e Irurzun). Esperar un API/contador que nunca confirma 0
   * dejaba la carga congelada en el producto 1. El copy nativo de vacío basta.
   */
  function observedCartCount(config) {
    const counted = parseCartCount(config);
    if (typeof counted === 'number') return counted;
    const panelCount = visibleCartPanelCount();
    if (typeof panelCount === 'number') return panelCount;
    if (hasVisibleEmptyCartState()) return 0;
    return null;
  }

  function visibleCartPanelCount() {
    for (const element of [...document.querySelectorAll('h1,h2,h3,[role="heading"],p')].filter(isVisible)) {
      const label = elementLabel(element);
      const match = label.match(/(?:tienes|hay|carro tiene|carrito tiene) (\d{1,4}) (?:productos|articulos)\b/)
        || label.match(/^(\d{1,4}) (?:productos|articulos)\b/);
      if (match) return Number(match[1]);
    }
    return null;
  }

  /**
   * Cuantas unidades marca el contador del carro, o null si no se puede leer.
   *
   * Las fuentes se prueban POR SEPARADO. Uniendo textContent + aria-label, el
   * boton de Jumbo/Santa Isabel queda como "1 Carro de compras": el numero va
   * ANTES de la palabra, asi que el patron "carro ... numero" no calzaba y el
   * conteo devolvia null. Sin contador, `additionWasVerified` se queda sin su
   * senal principal y una carga correcta parece fallida (verificado 2026-08-24).
   */
  function parseCartCount(config) {
    for (const selector of config.cartSelectors) {
      for (const element of [...document.querySelectorAll(selector)].filter(isVisible)) {
        const sources = [
          element.textContent,
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
        ].filter(Boolean).map(value => String(value).trim());

        // Un contador suele ser solo el numero, en su propio nodo.
        for (const source of sources) {
          const plain = source.match(/^(\d{1,4})$/);
          if (plain) return Number(plain[1]);
        }
        // O el numero acompañando a la palabra, en cualquier orden.
        for (const source of sources) {
          const after = source.match(/(?:carro|carrito|cart)[^\d]{0,30}(\d{1,4})/i);
          if (after) return Number(after[1]);
          const before = source.match(/(\d{1,4})[^\d]{0,30}(?:carro|carrito|cart)/i);
          if (before) return Number(before[1]);
        }
      }
    }
    return null;
  }

  async function settledCartCount(config, timeoutMs = 8000) {
    const immediate = observedCartCount(config);
    if (immediate === 0) return 0;
    await new Promise(resolve => window.setTimeout(resolve, 1800));
    const startedAt = Date.now();
    let previous = null;
    let stableReads = 0;
    while (Date.now() - startedAt < timeoutMs) {
      const current = observedCartCount(config);
      if (current === 0) return 0;
      if (current !== null) {
        stableReads = current === previous ? stableReads + 1 : 1;
        previous = current;
        if (stableReads >= 3) return current;
      }
      await new Promise(resolve => window.setTimeout(resolve, 350));
    }
    return previous;
  }

  async function cartCountWithDrawerProbe(config) {
    let count = await settledCartCount(config);
    if (count !== null) {
      if (count === 0) dismissEmptyCartMarketing();
      return count;
    }

    const cartControl = findCartControl(config);
    if (!cartControl) {
      if (hasVisibleEmptyCartState()) {
        dismissEmptyCartMarketing();
        return 0;
      }
      return null;
    }
    cartControl.click();
    count = await settledCartCount(config, 5000);
    if (count !== null || hasVisibleEmptyCartState()) {
      dismissEmptyCartMarketing();
      return count ?? 0;
    }
    closeCartPanel();
    return null;
  }

  function labelMatches(label, expectedLabels) {
    return expectedLabels.some(expected => {
      const normalizedExpected = normalize(expected);
      return label === normalizedExpected || label.startsWith(`${normalizedExpected} `);
    });
  }

  function findEmptyCartControl(config) {
    const configured = firstVisible(config.emptyCartSelectors || []);
    if (configured) return configured;
    const labels = config.emptyCartLabels || [];
    return [...document.querySelectorAll('button,[role="button"],a[href]')]
      .filter(element => isVisible(element) && isEnabled(element) && !element.closest('#convive-cart-loader'))
      .find(element => labelMatches(elementLabel(element), labels)) || null;
  }

  function findEmptyCartConfirmation() {
    const containers = [...document.querySelectorAll(
      'dialog,[role="dialog"],[aria-modal="true"],[class*="modal"],[class*="Modal"]',
    )].filter(container => {
      if (!isVisible(container)) return false;
      const text = normalize(container.textContent);
      return /\b(vaciar|eliminar)\b/.test(text)
        && /\b(carro|carrito|producto|articulo)\b/.test(text);
    });
    for (const container of containers.reverse()) {
      const confirmation = [...container.querySelectorAll('button,[role="button"]')]
        .filter(element => isVisible(element) && isEnabled(element))
        .find(element => {
          const label = elementLabel(element);
          return /^(?:si\b.*\b(?:vaciar|eliminar)|confirmar|aceptar|vaciar(?: carro| carrito)?|eliminar(?: todo| todos| productos)?)$/.test(label);
        });
      if (confirmation) return confirmation;
    }
    return null;
  }

  function closeCartPanel() {
    const close = [...document.querySelectorAll('button,[role="button"],a[href]')]
      .filter(element => isVisible(element) && isEnabled(element) && !element.closest('#convive-cart-loader'))
      .find(element => {
        const label = elementLabel(element);
        if (isCheckoutOrCampaignLabel(label)) return false;
        const aria = normalize(element.getAttribute('aria-label') || '');
        const title = normalize(element.getAttribute('title') || '');
        const raw = String(element.textContent || '').trim();
        return /^(?:cerrar|close|x)$/.test(label)
          || /^(?:cerrar|close)\b/.test(aria)
          || /^(?:cerrar|close)\b/.test(title)
          || raw === '×'
          || raw === '✕';
      });
    close?.click();
  }

  /**
   * Cierra el panel de marketing de carro vacío (Jumbo/Tottus/Lider: "Inténtalo
   * aquí" u equivalente) sin pulsarlo: esa CTA no es vaciar ni agregar, y nunca
   * es pagar. Vale para las 7 tiendas.
   */
  function dismissEmptyCartMarketing() {
    const overlay = blockingOverlay();
    const looksEmpty = hasVisibleEmptyCartState()
      || Boolean(overlay && PAGE_SIGNALS.textLooksLikeEmptyCart(overlay.textContent));
    if (!looksEmpty) return false;
    closeCartPanel();
    return true;
  }

  async function replaceExistingCart(overlay, config, job) {
    if (interventionPrompt(config) === 'terms') {
      await pause(overlay, termsPauseDetail(job.store));
      return false;
    }
    overlay.querySelector('.coco-loader__detail').textContent =
      `Revisando el carro anterior de ${job.store} antes de cargar la lista nueva…`;
    let before = await cartCountWithDrawerProbe(config);
    if (before === null && hasVisibleEmptyCartState()) {
      dismissEmptyCartMarketing();
      before = 0;
    }
    if (before === null) {
      if (interventionPrompt(config) === 'terms') {
        await pause(overlay, termsPauseDetail(job.store));
        return false;
      }
      await pause(
        overlay,
        `No fue posible verificar el contador de ${job.store}. Abre su carro, déjalo vacío y pulsa “Reanudar carga”.`,
      );
      return false;
    }

    if (before > 0) {
      const cartControl = findCartControl(config);
      if (!cartControl) {
        await pause(
          overlay,
          `No encontramos el acceso al carro de ${job.store}. Ábrelo, vacíalo y pulsa “Reanudar carga”.`,
        );
        return false;
      }
      cartControl.click();
      const emptyControl = await waitFor(() => findEmptyCartControl(config), 8000);
      if (!emptyControl) {
        await pause(
          overlay,
          `${job.store} no mostró una opción verificable para vaciar el carro. Vacíalo aquí y pulsa “Reanudar carga”.`,
        );
        return false;
      }
      emptyControl.click();

      await new Promise(resolve => window.setTimeout(resolve, 600));
      if (observedCartCount(config) !== 0) {
        const confirmation = await waitFor(() => findEmptyCartConfirmation(), 4000);
        confirmation?.click();
      }

      const cleared = await waitFor(() => (
        observedCartCount(config) === 0 ? { cartCount: 0 } : null
      ), 10000);
      if (!cleared) {
        if (interventionPrompt(config) === 'terms') {
          await pause(overlay, termsPauseDetail(job.store));
          return false;
        }
        await pause(
          overlay,
          `${job.store} no confirmó que el carro quedara vacío. Vacíalo aquí y pulsa “Reanudar carga”.`,
        );
        return false;
      }
      dismissEmptyCartMarketing();
    }

    if (before === 0 || observedCartCount(config) === 0) {
      dismissEmptyCartMarketing();
    }

    const reset = await runtimeMessage({
      type: 'COMPLETE_CART_RESET',
      cartCountBefore: before,
      cartCountAfter: 0,
    });
    if (!reset?.ok) {
      await pause(overlay, 'No fue posible registrar el vaciado. Revisa el carro y pulsa “Reanudar carga”.');
      return false;
    }
    overlay.querySelector('.coco-loader__detail').textContent = reset.progress?.detail
      || 'Carro anterior verificado. Cargando la lista nueva…';
    return true;
  }

  function quantitySignature(config) {
    return config.quantitySelectors.map(selector => (
      [...document.querySelectorAll(selector)]
        .filter(isVisible)
        .map(element => element instanceof HTMLInputElement ? element.value : elementLabel(element))
        .join('|')
    )).join('::');
  }

  function additionSnapshot(config, addControl) {
    return {
      addLabel: elementLabel(addControl),
      addVisible: isVisible(addControl),
      cartCount: parseCartCount(config),
      quantity: quantitySignature(config),
      plusCount: config.plusSelectors.reduce((sum, selector) => (
        sum + [...document.querySelectorAll(selector)].filter(isVisible).length
      ), 0),
    };
  }

  function additionWasVerified(config, addControl, before) {
    const afterCount = parseCartCount(config);
    if (before.cartCount !== null && afterCount !== null) {
      return afterCount > before.cartCount;
    }
    if (!addControl.isConnected || (before.addVisible && !isVisible(addControl))) return true;
    const afterLabel = elementLabel(addControl);
    if (afterLabel && afterLabel !== before.addLabel && !afterLabel.includes('agregar')) return true;
    const afterQuantity = quantitySignature(config);
    if (afterQuantity && afterQuantity !== before.quantity) return true;
    const afterPlusCount = config.plusSelectors.reduce((sum, selector) => (
      sum + [...document.querySelectorAll(selector)].filter(isVisible).length
    ), 0);
    return afterPlusCount > before.plusCount;
  }

  function triggerClick(element) {
    if (!element) return;
    try {
      const options = { bubbles: true, cancelable: true, view: window };
      element.dispatchEvent(new PointerEvent('pointerdown', options));
      element.dispatchEvent(new MouseEvent('mousedown', options));
      element.dispatchEvent(new PointerEvent('pointerup', options));
      element.dispatchEvent(new MouseEvent('mouseup', options));
    } catch {
      // element.click() below remains the compatible fallback.
    }
    if (typeof element.click === 'function') element.click();
  }

  async function clickQuantities(config, quantity, preferredRoot) {
    if (quantity <= 1) return { complete: true, clicks: 0 };
    let clicks = 0;
    for (let index = 1; index < quantity; index += 1) {
      const plus = await waitFor(() => findPlusControl(config, preferredRoot), 5000);
      if (!plus) return { complete: false, clicks };
      triggerClick(plus);
      clicks += 1;
      await new Promise(resolve => window.setTimeout(resolve, 800));
    }
    return { complete: true, clicks };
  }

  async function completeItem(overlay, config, item, added, detail) {
    const response = await runtimeMessage({
      type: 'COMPLETE_CART_ITEM',
      itemId: item.id,
      added,
      cartCountAfter: parseCartCount(config),
      detail,
    });
    if (response?.done && response.progress) {
      render(overlay, {
        added: response.progress.added,
        failed: response.progress.failed,
        total: response.progress.total,
        item: null,
        detail: response.progress.detail,
      });
      const cartControl = await waitFor(() => findCartControl(config), 5000);
      if (cartControl) {
        window.setTimeout(() => {
          cartControl.click();
          overlay.querySelector('.coco-loader__detail').textContent =
            `${response.progress.detail} Abrimos el carro de ${response.progress.store} para que lo revises.`;
          window.setTimeout(() => overlay.remove(), 2500);
        }, 700);
      } else {
        overlay.querySelector('.coco-loader__detail').textContent =
          `${response.progress.detail} Pulsa el carro de ${response.progress.store} para continuar al pago.`;
      }
    }
    return response;
  }

  async function retryFromOverlay(overlay) {
    const retry = overlay.querySelector('.coco-loader__retry');
    retry.hidden = false;
    retry.onclick = () => {
      retry.disabled = true;
      void runtimeMessage({ type: 'RETRY_CART_ITEM' }).then(() => window.location.reload());
    };
  }

  async function pause(overlay, detail) {
    await runtimeMessage({ type: 'PAUSE_CART_LOAD', detail });
    overlay.querySelector('.coco-loader__detail').textContent = detail;
    await retryFromOverlay(overlay);
  }

  /**
   * Intenta cargar toda la canasta con la API de la tienda.
   *
   * Devuelve true solo si la tienda confirmo al menos un producto. Ante
   * cualquier otra cosa devuelve false y la carga sigue por el recorrido de la
   * interfaz, que es mas lento pero verifica producto a producto. Nunca informa
   * un resultado que la tienda no haya devuelto.
   *
   * Corre despues del vaciado del carro anterior (`replaceExistingCart`), no
   * antes: si se cargara primero, el vaciado borraria lo recien agregado.
   */
  async function tryCartApi(job, config, overlay) {
    if (!config.cartApi || job.currentIndex > 0) return false;
    if (config.cartApiHosts && !config.cartApiHosts.includes(window.location.hostname)) return false;

    const rawItems = Array.isArray(job.allItems) ? job.allItems : [];
    const prepared = typeof config.prepareItems === 'function'
      ? await config.prepareItems(rawItems)
      : rawItems;
    const ready = prepared.filter(entry => entry.sku && entry.offerId);
    if (ready.length === 0) return false;

    let landed;
    try {
      landed = await config.cartApi.load(ready, {
        replace: job.replaceCart === true && job.cartResetStatus === 'pending',
      });
    } catch {
      return false;
    }
    if (!(landed instanceof Map) || landed.size === 0) return false;

    const skuOf = item => String(item.sku || '');
    const confirmed = ready
      .map(entry => ({
        itemId: entry.id,
        quantity: Number(landed.get(skuOf(entry))) || 0,
      }))
      .filter(entry => entry.quantity > 0);
    if (confirmed.length === 0) return false;

    if (job.replaceCart === true && job.cartResetStatus === 'pending') {
      await runtimeMessage({
        type: 'COMPLETE_CART_RESET',
        cartCountBefore: job.initialCartCount ?? 0,
        cartCountAfter: 0,
      }).catch(() => null);
    }

    const response = await runtimeMessage({
      type: 'REPORT_CART_API_RESULTS',
      confirmed,
      attemptedItemIds: ready.map(entry => entry.id),
      cartCount: parseCartCount(config),
    });
    if (!response?.ok) return false;

    render(overlay, {
      added: response.progress.added,
      failed: response.progress.failed,
      total: response.progress.total,
      item: null,
      detail: response.progress.detail,
    });
    if (response.done) {
      window.setTimeout(() => {
        if (window.location.hostname === 'super.lider.cl') {
          window.location.assign('https://super.lider.cl/cart');
          return;
        }
        findCartControl(config)?.click();
        window.setTimeout(() => overlay.remove(), 2500);
      }, 700);
    }
    return true;
  }

  async function run() {
    const response = await runtimeMessage({ type: 'GET_CART_LOAD_JOB' });
    const job = response?.job;
    if (!response?.ok || !job?.item || !job.store) return;
    const config = STORE_CONFIGS[job.store];
    if (!config || !config.hosts.includes(window.location.hostname)) return;

    const overlay = createOverlay(job.store);
    const item = job.item;
    render(overlay, {
      added: job.added,
      failed: job.failed,
      total: job.total,
      item: item.name,
      detail: job.status === 'paused'
        ? 'La carga está pausada. Completa el paso solicitado y reanuda.'
        : job.replaceCart && job.cartResetStatus === 'pending'
          ? `Revisando el carro anterior de ${job.store}…`
        : `Buscando ${item.name}…`,
    });

    if (job.status === 'paused') {
      await retryFromOverlay(overlay);
      return;
    }
    if (job.status !== 'loading') return;

    if (pageIsBlocked(config)) {
      await pause(
        overlay,
        `${job.store} pide una verificación humana. Complétala aquí y luego pulsa “Reanudar carga”.`,
      );
      return;
    }
    if (interventionPrompt(config) === 'terms') {
      await pause(overlay, termsPauseDetail(job.store));
      return;
    }

    if (job.replaceCart && job.cartResetStatus === 'pending' && !config.cartApi) {
      const replaced = await replaceExistingCart(overlay, config, job);
      if (!replaced) return;
    }

    // Camino rapido Lider: vacía (si se pidió reemplazo) y carga por Orchestra.
    // Si la API no puede, recién ahí se vacía por interfaz y se recorre ficha a ficha.
    if (await tryCartApi(job, config, overlay)) return;

    if (job.replaceCart && job.cartResetStatus === 'pending') {
      const replaced = await replaceExistingCart(overlay, config, job);
      if (!replaced) return;
    }

    if (job.inFlightItemId === item.id) {
      await pause(
        overlay,
        'La página se recargó mientras se agregaba este producto. Revisa el carro y pulsa “Reanudar carga” para evitar duplicados.',
      );
      return;
    }

    const initialAddControl = findAddControl(config);
    const targetIsProduct = item.productUrl && sameProductPage(item.productUrl);
    /*
     * Una lista de resultados tambien tiene <h1> y botones "Agregar", asi que
     * la heuristica anterior la tomaba por una ficha de producto: se saltaba la
     * busqueda del producto correcto y pulsaba el PRIMER "Agregar" de la lista.
     * Como el carro efectivamente cambiaba, se reportaba como exito un producto
     * que la persona no pidio. La senal fiable es que haya un unico control de
     * alta visible: en una busqueda de "arroz" en Santa Isabel hay 40.
     */
    const looksLikeProductPage = isProductDetailPage();
    if (!targetIsProduct && !looksLikeProductPage) {
      const productLink = await waitFor(() => findBestProductLink(item), 15000);
      if (productLink) {
        productLink.click();
        return;
      }
      if (item.productUrl && window.location.href !== item.productUrl) {
        window.location.assign(item.productUrl);
        return;
      }
      /*
       * No se pudo llegar a la ficha exacta. Se cierra como faltante en vez de
       * pulsar el control generico: agregar "algo parecido" es peor que no
       * agregar nada, porque la persona termina pagando otro producto.
       */
      await completeItem(
        overlay,
        config,
        item,
        false,
        `No se pudo abrir la ficha exacta de ${item.name}. Quedo pendiente para que lo agregues tu.`,
      );
      return;
    }

    if (interventionPrompt(config) === 'delivery') {
      await pause(
        overlay,
        `${job.store} necesita que elijas despacho, retiro o ubicación. Hazlo aquí y luego pulsa “Reanudar carga”.`,
      );
      return;
    }
    if (interventionPrompt(config) === 'terms') {
      await pause(overlay, termsPauseDetail(job.store));
      return;
    }

    let addControl = initialAddControl;
    if (!addControl) {
      const signal = await waitFor(() => {
        if (interventionPrompt(config) === 'terms') return { type: 'terms' };
        if (interventionPrompt(config) === 'delivery') return { type: 'delivery' };
        const control = findAddControl(config);
        if (control) return { type: 'add', control };
        if (productIsOutOfStock(config)) return { type: 'oos' };
        const unknown = blockingOverlay();
        if (unknown && PAGE_SIGNALS.textLooksLikeEmptyCart(unknown.textContent)) {
          dismissEmptyCartMarketing();
          return null;
        }
        if (unknown) return { type: 'overlay', overlay: unknown };
        return null;
      }, 15000);
      if (signal?.type === 'add') {
        addControl = signal.control;
      } else if (signal?.type === 'terms') {
        await pause(overlay, termsPauseDetail(job.store));
        return;
      } else if (signal?.type === 'delivery') {
        await pause(
          overlay,
          `${job.store} necesita que elijas despacho, retiro o ubicación. Hazlo aquí y luego pulsa “Reanudar carga”.`,
        );
        return;
      } else if (signal?.type === 'oos') {
        await completeItem(overlay, config, item, false, outOfStockDetail(item, job.store));
        return;
      } else if (signal?.type === 'overlay') {
        const pista = normalize(signal.overlay.textContent).slice(0, 80);
        await pause(
          overlay,
          `${job.store} muestra una ventana que tapa el producto${pista ? ` ("${pista}")` : ''}. `
          + 'Resuélvela aquí y pulsa “Reanudar carga”.',
        );
        return;
      }
    }

    if (!addControl) {
      if (productIsOutOfStock(config)) {
        await completeItem(overlay, config, item, false, outOfStockDetail(item, job.store));
        return;
      }
      await completeItem(overlay, config, item, false, 'No se encontró un botón de agregar disponible.');
      return;
    }

    const cartCountBeforeQuantity = parseCartCount(config);
    const claim = await runtimeMessage({
      type: 'CLAIM_CART_ITEM',
      itemId: item.id,
      cartCountBefore: cartCountBeforeQuantity,
    });
    if (!claim?.ok) {
      await pause(
        overlay,
        'Este producto ya estaba en proceso. Revisa el carro antes de reanudar para evitar duplicados.',
      );
      return;
    }

    let preferredRoot = addControl.closest(
      'article,li,[data-testid*="product"],[data-testid*="quantifier"],[class*="product-control"],[class*="product-form"],product-form',
    );
    let quantityResult = { complete: true, clicks: 0 };
    let addedDuringQuantity = false;
    if (config.quantityBeforeAdd) {
      quantityResult = await clickQuantities(config, item.quantity, preferredRoot);
      addControl = findAddControl(config) || addControl;
      preferredRoot = addControl.closest(
        'article,li,[data-testid*="product"],[data-testid*="quantifier"],[class*="product-control"],[class*="product-form"],product-form',
      );
      const cartCountAfterQuantity = parseCartCount(config);
      addedDuringQuantity = config.quantityControlAddsToCart
        && item.quantity > 1
        && quantityResult.complete
        && quantityResult.clicks === item.quantity - 1
        || quantityResult.clicks > 0
        && cartCountAfterQuantity !== null
        && cartCountAfterQuantity > (cartCountBeforeQuantity ?? 0);
    }

    const before = additionSnapshot(config, addControl);
    if (!addedDuringQuantity) {
      triggerClick(addControl);
      await new Promise(resolve => window.setTimeout(resolve, 1800));
    }
    const outcome = addedDuringQuantity ? 'added' : await waitFor(() => {
      if (pageIsBlocked(config)) return 'blocked';
      if (interventionPrompt(config) === 'terms') return 'terms';
      if (interventionPrompt(config) === 'delivery') return 'delivery';
      if (additionWasVerified(config, addControl, before)) return 'added';
      return null;
    }, 8000);

    if (outcome === 'blocked') {
      await pause(
        overlay,
        `${job.store} pide una verificación humana. Complétala aquí y luego pulsa “Reanudar carga”.`,
      );
      return;
    }
    if (outcome === 'terms') {
      await pause(overlay, termsPauseDetail(job.store));
      return;
    }
    if (outcome === 'delivery') {
      await pause(
        overlay,
        `${job.store} necesita que elijas despacho, retiro o ubicación. Hazlo aquí y luego pulsa “Reanudar carga”.`,
      );
      return;
    }
    if (outcome !== 'added') {
      await completeItem(
        overlay,
        config,
        item,
        false,
        'El sitio recibió el clic, pero el carro no cambió. Se dejó como pendiente para no informar un éxito falso.',
      );
      return;
    }

    if (!config.quantityBeforeAdd) {
      quantityResult = await clickQuantities(config, item.quantity, preferredRoot);
    } else if (!quantityResult.complete) {
      const remainingQuantity = Math.max(1, item.quantity - quantityResult.clicks);
      const afterAddQuantity = await clickQuantities(config, remainingQuantity, preferredRoot);
      quantityResult = {
        complete: afterAddQuantity.complete,
        clicks: quantityResult.clicks + afterAddQuantity.clicks,
      };
    }
    const detail = quantityResult.complete
      ? `Agregado y verificado con cantidad ${item.quantity}.`
      : `Producto agregado y verificado, pero ${job.store} no permitió ajustar automáticamente toda la cantidad ${item.quantity}.`;
    await completeItem(overlay, config, item, true, detail);
  }

  void run().catch(async error => {
    const stored = await chrome.storage.local.get('conviveActiveCartJob');
    const store = stored.conviveActiveCartJob?.store || 'Supermercado';
    const overlay = createOverlay(store);
    await pause(
      overlay,
      error instanceof Error
        ? `La carga se pausó: ${error.message}`
        : 'La carga se pausó por un error inesperado.',
    );
  });
})();
