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
  }));
  if (items.some(item => !item.name)) return null;
  return {
    store: payload.store,
    items,
  };
}

function progress(job, detail, status = job.status) {
  const previousCartCount = Number.isInteger(job.initialCartCount) ? job.initialCartCount : undefined;
  const currentCartCount = Number.isInteger(job.latestCartCount) ? job.latestCartCount : undefined;
  return {
    jobId: job.id,
    store: job.store,
    status,
    total: job.items.length,
    added: job.results.filter(result => result.status === 'added').length,
    failed: job.results.filter(result => result.status === 'failed').length,
    currentItem: job.items[job.currentIndex]?.name,
    previousCartCount,
    currentCartCount,
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

      const activeJob = await getJob();
      if (activeJob && ['opening', 'loading', 'paused'].includes(activeJob.status)) {
        sendResponse({
          ok: false,
          progress: {
            store: request.store,
            status: 'failed',
            total: request.items.length,
            added: 0,
            failed: 0,
            detail: `Ya hay una carga de ${activeJob.store} en curso. Termínala o reanúdala en su pestaña antes de abrir otra.`,
          },
        });
        return;
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
        initialCartCount: null,
        latestCartCount: null,
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

    if (message?.type === 'CLAIM_CART_ITEM') {
      const item = job.items[job.currentIndex];
      if (!item || message.itemId !== item.id || job.inFlightItemId) {
        sendResponse({ ok: false, alreadyClaimed: Boolean(job.inFlightItemId) });
        return;
      }
      const cartCountBefore = Number(message.cartCountBefore);
      if (
        job.currentIndex === 0
        && job.initialCartCount === null
        && Number.isInteger(cartCountBefore)
        && cartCountBefore >= 0
        && cartCountBefore <= 10_000
      ) {
        job.initialCartCount = cartCountBefore;
        job.latestCartCount = cartCountBefore;
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
      const cartCountAfter = Number(message.cartCountAfter);
      if (
        Number.isInteger(cartCountAfter)
        && cartCountAfter >= 0
        && cartCountAfter <= 10_000
      ) {
        job.latestCartCount = cartCountAfter;
      }
      const resultStatus = message.added ? 'added' : 'failed';
      job.results.push({
        itemId: item.id,
        name: item.name,
        status: resultStatus,
        quantity: item.quantity,
        detail: safeText(message.detail, 300),
      });
      job.currentIndex += 1;
      job.inFlightItemId = null;

      if (job.currentIndex >= job.items.length) {
        const failed = job.results.filter(result => result.status === 'failed').length;
        const added = job.results.length - failed;
        const previousCartCount = Number.isInteger(job.initialCartCount) ? job.initialCartCount : null;
        const currentCartCount = Number.isInteger(job.latestCartCount) ? job.latestCartCount : null;
        const observedCartDetail = previousCartCount !== null && currentCartCount !== null
          ? ` El contador del carro marcaba ${previousCartCount} antes de CoCo y ahora marca ${currentCartCount}.`
          : '';
        job.status = failed > 0 ? 'completed_with_issues' : 'completed';
        await saveJob(job);
        const detail = failed > 0
          ? `Carro de ${job.store} procesado. ${added} productos de tu lista quedaron preparados y ${failed} pendientes para revisar.${observedCartDetail}`
          : `Carro de ${job.store} listo: ${added} productos de tu lista quedaron preparados.${observedCartDetail} Revisa disponibilidad y continúa al pago cuando quieras.`;
        const payload = progress(job, detail, job.status);
        await notifySource(job, payload);
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
