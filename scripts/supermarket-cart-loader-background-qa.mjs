import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');
const extensionRoot = path.join(root, 'extensions', 'convive-cart-loader');
const backgroundSource = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
const storeConfigSource = fs.readFileSync(path.join(extensionRoot, 'store-config.js'), 'utf8');

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
    initialCartCount: null,
    latestCartCount: null,
    removedCartCount: null,
    replaceCart: true,
    cartResetStatus: 'pending',
    results: [],
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  };
}

function startPayload() {
  return {
    version: 1,
    store: 'Jumbo',
    replaceCart: true,
    items: [{
      id: 'new-item',
      name: 'Cebolla Malla 1 kg',
      requestedTerm: 'cebolla',
      quantity: 1,
      productUrl: 'https://www.jumbo.cl/cebolla/p',
    }],
  };
}

function createHarness({ activeJob, retailerTab }) {
  const state = {
    job: activeJob,
    createdTabs: [],
    updatedTabs: [],
    notifications: [],
    runtimeListener: null,
    removedListener: null,
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
      async get(tabId) {
        if (!retailerTab || retailerTab.id !== tabId) throw new Error('No tab with id');
        return retailerTab;
      },
      async create(options) {
        const tab = { id: 900, ...options };
        state.createdTabs.push(tab);
        return tab;
      },
      async update(tabId, changes) {
        state.updatedTabs.push({ tabId, changes });
        return { id: tabId, ...changes };
      },
      async sendMessage(tabId, message) {
        state.notifications.push({ tabId, message });
      },
      onRemoved: {
        addListener(listener) {
          state.removedListener = listener;
        },
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

function sendStart(state) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('START_CART_LOAD no respondió.')), 1_000);
    state.runtimeListener(
      { type: 'START_CART_LOAD', payload: startPayload() },
      { tab: { id: 11 } },
      response => {
        clearTimeout(timeout);
        resolve(response);
      },
    );
  });
}

function sendMessage(state, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${message.type} no respondió.`)), 1_000);
    state.runtimeListener(
      message,
      { tab: { id: 77 } },
      response => {
        clearTimeout(timeout);
        resolve(response);
      },
    );
  });
}

async function main() {
  const orphaned = createHarness({ activeJob: sampleJob(), retailerTab: null });
  const orphanedResponse = await sendStart(orphaned);
  check(orphanedResponse.ok === true, 'La carga huérfana no permitió iniciar de nuevo.');
  check(orphaned.createdTabs.length === 1, 'No se abrió una pestaña nueva tras liberar la carga huérfana.');
  check(orphaned.job.id === 'new-job', 'El trabajo huérfano no fue reemplazado.');
  check(
    orphaned.notifications.some(entry => entry.message.payload?.detail?.includes('fue liberada')),
    'La web no recibe una explicación al liberar la carga huérfana.',
  );

  const live = createHarness({
    activeJob: sampleJob(),
    retailerTab: { id: 77, url: 'https://www.jumbo.cl/longaniza/p' },
  });
  const liveResponse = await sendStart(live);
  check(liveResponse.ok === true && liveResponse.resumed === true, 'La carga activa no se reanudó.');
  check(live.createdTabs.length === 0, 'Se abrió una segunda pestaña para una carga activa.');
  check(live.job.id === 'existing-job' && live.job.sourceTabId === 11, 'La carga activa perdió su identidad o fuente.');
  check(
    live.updatedTabs.some(entry => entry.tabId === 77 && entry.changes.active === true),
    'La pestaña de una carga activa no volvió al frente.',
  );

  const closed = createHarness({
    activeJob: sampleJob(),
    retailerTab: { id: 77, url: 'https://www.jumbo.cl/longaniza/p' },
  });
  closed.removedListener(77);
  await new Promise(resolve => setTimeout(resolve, 0));
  check(closed.job.status === 'abandoned', 'Cerrar la pestaña no liberó el trabajo activo.');
  check(
    closed.notifications.some(entry => entry.message.payload?.status === 'failed'),
    'La web no fue notificada al cerrar la pestaña del supermercado.',
  );

  const emptyAfterAdds = createHarness({
    activeJob: sampleJob({
      inFlightItemId: 'item-1',
      initialCartCount: 0,
      latestCartCount: 0,
      removedCartCount: 0,
      cartResetStatus: 'completed',
    }),
    retailerTab: { id: 77, url: 'https://www.jumbo.cl/longaniza/p' },
  });
  const emptyResponse = await sendMessage(emptyAfterAdds, {
    type: 'COMPLETE_CART_ITEM',
    itemId: 'item-1',
    added: true,
    cartCountAfter: 0,
    detail: 'El botón cambió visualmente.',
  });
  check(emptyResponse.done === true, 'La carga vacía no emitió un resultado final.');
  check(emptyResponse.progress?.status === 'failed', 'Un carro en cero todavía se marcó como completado.');
  check(emptyAfterAdds.job.status === 'failed', 'El trabajo persistido conserva un éxito falso.');
  check(
    emptyResponse.progress?.detail?.includes('contador sigue en 0'),
    'La web no recibe una explicación clara cuando el carro queda vacío.',
  );

  console.log('Cart loader stale-job and zero-cart QA passed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
