(() => {
const BLOCKED_TEXT = [
  'robot or human',
  'confirma que eres humano',
  'confirm that you are human',
  'activate and hold',
  'verificación de seguridad',
];
const ADD_LABELS = ['agregar', 'añadir'];
const PLUS_LABELS = ['aumentar', 'agregar uno', 'sumar', 'incrementar', 'más'];

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
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number(style.opacity) !== 0
    && rect.width > 0
    && rect.height > 0;
}

function findByLabels(selectors, labels) {
  const elements = [...document.querySelectorAll(selectors)];
  return elements.find(element => {
    if (!isVisible(element) || element.hasAttribute('disabled')) return false;
    const text = normalize([
      element.textContent,
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('data-testid'),
    ].filter(Boolean).join(' '));
    return labels.some(label => text === normalize(label) || text.includes(normalize(label)));
  });
}

function findAddControl() {
  const forbidden = ['direccion', 'lista', 'favorito', 'medio de pago'];
  const candidates = [...document.querySelectorAll(
    '[data-testid*="add-to-cart"],[class*="add-to-cart"],button,[role="button"]',
  )]
    .filter(element => isVisible(element) && !element.hasAttribute('disabled'))
    .map(element => {
      const label = normalize([
        element.textContent,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('data-testid'),
      ].filter(Boolean).join(' '));
      const insideProductLink = Boolean(element.closest('a[href]'));
      const forbiddenLabel = forbidden.some(fragment => label.includes(fragment));
      const exactAdd = ADD_LABELS.some(value => label === normalize(value));
      const cartIntent = label.includes('carro') || label.includes('cart');
      const testIdIntent = normalize(element.getAttribute('data-testid')).includes('add to cart');
      const score = testIdIntent ? 100 : exactAdd ? 90 : cartIntent ? 80 : 0;
      return { element, insideProductLink, forbiddenLabel, score };
    })
    .filter(candidate => candidate.score > 0 && !candidate.insideProductLink && !candidate.forbiddenLabel)
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.element || null;
}

function pageIsBlocked() {
  const text = normalize(document.body?.innerText).slice(0, 10000);
  return BLOCKED_TEXT.some(fragment => text.includes(normalize(fragment)));
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
      ].filter(Boolean).join(' '), item.name),
    }))
    .filter(candidate => candidate.score >= 0.72)
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.anchor || null;
}

function createOverlay() {
  const existing = document.getElementById('convive-cart-loader');
  if (existing) return existing;
  const overlay = document.createElement('aside');
  overlay.id = 'convive-cart-loader';
  overlay.innerHTML = `
    <div class="coco-loader__head">
      <strong>CoCo está preparando tu carro</strong>
      <span class="coco-loader__badge">Lider</span>
    </div>
    <div class="coco-loader__progress"><span></span></div>
    <p class="coco-loader__detail">Conectando con Convive Connect…</p>
    <p class="coco-loader__item"></p>
    <button type="button" class="coco-loader__retry" hidden>Reanudar carga</button>
    <p class="coco-loader__safety">CoCo agrega productos. Nunca confirma ni paga la compra.</p>
  `;
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

async function setQuantity(quantity, addControl) {
  if (quantity <= 1) return { complete: true, clicks: 0 };
  let clicks = 0;
  for (let index = 1; index < quantity; index += 1) {
    const nearby = addControl.closest('article, li, [data-testid*="product"], [class*="product"]');
    const plus = findByLabels(
      'button,[role="button"]',
      PLUS_LABELS,
    ) || (nearby ? [...nearby.querySelectorAll('button,[role="button"]')].find(element => {
      const text = normalize(element.textContent || element.getAttribute('aria-label'));
      return isVisible(element) && (text === '+' || PLUS_LABELS.some(label => text.includes(normalize(label))));
    }) : null);
    if (!plus) return { complete: false, clicks };
    plus.click();
    clicks += 1;
    await new Promise(resolve => window.setTimeout(resolve, 450));
  }
  return { complete: true, clicks };
}

async function completeItem(item, added, detail) {
  const response = await runtimeMessage({
    type: 'COMPLETE_CART_ITEM',
    itemId: item.id,
    added,
    detail,
  });
  if (response?.done) {
    return response;
  }
  return response;
}

async function pause(overlay, detail) {
  await runtimeMessage({ type: 'PAUSE_CART_LOAD', detail });
  const retry = overlay.querySelector('.coco-loader__retry');
  retry.hidden = false;
  overlay.querySelector('.coco-loader__detail').textContent = detail;
  retry.onclick = () => {
    retry.disabled = true;
    void runtimeMessage({ type: 'RETRY_CART_ITEM' }).then(() => window.location.reload());
  };
}

async function run() {
  const overlay = createOverlay();
  const stored = await chrome.storage.local.get('conviveActiveCartJob');
  const activeJob = stored.conviveActiveCartJob;
  if (!activeJob || activeJob.status !== 'loading') return;
  const activeItem = activeJob.items?.[activeJob.currentIndex];
  if (!activeItem) return;
  const job = {
    id: activeJob.id,
    status: activeJob.status,
    currentIndex: activeJob.currentIndex,
    item: activeItem,
    total: activeJob.items.length,
    added: activeJob.results.filter(result => result.status === 'added').length,
    failed: activeJob.results.filter(result => result.status === 'failed').length,
    targetUrl: activeItem.productUrl || `https://super.lider.cl/supermercado/search?query=${encodeURIComponent(activeItem.name)}`,
    inFlightItemId: activeJob.inFlightItemId,
  };
  const item = job.item;
  render(overlay, {
    added: job.added,
    failed: job.failed,
    total: job.total,
    item: item.name,
    detail: `Buscando ${item.name}…`,
  });

  if (pageIsBlocked()) {
    await pause(overlay, 'Lider pide una verificación humana. Complétala aquí y luego pulsa “Reanudar carga”.');
    return;
  }

  if (job.inFlightItemId === item.id) {
    await pause(overlay, 'La página se recargó mientras se agregaba este producto. Revisa el carro y pulsa “Reanudar carga” para evitar duplicados.');
    return;
  }

  const targetIsProduct = item.productUrl && sameProductPage(item.productUrl);
  if (!targetIsProduct) {
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

  const addControl = await waitFor(findAddControl, 8000);
  if (!addControl) {
    await completeItem(item, false, 'No se encontró un botón de agregar disponible.');
    return;
  }

  const claim = await runtimeMessage({ type: 'CLAIM_CART_ITEM', itemId: item.id });
  if (!claim?.ok) {
    await pause(overlay, 'Este producto ya estaba en proceso. Revisa el carro antes de reanudar para evitar duplicados.');
    return;
  }

  addControl.click();
  await new Promise(resolve => window.setTimeout(resolve, 1200));
  const quantityResult = await setQuantity(item.quantity, addControl);
  const detail = quantityResult.complete
    ? `Agregado con cantidad ${item.quantity}.`
    : `Producto agregado, pero Lider no permitió ajustar automáticamente toda la cantidad ${item.quantity}.`;
  await completeItem(item, true, detail);
}

void run().catch(async error => {
  const overlay = createOverlay();
  await pause(
    overlay,
    error instanceof Error
      ? `La carga se pausó: ${error.message}`
      : 'La carga se pausó por un error inesperado.',
  );
});
})();
