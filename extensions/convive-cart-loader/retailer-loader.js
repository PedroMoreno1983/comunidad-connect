(() => {
  const STORE_CONFIGS = globalThis.CONVIVE_STORE_CONFIGS;

  const COMMON_OUT_OF_STOCK = [
    'justo se agoto',
    'justo se agotó',
    'agotado',
    'producto agotado',
    'sin stock',
    'no disponible',
    'temporalmente no disponible',
    'producto temporalmente fuera de stock',
    'out of stock',
    'no hay stock',
    'no encontramos resultados',
    'este producto no se encuentra disponible',
    'producto no disponible',
    'sin existencias',
  ];

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

  function findAddControl(config) {
    const configured = firstVisible(config.addSelectors, document, config.allowHiddenControls);
    if (configured) return configured;
    const forbidden = ['direccion', 'lista', 'favorito', 'medio de pago'];
    const candidates = [...document.querySelectorAll(
      '[data-testid*="add-to-cart"],[class*="add-to-cart"],button,[role="button"],[tabindex="0"]',
    )]
      .filter(element => isVisible(element) && isEnabled(element))
      .map(element => {
        const label = elementLabel(element);
        const insideProductLink = Boolean(element.closest('a[href]'));
        const forbiddenLabel = forbidden.some(fragment => label.includes(fragment));
        const exactAdd = label === 'agregar' || label === 'anadir' || label === 'agregar al carrito';
        const cartIntent = label.includes('agregar al carro') || label.includes('add to cart');
        const testIdIntent = normalize(element.getAttribute('data-testid')).includes('add to cart');
        const score = testIdIntent ? 100 : exactAdd ? 90 : cartIntent ? 80 : 0;
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

  function pageIsOutOfStock(config) {
    const text = normalize(document.body?.innerText).slice(0, 20000);
    const fragments = [...(config?.outOfStockText || []), ...COMMON_OUT_OF_STOCK];
    return fragments.some(fragment => text.includes(normalize(fragment)));
  }

  function interventionPrompt(config) {
    const containers = [...document.querySelectorAll(
      'dialog,[role="dialog"],[aria-modal="true"],[class*="modal"],[class*="Modal"],[class*="drawer"],[class*="Drawer"]',
    )].filter(isVisible);
    for (const container of containers) {
      const text = normalize(container.textContent);
      const match = config.locationText.find(fragment => text.includes(normalize(fragment)));
      if (match) return 'delivery';
    }
    return null;
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

  function isProductDetailPage() {
    const path = window.location.pathname.toLowerCase();
    return path.includes('/articulo/')
      || path.includes('/p/')
      || path.includes('/product/')
      || path.includes('/ip/')
      || path.includes('/item/')
      || Boolean(document.querySelector('h1') && (document.querySelector('meta[property="og:type"][content="product"]') || document.querySelector('[data-testid*="price"], [class*="price"], [class*="Price"]')));
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
      .filter(candidate => candidate.score >= 0.65)
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
    overlay.querySelector('.coco-loader__badge').textContent = `${store} · v1.2.1`;
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
      }, 300);
    });
  }

  function parseCartCount(config) {
    for (const selector of config.cartSelectors) {
      // Con allowHiddenControls se leen también contadores ocultos: Shopify
      // (Irurzun) esconde el badge cuando el carro está en 0 y lo muestra al
      // agregar; si no se lee el 0 inicial, no hay con qué comparar después.
      const elements = [...document.querySelectorAll(selector)]
        .filter(element => config.allowHiddenControls || isVisible(element));
      for (const element of elements) {
        const label = [
          element.textContent,
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
        ].filter(Boolean).join(' ');
        const cartMatch = label.match(/(?:carro|carrito|cart)[^\d]{0,30}(\d{1,4})/i);
        if (cartMatch) return Number(cartMatch[1]);
        const plainMatch = label.trim().match(/^(\d{1,4})$/);
        if (plainMatch) return Number(plainMatch[1]);
      }
    }
    return null;
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
    if (before.cartCount !== null && afterCount !== null && afterCount > before.cartCount) return true;
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
      const opts = { bubbles: true, cancelable: true, view: window };
      element.dispatchEvent(new PointerEvent('pointerdown', opts));
      element.dispatchEvent(new MouseEvent('mousedown', opts));
      element.dispatchEvent(new PointerEvent('pointerup', opts));
      element.dispatchEvent(new MouseEvent('mouseup', opts));
    } catch {
      // Fallback
    }
    if (typeof element.click === 'function') {
      element.click();
    }
  }

  async function clickQuantities(config, quantity, preferredRoot) {
    if (quantity <= 1) return { complete: true, clicks: 0 };
    let clicks = 0;
    for (let index = 1; index < quantity; index += 1) {
      const plus = await waitFor(() => findPlusControl(config, preferredRoot), 3000);
      if (!plus) return { complete: false, clicks };
      triggerClick(plus);
      clicks += 1;
      await new Promise(resolve => window.setTimeout(resolve, 800));
    }
    return { complete: true, clicks };
  }

  async function completeItem(overlay, item, added, detail) {
    const response = await runtimeMessage({
      type: 'COMPLETE_CART_ITEM',
      itemId: item.id,
      added,
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
   * cualquier otra cosa devuelve false y la carga sigue por la interfaz, que
   * es mas lenta pero verifica producto a producto. Nunca se informa un
   * resultado que la tienda no haya devuelto.
   */
  async function tryCartApi(job, config, overlay) {
    if (!config.cartApi || job.currentIndex > 0) return false;
    if (config.cartApiHosts && !config.cartApiHosts.includes(window.location.hostname)) return false;

    const allItems = job.allItems || [];
    const items = allItems.filter(entry => entry.sku && entry.offerId);
    // Solo Orchestra cuando TODA la canasta trae sku+offerId. Si falta uno,
    // una carga parcial cerraba el trabajo y los demas nunca pasaban por la UI.
    if (items.length === 0 || items.length !== allItems.length) return false;

    render(overlay, {
      added: 0,
      failed: 0,
      total: job.total,
      item: null,
      detail: `Cargando ${items.length} productos en el carro de ${job.store}...`,
    });

    let landed;
    try {
      landed = await config.cartApi.load(items);
    } catch {
      return false;
    }
    if (!(landed instanceof Map) || landed.size === 0) return false;

    const confirmed = items
      .map(entry => ({ itemId: entry.id, quantity: Number(landed.get(String(entry.sku))) || 0 }))
      .filter(entry => entry.quantity > 0);
    if (confirmed.length === 0) return false;

    const response = await runtimeMessage({ type: 'REPORT_CART_API_RESULTS', confirmed });
    if (!response?.ok) return false;

    render(overlay, {
      added: response.progress.added,
      failed: response.progress.failed,
      total: response.progress.total,
      item: null,
      detail: response.progress.detail,
    });
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
        : `Preparando ${item.name}…`,
    });

    if (job.store === 'Lider' && window.location.hostname !== 'super.lider.cl') {
      const liderTarget = (typeof job.targetUrl === 'string' && job.targetUrl.includes('super.lider.cl'))
        ? job.targetUrl
        : `https://super.lider.cl/search?query=${encodeURIComponent(item.name)}`;
      window.location.assign(liderTarget);
      return;
    }

    if (job.status === 'paused') {
      await retryFromOverlay(overlay);
      return;
    }
    if (job.status !== 'loading') return;

    // Camino rapido: una sola llamada carga toda la canasta y la tienda
    // devuelve el carro. Si no se puede, sigue el recorrido por la interfaz.
    if (await tryCartApi(job, config, overlay)) return;

    if (pageIsBlocked(config)) {
      await pause(
        overlay,
        `${job.store} pide una verificación humana. Complétala aquí y luego pulsa “Reanudar carga”.`,
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

    // Algunas tiendas (aCuenta) no muestran el catálogo hasta que la persona
    // elige modo de entrega: la búsqueda redirige a la home y no hay
    // productos ni botones. En ese caso abrimos el selector y pausamos;
    // al reanudar, la carga vuelve sola a la búsqueda (ver más abajo).
    // El botón del header tarda en hidratar (React), por eso se espera.
    if (config.deliveryOpenerText && !findAddControl(config) && !findBestProductLink(item)) {
      const opener = await waitFor(() => {
        // Si mientras tanto aparecieron productos, ya no hace falta.
        if (findAddControl(config) || findBestProductLink(item)) return null;
        return [...document.querySelectorAll('button, a, div[role="button"]')]
          .find(el => isVisible(el)
            && (el.textContent || '').trim().length < 80
            && normalize(el.textContent).includes(normalize(config.deliveryOpenerText)));
      }, 8000);
      if (opener) {
        opener.click();
        await pause(
          overlay,
          `${job.store} necesita que elijas despacho, retiro o ubicación. Hazlo aquí y luego pulsa “Reanudar carga”.`,
        );
        return;
      }
    }

    if (job.inFlightItemId === item.id) {
      await pause(
        overlay,
        'La página se recargó mientras se agregaba este producto. Revisa el carro y pulsa “Reanudar carga” para evitar duplicados.',
      );
      return;
    }

    // Comprobación rápida de stock agotado. Solo cuando la URL es claramente
    // la ficha del producto: en una lista de resultados (que tiene h1 y
    // precios) el "agotado" de OTRO producto sería un falso positivo.
    const pathIsProduct = ['/articulo/', '/p/', '/product/', '/ip/', '/item/']
      .some(fragment => window.location.pathname.toLowerCase().includes(fragment));
    const onProductDetail = pathIsProduct
      || (item.productUrl && sameProductPage(item.productUrl))
      || Boolean(document.querySelector('meta[property="og:type"][content="product"]'));
    if (onProductDetail && pageIsOutOfStock(config)) {
      // Hay que reclamar el producto antes de cerrarlo: el servicio rechaza
      // cierres de productos no reclamados y la carga quedaría congelada.
      const stockClaim = await runtimeMessage({ type: 'CLAIM_CART_ITEM', itemId: item.id });
      if (!stockClaim?.ok) {
        await pause(
          overlay,
          'Este producto ya estaba en proceso. Revisa el carro antes de reanudar para evitar duplicados.',
        );
        return;
      }
      await completeItem(
        overlay,
        item,
        false,
        `El producto (${item.name}) está agotado en ${job.store}. Se continuó con los siguientes.`,
      );
      return;
    }

    const initialAddControl = findAddControl(config);
    const isProductPage = isProductDetailPage() || (item.productUrl && sameProductPage(item.productUrl)) || Boolean(initialAddControl && document.querySelector('h1'));

    if (!isProductPage) {
      // Tras una pausa (p.ej. elegir modo de entrega) la pestaña puede quedar
      // en la home: hay que volver a la búsqueda del producto. El marcador
      // en sessionStorage evita un bucle si la tienda redirige otra vez.
      const navKey = `coco-nav-${item.id}`;
      const onTarget = Boolean(job.targetUrl)
        && productPath(job.targetUrl) === window.location.pathname.replace(/\/+$/, '');
      if (job.targetUrl && !onTarget && !sessionStorage.getItem(navKey)
        && !findAddControl(config) && !findBestProductLink(item)) {
        sessionStorage.setItem(navKey, '1');
        window.location.assign(job.targetUrl);
        return;
      }

      const productLink = await waitFor(() => findBestProductLink(item), 3500);
      if (productLink) {
        productLink.click();
        // La tienda puede abrir un quick-view (modal SPA SIN cambio de URL) en
        // vez de navegar a la ficha. Si aparece un control de compra, seguimos
        // en esta misma pasada; si no, la navegacion real re-ejecuta run().
        await waitFor(() => findAddControl(config), 8000);
        if (!findAddControl(config) && !isProductDetailPage()) {
          const stuckClaim = await runtimeMessage({ type: 'CLAIM_CART_ITEM', itemId: item.id });
          if (!stuckClaim?.ok) {
            await pause(
              overlay,
              'Este producto ya estaba en proceso. Revisa el carro antes de reanudar para evitar duplicados.',
            );
            return;
          }
          await completeItem(
            overlay,
            item,
            false,
            `No se encontró la ficha de compra para ${item.name}.`,
          );
          return;
        }
      } else if (item.productUrl && window.location.href !== item.productUrl) {
        window.location.assign(item.productUrl);
        return;
      }
    }

    let addControl = initialAddControl || await waitFor(() => findAddControl(config), 3000);
    if (!addControl) {
      const outOfStock = pageIsOutOfStock(config);
      // Mismo motivo: el servicio solo cierra productos reclamados.
      const noControlClaim = await runtimeMessage({ type: 'CLAIM_CART_ITEM', itemId: item.id });
      if (!noControlClaim?.ok) {
        await pause(
          overlay,
          'Este producto ya estaba en proceso. Revisa el carro antes de reanudar para evitar duplicados.',
        );
        return;
      }
      await completeItem(
        overlay,
        item,
        false,
        outOfStock
          ? `El producto (${item.name}) está agotado en ${job.store}. Se omitió.`
          : `No se encontró botón de compra para ${item.name}.`,
      );
      return;
    }

    const claim = await runtimeMessage({ type: 'CLAIM_CART_ITEM', itemId: item.id });
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
    const cartCountBeforeQuantity = parseCartCount(config);
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
      // Dar tiempo a que la mutación de red del supermercado se envíe
      await new Promise(resolve => window.setTimeout(resolve, 1800));
    }
    const outcome = addedDuringQuantity ? 'added' : await waitFor(() => {
      if (pageIsBlocked(config)) return 'blocked';
      if (interventionPrompt(config) === 'delivery') return 'delivery';
      if (additionWasVerified(config, addControl, before)) return 'added';
      return null;
    }, 6000);

    if (outcome === 'blocked') {
      await pause(
        overlay,
        `${job.store} pide una verificación humana. Complétala aquí y luego pulsa “Reanudar carga”.`,
      );
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

    // Espera para asegurar persistencia en el servidor antes de navegar al siguiente producto
    await new Promise(resolve => window.setTimeout(resolve, 1000));

    const detail = quantityResult.complete
      ? `Agregado y verificado con cantidad ${item.quantity}.`
      : `Producto agregado y verificado, pero ${job.store} no permitió ajustar automáticamente toda la cantidad ${item.quantity}.`;
    await completeItem(overlay, item, true, detail);
  }

  /**
   * Reejecuta el paso actual cuando la tienda navega por SPA (pushState)
   * sin recargar el documento: en ese caso el content script NO se vuelve a
   * inyectar y la carga quedaba congelada tras hacer clic en un producto.
   */
  let runInProgress = false;
  async function runGuarded() {
    if (runInProgress) return;
    runInProgress = true;
    try {
      await run();
    } finally {
      runInProgress = false;
    }
  }

  let lastObservedUrl = window.location.href;
  window.setInterval(() => {
    if (window.location.href === lastObservedUrl) return;
    lastObservedUrl = window.location.href;
    // Dar tiempo a que la nueva vista hidrate sus controles de compra.
    window.setTimeout(() => void runGuarded(), 1500);
  }, 800);

  void runGuarded().catch(async error => {
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
