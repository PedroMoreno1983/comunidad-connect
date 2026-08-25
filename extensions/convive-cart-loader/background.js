importScripts('store-config.js');

const ACTIVE_JOB_KEY = 'conviveActiveCartJob';
const MAX_ITEMS = 200;
const MAX_QUANTITY = 99;
const STORE_CONFIGS = globalThis.CONVIVE_STORE_CONFIGS;

function safeText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function storeConfig(store) {
  return typeof store === 'string' ? STORE_CONFIGS[store] : undefined;
}

function safeProductUrl(value, config) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !config.hosts.includes(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function searchUrl(store, item) {
  return storeConfig(store).searchUrl(item.name);
}

function targetUrl(store, item) {
  return item.productUrl || searchUrl(store, item);
}

function sanitizeRequest(payload) {
  const config = payload?.version === 1 ? storeConfig(payload.store) : undefined;
  if (!config) return null;
  if (!Array.isArray(payload.items) || payload.items.length === 0 || payload.items.length > MAX_ITEMS) return null;
  const items = payload.items.map((item, index) => ({
    id: safeText(item?.id, 100) || `item-${index + 1}`,
    name: safeText(item?.name, 240),
    requestedTerm: safeText(item?.requestedTerm, 240),
    quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.round(Number(item?.quantity) || 1))),
    productUrl: safeProductUrl(item?.productUrl, config),
    // El codigo de la tienda es lo unico que permite cargar por API y, sobre
    // todo, cruzar despues lo que la tienda confirmo contra lo que se pidio.
    sku: safeText(item?.sku, 60),
    // Lider exige este identificador ademas del sku; el resto de las tiendas
    // lo dejan vacio y caen al recorrido por la interfaz.
    offerId: safeText(item?.offerId, 60),
  }));
  if (items.some(item => !item.name)) return null;
  return {
    store: payload.store,
    items,
  };
}

function progress(job, detail, status = job.status) {
  return {
    jobId: job.id,
    store: job.store,
    status,
    total: job.items.length,
    added: job.results.filter(result => result.status === 'added').length,
    failed: job.results.filter(result => result.status === 'failed').length,
    currentItem: job.items[job.currentIndex]?.name,
    detail,
  };
}

async function saveJob(job) {
  await chrome.storage.local.set({ [ACTIVE_JOB_KEY]: job });
}

async function getJob() {
  const stored = await chrome.storage.local.get(ACTIVE_JOB_KEY);
  return stored[ACTIVE_JOB_KEY] || null;
}

async function notifySource(job, payload) {
  if (!job.sourceTabId) return;
  try {
    await chrome.tabs.sendMessage(job.sourceTabId, {
      type: 'CART_LOAD_PROGRESS',
      payload,
    });
  } catch {
    // Convive puede haberse cerrado; la carga sigue en la pestaña del comercio.
  }
}

/**
 * Traduce lo que la tienda confirmo a los resultados del trabajo.
 *
 * `confirmed` viene del content script como pares itemId -> cantidad LEIDA del
 * carro, nunca como una lista de exitos. Un producto que la tienda no devolvio
 * queda en 'failed' aunque la llamada haya respondido 200: el status HTTP y el
 * arreglo `errors` de GraphQL no dicen nada sobre si el producto entro.
 */
function resultsFromConfirmation(job, confirmed) {
  const quantityByItemId = new Map(
    (Array.isArray(confirmed) ? confirmed : [])
      .map(entry => [safeText(entry?.itemId, 100), Math.max(0, Math.round(Number(entry?.quantity) || 0))])
      .filter(([itemId, quantity]) => itemId && quantity > 0),
  );

  return job.items.map(item => {
    const quantity = quantityByItemId.get(item.id) || 0;
    if (quantity <= 0) {
      return {
        itemId: item.id,
        name: item.name,
        status: 'failed',
        detail: `${job.store} no confirmo este producto en el carro.`,
      };
    }
    return {
      itemId: item.id,
      name: item.name,
      status: 'added',
      detail: quantity >= item.quantity
        ? `Confirmado en el carro con cantidad ${quantity}.`
        : `Confirmado en el carro, pero con cantidad ${quantity} de las ${item.quantity} pedidas.`,
    };
  });
}

async function pauseJob(job, detail) {
  job.status = 'paused';
  job.inFlightItemId = null;
  await saveJob(job);
  const payload = progress(job, detail, 'paused');
  await notifySource(job, payload);
  return payload;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    if (message?.type === 'START_CART_LOAD') {
      const request = sanitizeRequest(message.payload);
      if (!request || !sender.tab?.id) {
        sendResponse({
          ok: false,
          progress: {
            store: safeText(message.payload?.store, 80) || 'Supermercado',
            status: 'failed',
            total: 0,
            added: 0,
            failed: 0,
            detail: 'El plan recibido no es válido, la tienda no es compatible o supera 200 productos.',
          },
        });
        return;
      }

      // Limpiar cualquier trabajo anterior para no bloquear nuevas cargas
      const activeJob = await getJob();
      if (activeJob?.retailerTabId) {
        try {
          await chrome.tabs.remove(activeJob.retailerTabId);
        } catch {
          // Pestaña ya cerrada
        }
      }

      const job = {
        id: crypto.randomUUID(),
        store: request.store,
        items: request.items,
        currentIndex: 0,
        sourceTabId: sender.tab.id,
        retailerTabId: null,
        status: 'opening',
        inFlightItemId: null,
        results: [],
        createdAt: new Date().toISOString(),
      };
      const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
      job.retailerTabId = tab.id || null;
      job.status = 'loading';
      await saveJob(job);
      if (!tab.id) throw new Error(`No fue posible crear la pestaña de ${job.store}.`);
      await chrome.tabs.update(tab.id, { url: targetUrl(job.store, job.items[0]) });
      const payload = progress(job, `Cargando 1 de ${job.items.length}: ${job.items[0].name}`, 'loading');
      await notifySource(job, payload);
      sendResponse({ ok: true, progress: payload });
      return;
    }

    const job = await getJob();
    if (!job || !sender.tab?.id || sender.tab.id !== job.retailerTabId) {
      sendResponse({ ok: false });
      return;
    }

    if (message?.type === 'GET_CART_LOAD_JOB') {
      sendResponse({
        ok: true,
        job: {
          id: job.id,
          store: job.store,
          status: job.status,
          currentIndex: job.currentIndex,
          item: job.items[job.currentIndex],
          allItems: job.items,
          total: job.items.length,
          added: job.results.filter(result => result.status === 'added').length,
          failed: job.results.filter(result => result.status === 'failed').length,
          targetUrl: job.items[job.currentIndex]
            ? targetUrl(job.store, job.items[job.currentIndex])
            : null,
          inFlightItemId: job.inFlightItemId,
        },
      });
      return;
    }

    if (message?.type === 'REPORT_CART_API_RESULTS') {
      // Cierre de la carga por API. El content script solo puede informar lo
      // que leyo de vuelta del carro de la tienda: aca no se asume nada, y un
      // producto ausente de esa lectura se cierra como no cargado.
      job.results = resultsFromConfirmation(job, message.confirmed);
      job.currentIndex = job.items.length;
      job.inFlightItemId = null;
      const failedCount = job.results.filter(result => result.status === 'failed').length;
      job.status = failedCount > 0 ? 'completed_with_issues' : 'completed';
      await saveJob(job);
      const addedCount = job.results.length - failedCount;
      const apiDetail = failedCount > 0
        ? `Carro de ${job.store}: ${addedCount} productos agregados y ${failedCount} que la tienda no cargo.`
        : `Carro de ${job.store} listo: ${addedCount} productos agregados al carro.`;
      const apiPayload = progress(job, apiDetail, job.status);
      await notifySource(job, apiPayload);
      const apiConfig = storeConfig(job.store);
      if (job.retailerTabId && apiConfig?.cartUrl) {
        try {
          await chrome.tabs.update(job.retailerTabId, { url: apiConfig.cartUrl });
        } catch {
          // La pestana pudo cerrarse; el carro ya quedo cargado igual.
        }
      }
      sendResponse({ ok: true, done: true, progress: apiPayload });
      return;
    }

    if (message?.type === 'CLAIM_CART_ITEM') {
      const item = job.items[job.currentIndex];
      if (!item || message.itemId !== item.id || job.inFlightItemId) {
        sendResponse({ ok: false, alreadyClaimed: Boolean(job.inFlightItemId) });
        return;
      }
      job.inFlightItemId = item.id;
      job.status = 'loading';
      await saveJob(job);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'PAUSE_CART_LOAD') {
      const payload = await pauseJob(job, safeText(message.detail, 300) || 'La carga necesita tu intervención.');
      sendResponse({ ok: true, progress: payload });
      return;
    }

    if (message?.type === 'RETRY_CART_ITEM') {
      job.inFlightItemId = null;
      job.status = 'loading';
      await saveJob(job);
      const payload = progress(job, `Reintentando ${job.items[job.currentIndex]?.name || 'producto'}…`, 'loading');
      await notifySource(job, payload);
      sendResponse({ ok: true, progress: payload });
      return;
    }

    if (message?.type === 'COMPLETE_CART_ITEM') {
      const item = job.items[job.currentIndex];
      if (!item || item.id !== message.itemId || job.inFlightItemId !== item.id) {
        sendResponse({ ok: false });
        return;
      }
      const resultStatus = message.added ? 'added' : 'failed';
      job.results.push({
        itemId: item.id,
        name: item.name,
        status: resultStatus,
        detail: safeText(message.detail, 300),
      });
      job.currentIndex += 1;
      job.inFlightItemId = null;

      if (job.currentIndex >= job.items.length) {
        const failed = job.results.filter(result => result.status === 'failed').length;
        job.status = failed > 0 ? 'completed_with_issues' : 'completed';
        await saveJob(job);
        const detail = failed > 0
          ? `Carro de ${job.store} listo: ${job.results.length - failed} productos agregados y ${failed} agotados.`
          : `Carro de ${job.store} listo: ${job.results.length} productos agregados al carro.`;
        const payload = progress(job, detail, job.status);
        await notifySource(job, payload);

        // Redirigir la pestaña del supermercado directamente al carro oficial
        if (job.retailerTabId && storeConfig(job.store)?.cartUrl) {
          try {
            await chrome.tabs.update(job.retailerTabId, { url: storeConfig(job.store).cartUrl });
          } catch {
            // Tab might be closed
          }
        }

        sendResponse({ ok: true, done: true, progress: payload });
        return;
      }

      job.status = 'loading';
      await saveJob(job);
      const nextItem = job.items[job.currentIndex];
      const payload = progress(
        job,
        `Cargando ${job.currentIndex + 1} de ${job.items.length}: ${nextItem.name}`,
        'loading',
      );
      await notifySource(job, payload);
      if (!job.retailerTabId) throw new Error(`Se perdió la pestaña de ${job.store}.`);
      await chrome.tabs.update(job.retailerTabId, { url: targetUrl(job.store, nextItem) });
      sendResponse({
        ok: true,
        done: false,
        progress: payload,
      });
      return;
    }

    sendResponse({ ok: false });
  })().catch(error => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Fallo inesperado del cargador.',
    });
  });
  return true;
});
