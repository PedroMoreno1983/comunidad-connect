importScripts('store-config.js');

const ACTIVE_JOB_KEY = 'conviveActiveCartJob';
const ACTIVE_JOB_STATUSES = new Set(['opening', 'loading', 'paused']);
const OPENING_TAB_GRACE_MS = 15_000;
const MAX_ITEMS = 200;
const MAX_QUANTITY = 99;
const STORE_CONFIGS = globalThis.CONVIVE_STORE_CONFIGS;

function safeText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function storeConfig(store) {
  return typeof store === 'string' ? STORE_CONFIGS[store] : undefined;
}

function rewriteLiderUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname !== 'www.lider.cl' && url.hostname !== 'lider.cl') return value;
    url.hostname = 'super.lider.cl';
    if (url.pathname.startsWith('/supermercado/search')) {
      url.pathname = '/search';
    }
    return url.toString();
  } catch {
    return value;
  }
}

function safeProductUrl(value, config) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const rewritten = config.label === 'Lider' ? rewriteLiderUrl(value) : value;
    const url = new URL(rewritten);
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
    // Codigo de la tienda: unico modo de cargar por API y de cruzar despues
    // lo que la tienda confirmo contra lo que la persona pidio.
    sku: safeText(item?.sku, 60),
    // Lider lo exige ademas del sku; el resto de las tiendas lo dejan vacio.
    offerId: safeText(item?.offerId, 60),
  }));
  if (items.some(item => !item.name)) return null;
  return {
    store: payload.store,
    items,
    replaceCart: payload.replaceCart === true,
  };
}

function progress(job, detail, status = job.status) {
  const previousCartCount = Number.isInteger(job.initialCartCount) ? job.initialCartCount : undefined;
  const currentCartCount = Number.isInteger(job.latestCartCount) ? job.latestCartCount : undefined;
  const removedCartCount = Number.isInteger(job.removedCartCount) ? job.removedCartCount : undefined;
  return {
    jobId: job.id,
    store: job.store,
    status,
    total: job.items.length,
    added: job.results.filter(result => result.status === 'added').length,
    failed: job.results.filter(result => result.status === 'failed').length,
    currentItem: job.items[job.currentIndex]?.name,
    // Los nombres de lo que NO entro: sin esto la web solo puede decir
    // "falta 1 producto" y la persona no sabe cual ni como agregarlo.
    failedItems: job.results.filter(result => result.status === 'failed').map(result => result.name),
    addedItemIds: job.results.filter(result => result.status === 'added').map(result => result.itemId),
    failedItemDetails: job.results
      .filter(result => result.status === 'failed')
      .map(result => ({
        id: result.itemId,
        name: result.name,
        detail: result.detail || '',
      })),
    previousCartCount,
    currentCartCount,
    removedCartCount,
    cartReplaced: job.replaceCart === true && job.cartResetStatus === 'completed',
    detail,
  };
}

async function saveJob(job) {
  job.updatedAt = new Date().toISOString();
  await chrome.storage.local.set({ [ACTIVE_JOB_KEY]: job });
}

async function getJob() {
  const stored = await chrome.storage.local.get(ACTIVE_JOB_KEY);
  return stored[ACTIVE_JOB_KEY] || null;
}

function jobIsActive(job) {
  return Boolean(job && ACTIVE_JOB_STATUSES.has(job.status));
}

function jobAgeMs(job) {
  const createdAt = Date.parse(job?.createdAt || '');
  return Number.isFinite(createdAt) ? Math.max(0, Date.now() - createdAt) : Infinity;
}

async function liveRetailerTab(job) {
  if (!jobIsActive(job) || !Number.isInteger(job.retailerTabId)) return null;
  let tab;
  try {
    tab = await chrome.tabs.get(job.retailerTabId);
  } catch {
    return null;
  }

  const tabUrl = tab.pendingUrl || tab.url || '';
  if (tabUrl === 'about:blank') {
    return jobAgeMs(job) <= OPENING_TAB_GRACE_MS ? tab : null;
  }

  try {
    const config = storeConfig(job.store);
    const url = new URL(tabUrl);
    return config?.hosts.includes(url.hostname) ? tab : null;
  } catch {
    return null;
  }
}

async function abandonJob(job, detail) {
  job.status = 'abandoned';
  job.inFlightItemId = null;
  await saveJob(job);
  const payload = progress(job, detail, 'failed');
  await notifySource(job, payload);
  return payload;
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
 * `confirmed` son pares itemId -> cantidad LEIDA del carro, nunca una lista de
 * exitos. Un producto ausente de esa lectura queda en 'failed' aunque la llamada
 * haya respondido 200: ni el status HTTP ni `errors` dicen si el producto entro.
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

      const activeJob = await getJob();
      if (jobIsActive(activeJob)) {
        const activeTab = await liveRetailerTab(activeJob);
        if (activeTab) {
          activeJob.sourceTabId = sender.tab.id;
          await saveJob(activeJob);
          await chrome.tabs.update(activeTab.id, { active: true });
          const resumedStatus = activeJob.status === 'paused' ? 'paused' : 'loading';
          const payload = progress(
            activeJob,
            activeJob.status === 'paused'
              ? `La carga de ${activeJob.store} necesita tu intervención en la pestaña que acabamos de abrir.`
              : `Retomando la carga de ${activeJob.store} en su pestaña.`,
            resumedStatus,
          );
          await notifySource(activeJob, payload);
          sendResponse({ ok: true, resumed: true, progress: payload });
          return;
        }

        await abandonJob(
          activeJob,
          `La pestaña de ${activeJob.store} se cerró antes de terminar. La carga anterior fue liberada para poder empezar de nuevo.`,
        );
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
        removedCartCount: null,
        replaceCart: request.replaceCart,
        cartResetStatus: request.replaceCart ? 'pending' : 'skipped',
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
          replaceCart: job.replaceCart === true,
          cartResetStatus: job.cartResetStatus || 'skipped',
        },
      });
      return;
    }

    if (message?.type === 'COMPLETE_CART_RESET') {
      if (!job.replaceCart || job.currentIndex !== 0 || job.cartResetStatus !== 'pending') {
        sendResponse({ ok: false });
        return;
      }
      const cartCountBefore = Number(message.cartCountBefore);
      const cartCountAfter = Number(message.cartCountAfter);
      if (
        !Number.isInteger(cartCountBefore)
        || !Number.isInteger(cartCountAfter)
        || cartCountBefore < 0
        || cartCountAfter !== 0
        || cartCountBefore > 10_000
      ) {
        sendResponse({ ok: false });
        return;
      }
      job.initialCartCount = cartCountBefore;
      job.latestCartCount = 0;
      job.removedCartCount = cartCountBefore;
      job.cartResetStatus = 'completed';
      await saveJob(job);
      const payload = progress(
        job,
        cartCountBefore > 0
          ? `Carro anterior vaciado: se retiraron ${cartCountBefore} unidades. Cargando la lista nueva…`
          : 'El carro ya estaba vacío. Cargando la lista nueva…',
        'loading',
      );
      await notifySource(job, payload);
      sendResponse({ ok: true, progress: payload });
      return;
    }

    if (message?.type === 'REPORT_CART_API_RESULTS') {
      // Cierre de la carga por API: solo entra lo que el content script leyo de
      // vuelta del carro. Un producto ausente se cierra como no cargado.
      job.results = resultsFromConfirmation(job, message.confirmed);
      job.currentIndex = job.items.length;
      job.inFlightItemId = null;
      const reportedCount = Number(message.cartCount);
      if (Number.isInteger(reportedCount)) job.latestCartCount = reportedCount;
      const failedCount = job.results.filter(result => result.status === 'failed').length;
      job.status = failedCount > 0 ? 'completed_with_issues' : 'completed';
      await saveJob(job);
      const addedCount = job.results.length - failedCount;
      const apiPayload = progress(
        job,
        failedCount > 0
          ? `Carro de ${job.store}: ${addedCount} productos agregados y ${failedCount} que la tienda no cargo.`
          : `Carro de ${job.store} listo: ${addedCount} productos agregados al carro.`,
        job.status,
      );
      await notifySource(job, apiPayload);
      sendResponse({ ok: true, done: true, progress: apiPayload });
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
      /*
       * El reclamo previo existe para que una recarga no agregue dos veces el
       * mismo producto. Pero un FALLO no agrega nada, y el content script lo
       * reporta antes de reclamar (p. ej. una ficha que hoy da 404 y no tiene
       * boton de agregar). Exigir reclamo tambien ahi dejaba el trabajo
       * congelado para siempre en ese producto: el job nunca avanzaba.
       */
      const claimedByThisItem = job.inFlightItemId === item?.id;
      const unclaimedFailure = message.added !== true && !job.inFlightItemId;
      if (!item || item.id !== message.itemId || !(claimedByThisItem || unclaimedFailure)) {
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
          ? job.replaceCart && job.cartResetStatus === 'completed'
            ? ` Se eliminaron ${job.removedCartCount || 0} unidades anteriores y el carro nuevo ahora marca ${currentCartCount}.`
            : ` El contador del carro marcaba ${previousCartCount} antes de CoCo y ahora marca ${currentCartCount}.`
          : '';
        const cartStayedEmpty = job.replaceCart === true
          && job.cartResetStatus === 'completed'
          && added > 0
          && currentCartCount === 0;
        job.status = cartStayedEmpty
          ? 'failed'
          : failed > 0
            ? 'completed_with_issues'
            : 'completed';
        await saveJob(job);
        const detail = cartStayedEmpty
          ? `No se pudo confirmar ningún producto en el carro de ${job.store}. El contador sigue en 0; vuelve a intentarlo o agrégalos manualmente desde las fichas.`
          : failed > 0
            ? `Carga incompleta en ${job.store}: ${added} productos confirmados y ${failed} pendientes para revisar.${observedCartDetail}`
            : `Carro de ${job.store} confirmado: ${added} productos de tu lista quedaron preparados.${observedCartDetail} Revisa disponibilidad y continúa al pago cuando quieras.`;
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

chrome.tabs.onRemoved.addListener(tabId => {
  void (async () => {
    const job = await getJob();
    if (!jobIsActive(job) || job.retailerTabId !== tabId) return;
    await abandonJob(
      job,
      `La pestaña de ${job.store} se cerró antes de terminar. Pulsa "Cargar lista nueva" para comenzar otra vez.`,
    );
  })();
});
