const ALLOWED_ORIGINS = new Set([
  'https://conviveconnect.com',
  'https://www.conviveconnect.com',
  'http://localhost:3000',
  'http://localhost:3012',
]);

function postToConvive(type, payload) {
  window.postMessage({
    source: 'convive-cart-loader',
    type,
    payload,
  }, window.location.origin);
}

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

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  if (!ALLOWED_ORIGINS.has(event.origin)) return;
  const message = event.data;
  if (!message || message.source !== 'convive-connect') return;

  if (message.type === 'CONVIVE_CART_LOADER_PING') {
    postToConvive('CONVIVE_CART_LOADER_READY');
    return;
  }

  if (message.type === 'CONVIVE_CART_LOADER_START') {
    void runtimeMessage({
      type: 'START_CART_LOAD',
      payload: message.payload,
    }).then(response => {
      if (!response?.ok) {
        postToConvive('CONVIVE_CART_LOADER_PROGRESS', response?.progress);
      }
    }).catch(error => {
      postToConvive('CONVIVE_CART_LOADER_PROGRESS', {
        store: message.payload?.store || 'Lider',
        status: 'failed',
        total: message.payload?.items?.length || 0,
        added: 0,
        failed: 0,
        detail: error instanceof Error ? error.message : 'No fue posible iniciar el cargador.',
      });
    });
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'CART_LOAD_PROGRESS') {
    postToConvive('CONVIVE_CART_LOADER_PROGRESS', message.payload);
  }
});
