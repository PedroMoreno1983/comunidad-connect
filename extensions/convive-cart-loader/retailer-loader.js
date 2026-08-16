(() => {
  const STORE_CONFIGS = globalThis.CONVIVE_STORE_CONFIGS;

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
    overlay.querySelector('.coco-loader__badge').textContent = store;
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

  function parseCartCount(config) {
    for (const selector of config.cartSelectors) {
      const elements = [...document.querySelectorAll(selector)].filter(isVisible);
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
      // Fallback to basic click if PointerEvent not supported
    }
    if (typeof element.click === 'function') {
      element.click();
    }
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

    if (interventionPrompt(config) === 'delivery') {
      await pause(
        overlay,
        `${job.store} necesita que elijas despacho, retiro o ubicación. Hazlo aquí y luego pulsa “Reanudar carga”.`,
      );
      return;
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
    const looksLikeProductPage = Boolean(initialAddControl && document.querySelector('h1'));
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
    }

    let addControl = initialAddControl || await waitFor(() => findAddControl(config), 10000);
    if (!addControl) {
      await completeItem(overlay, item, false, 'No se encontró un botón de agregar disponible.');
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
      // Dar tiempo a que la mutación GraphQL / API del supermercado se envíe por red
      await new Promise(resolve => window.setTimeout(resolve, 1800));
    }
    const outcome = addedDuringQuantity ? 'added' : await waitFor(() => {
      if (pageIsBlocked(config)) return 'blocked';
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

    // Espera final para asegurar persistencia en el servidor antes de cambiar de página
    await new Promise(resolve => window.setTimeout(resolve, 1200));

    const detail = quantityResult.complete
      ? `Agregado y verificado con cantidad ${item.quantity}.`
      : `Producto agregado y verificado, pero ${job.store} no permitió ajustar automáticamente toda la cantidad ${item.quantity}.`;
    await completeItem(overlay, item, true, detail);
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
