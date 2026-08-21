/**
 * QA de comportamiento del service worker del cargador.
 *
 * Ejecuta `background.js` contra un `chrome` simulado y comprueba las garantías
 * que el comprador necesita: que una carga anterior no bloquee la siguiente,
 * que sólo la pestaña del comercio pueda mover el trabajo, que una URL de otra
 * tienda no se navegue nunca, y que un faltante se informe como tal en vez de
 * cerrarse como éxito.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');
const extensionRoot = path.join(root, 'extensions', 'convive-cart-loader');
const backgroundSource = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
const storeConfigSource = fs.readFileSync(path.join(extensionRoot, 'store-config.js'), 'utf8');

const NEW_TAB_ID = 900;
const SOURCE_TAB_ID = 11;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function sampleJob(overrides = {}) {
  return {
    id: 'existing-job',
    store: 'Jumbo',
    items: [{
      id: 'item-1',
      name: 'Longaniza 500 g',
      requestedTerm: 'longaniza',
      quantity: 1,
      productUrl: 'https://www.jumbo.cl/longaniza/p',
    }],
    currentIndex: 0,
    sourceTabId: 10,
    retailerTabId: 77,
    status: 'loading',
    inFlightItemId: null,
    results: [],
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  };
}

function startPayload(overrides = {}) {
  return {
    version: 1,
    store: 'Jumbo',
    items: [{
      id: 'new-item',
      name: 'Cebolla Malla 1 kg',
      requestedTerm: 'cebolla',
      quantity: 1,
      productUrl: 'https://www.jumbo.cl/cebolla/p',
    }],
    ...overrides,
  };
}

function createHarness({ activeJob = null } = {}) {
  const state = {
    job: activeJob,
    createdTabs: [],
    updatedTabs: [],
    removedTabs: [],
    notifications: [],
    runtimeListener: null,
  };
  const chrome = {
    storage: {
      local: {
        async get(key) {
          return { [key]: state.job };
        },
        async set(value) {
          state.job = value.conviveActiveCartJob;
        },
      },
    },
    tabs: {
      async create(options) {
        const tab = { id: NEW_TAB_ID, ...options };
        state.createdTabs.push(tab);
        return tab;
      },
      async update(tabId, changes) {
        state.updatedTabs.push({ tabId, changes });
        return { id: tabId, ...changes };
      },
      async remove(tabId) {
        state.removedTabs.push(tabId);
      },
      async sendMessage(tabId, message) {
        state.notifications.push({ tabId, message });
      },
    },
    runtime: {
      onMessage: {
        addListener(listener) {
          state.runtimeListener = listener;
        },
      },
    },
  };
  const context = vm.createContext({
    URL,
    Date,
    Math,
    Number,
    Set,
    chrome,
    crypto: { randomUUID: () => 'new-job' },
    importScripts(file) {
      check(file === 'store-config.js', `Script inesperado: ${file}`);
      new vm.Script(storeConfigSource, { filename: file }).runInContext(context);
    },
  });
  new vm.Script(backgroundSource, { filename: 'background.js' }).runInContext(context);
  return state;
}

function sendFrom(state, tabId, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${message.type} no respondió.`)), 1_000);
    state.runtimeListener(message, { tab: { id: tabId } }, response => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

function sendStart(state, payload = startPayload()) {
  return sendFrom(state, SOURCE_TAB_ID, { type: 'START_CART_LOAD', payload });
}

async function main() {
  // Una carga anterior no puede dejar el cargador inservible: se cierra su
  // pestaña y se empieza de nuevo.
  const leftover = createHarness({ activeJob: sampleJob() });
  const leftoverResponse = await sendStart(leftover);
  check(leftoverResponse.ok === true, 'Una carga anterior sigue bloqueando el inicio de una nueva.');
  check(leftover.removedTabs.includes(77), 'No se cerró la pestaña de la carga anterior.');
  check(leftover.createdTabs.length === 1, 'No se abrió una pestaña para la carga nueva.');
  check(leftover.job.id === 'new-job', 'El trabajo anterior no fue reemplazado.');
  check(leftover.job.sourceTabId === SOURCE_TAB_ID, 'La carga nueva perdió la pestaña de Convive que la pidió.');

  // Una sola pestaña por carga, y la primera navegación va al producto pedido.
  check(
    leftover.updatedTabs.some(entry => entry.tabId === NEW_TAB_ID
      && entry.changes.url === 'https://www.jumbo.cl/cebolla/p'),
    'La carga no navega a la ficha exacta del primer producto.',
  );

  // Una URL alojada en otra tienda nunca se navega: se cae a la búsqueda propia.
  const foreignUrl = createHarness();
  await sendStart(foreignUrl, startPayload({
    items: [{
      id: 'foreign',
      name: 'Cebolla',
      requestedTerm: 'cebolla',
      quantity: 1,
      productUrl: 'https://www.lider.cl/cebolla/p',
    }],
  }));
  const navigated = foreignUrl.updatedTabs.map(entry => entry.changes.url).filter(Boolean);
  check(
    navigated.every(url => !url.includes('lider.cl')),
    'Una URL de otra tienda llegó a navegarse.',
  );
  check(
    navigated.some(url => url.startsWith('https://www.jumbo.cl/busqueda')),
    'Sin URL válida no se recurre a la búsqueda de la tienda pedida.',
  );

  // Planes inválidos se rechazan sin abrir nada.
  const invalid = createHarness();
  const invalidResponse = await sendStart(invalid, startPayload({ store: 'Supermercado Inventado' }));
  check(invalidResponse.ok === false, 'Se aceptó un plan para una tienda no soportada.');
  check(invalid.createdTabs.length === 0, 'Un plan inválido abrió una pestaña igualmente.');

  const empty = createHarness();
  const emptyResponse = await sendStart(empty, startPayload({ items: [] }));
  check(emptyResponse.ok === false, 'Se aceptó un plan sin productos.');

  // Sólo la pestaña del comercio puede mover el trabajo.
  const isolated = createHarness();
  await sendStart(isolated);
  const intruder = await sendFrom(isolated, 4242, { type: 'CLAIM_CART_ITEM', itemId: 'new-item' });
  check(intruder.ok === false, 'Una pestaña ajena pudo manipular la carga en curso.');

  // Un producto no se puede reclamar dos veces (recargas de la ficha).
  const claimed = createHarness();
  await sendStart(claimed);
  const firstClaim = await sendFrom(claimed, NEW_TAB_ID, { type: 'CLAIM_CART_ITEM', itemId: 'new-item' });
  check(firstClaim.ok === true, 'No se pudo reclamar el primer producto.');
  const secondClaim = await sendFrom(claimed, NEW_TAB_ID, { type: 'CLAIM_CART_ITEM', itemId: 'new-item' });
  check(secondClaim.ok === false && secondClaim.alreadyClaimed === true, 'Un producto se pudo reclamar dos veces.');

  // Un faltante cierra la carga como incompleta, no como éxito.
  const withMissing = createHarness();
  await sendStart(withMissing, startPayload({
    items: [
      { id: 'a', name: 'Cebolla', requestedTerm: 'cebolla', quantity: 1 },
      { id: 'b', name: 'Arroz', requestedTerm: 'arroz', quantity: 1 },
    ],
  }));
  await sendFrom(withMissing, NEW_TAB_ID, { type: 'CLAIM_CART_ITEM', itemId: 'a' });
  await sendFrom(withMissing, NEW_TAB_ID, {
    type: 'COMPLETE_CART_ITEM', itemId: 'a', added: false, detail: 'Agotado.',
  });
  await sendFrom(withMissing, NEW_TAB_ID, { type: 'CLAIM_CART_ITEM', itemId: 'b' });
  const finalResponse = await sendFrom(withMissing, NEW_TAB_ID, {
    type: 'COMPLETE_CART_ITEM', itemId: 'b', added: true, detail: 'Agregado.',
  });
  check(finalResponse.done === true, 'La carga no emitió un resultado final.');
  check(
    finalResponse.progress?.status === 'completed_with_issues',
    'Una carga con faltantes se cerró como completada.',
  );
  check(finalResponse.progress?.failed === 1, 'El resultado no informa el producto que faltó.');
  check(
    withMissing.notifications.some(entry => entry.message.payload?.detail?.includes('agotados')),
    'La web no recibe el detalle de los faltantes.',
  );

  // Al terminar, la pestaña no se manda a un destino ajeno al supermercado.
  const finalUrls = withMissing.updatedTabs.map(entry => entry.changes.url).filter(Boolean);
  check(
    finalUrls.every(url => !url.includes('google.com')),
    'La pestaña del comprador vuelve a terminar en un buscador ajeno a la tienda.',
  );

  console.log('Cart loader background behaviour QA passed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
