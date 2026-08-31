const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const extensionRoot = path.join(root, 'extensions', 'convive-shopping-assistant');
const requiredFiles = [
  'manifest.json',
  'store-config.js',
  'page-signals.js',
  'background.js',
  'convive-bridge.js',
  'retailer-loader.js',
  'loader.css',
  'README.md',
];
const stores = ['Lider', 'Jumbo', 'Santa Isabel', 'Unimarc', 'Tottus', 'aCuenta', 'Irurzun'];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

for (const file of requiredFiles) {
  check(fs.existsSync(path.join(extensionRoot, file)), `Falta archivo de extensión: ${file}`);
}
check(!fs.existsSync(path.join(extensionRoot, 'lider-loader.js')), 'Quedó el loader antiguo de Lider sin usar.');

const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
check(manifest.manifest_version === 3, 'La extensión debe usar Manifest V3.');
check(/^\d+\.\d+\.\d+$/.test(manifest.version), 'La version del manifest debe ser semver.');
check(manifest.permissions.includes('storage'), 'Falta permiso storage para reanudar.');
check(
  manifest.content_scripts.some(script => Array.isArray(script.js) && script.js.includes('page-signals.js') && script.js.includes('retailer-loader.js')),
  'El content script de las tiendas no carga page-signals.js antes del cargador.',
);
check(manifest.permissions.includes('tabs'), 'Falta permiso tabs para usar una única pestaña.');
check(!manifest.permissions.includes('<all_urls>'), 'No se permite acceso global a sitios.');
check(!manifest.host_permissions.includes('<all_urls>'), 'No se permite acceso global a hosts.');

const expectedHosts = new Set([
  'https://super.lider.cl/*',
  'https://www.lider.cl/*',
  'https://lider.cl/*',
  'https://www.jumbo.cl/*',
  'https://jumbo.cl/*',
  'https://www.santaisabel.cl/*',
  'https://santaisabel.cl/*',
  'https://www.unimarc.cl/*',
  'https://unimarc.cl/*',
  'https://www.tottus.cl/*',
  'https://tottus.cl/*',
  'https://www.acuenta.cl/*',
  'https://acuenta.cl/*',
  'https://irurzun.cl/*',
  'https://www.irurzun.cl/*',
  'https://i5.walmartimages.cl/*',
]);
check(
  manifest.host_permissions.length === expectedHosts.size
    && manifest.host_permissions.every(permission => expectedHosts.has(permission)),
  'Los permisos de host no coinciden con los supermercados autorizados.',
);

const bridge = fs.readFileSync(path.join(extensionRoot, 'convive-bridge.js'), 'utf8');
check(bridge.includes('https://conviveconnect.com'), 'El puente no valida el origen de producción.');
check(bridge.includes('event.source !== window'), 'El puente no valida la ventana emisora.');
check(bridge.includes('event.origin !== window.location.origin'), 'El puente no valida el origen del mensaje.');
check(
  bridge.includes('chrome.runtime.getManifest().version')
    && bridge.includes('shopping-assistant-v1')
    && bridge.includes('cart-baseline-v1')
    && bridge.includes('cart-auto-open-v2')
    && bridge.includes('cart-api-load-v1'),
  'El puente no informa una versión y capacidades verificables.',
);

const configSource = fs.readFileSync(path.join(extensionRoot, 'store-config.js'), 'utf8');
const configContext = { globalThis: {} };
vm.createContext(configContext);
new vm.Script(configSource, { filename: 'store-config.js' }).runInContext(configContext);
const configs = configContext.globalThis.CONVIVE_STORE_CONFIGS;
for (const store of stores) {
  check(configs[store], `Falta adaptador para ${store}.`);
  check(configs[store].hosts.length > 0, `${store} no acota sus hosts.`);
  check(configs[store].addSelectors.length > 0, `${store} no declara selectores de alta.`);
  check(typeof configs[store].searchUrl === 'function', `${store} no declara URL de búsqueda.`);
}
check(
  stores.every(store => !configs[store].blockedText.some(fragment => fragment.toLowerCase() === 'un momento')),
  'Una frase comercial genérica vuelve a activar un falso CAPTCHA.',
);
check(
  configs.Lider.searchUrl('leche').startsWith('https://super.lider.cl/search?'),
  'Lider conserva la ruta antigua de www.lider.cl que hoy redirige a la home y pierde la búsqueda.',
);
check(
  configs.Lider.addSelectors[0] === 'button[data-automation-id="add-to-cart"]',
  'Lider volvió a clicar el skeleton en vez del botón real.',
);
check(
  configs.Tottus.addSelectors[0] === '#add-to-cart-button',
  'Tottus perdió el selector verificado #add-to-cart-button.',
);
check(
  configs.aCuenta.addSelectors[0] === 'button[data-add-button="true"]',
  'aCuenta perdió el selector verificado data-add-button.',
);
check(!configs.Tottus.cartApi && !configs.aCuenta.cartApi, 'Tottus o aCuenta declararon un adaptador de API sin captura.');
check(
  configSource.includes("padStart(14, '0')") && configSource.includes('liderGraphqlDocument'),
  'Lider no paddea el usItemId o no lee el documento GraphQL del bundle.',
);
check(
  configSource.includes('data?.cart') && configSource.includes('query getCart'),
  'getCart de Lider no lee el campo raíz `cart` de Orchestra.',
);
check(
  configs.Irurzun.searchUrl('arroz').startsWith('https://irurzun.cl/search?'),
  'Irurzun conserva la ruta /buscar inexistente.',
);

const supermarketText = fs.readFileSync(
  path.join(root, 'src', 'lib', 'supermarketText.ts'),
  'utf8',
);
check(
  supermarketText.includes('Lider: query => `https://super.lider.cl/search?query=')
    && !/Lider: query => `https:\/\/www\.lider\.cl\/supermercado\/search/.test(supermarketText),
  'El catálogo en vivo y los enlaces de respaldo siguen usando la búsqueda muerta de Lider.',
);
check(
  supermarketText.includes('Irurzun: query => `https://irurzun.cl/search?q=')
    && !/Irurzun: query => `https:\/\/irurzun\.cl\/buscar/.test(supermarketText),
  'El respaldo de Irurzun sigue apuntando a /buscar.',
);

const loaderHookSource = fs.readFileSync(
  path.join(root, 'src', 'hooks', 'useSupermarketShoppingAssistant.ts'),
  'utf8',
);
check(
  /READY_TIMEOUT_MS = 4_?000/.test(loaderHookSource),
  'El handshake de 1.5s vuelve a marcar el cargador como ausente en todas las tiendas.',
);

const resultItem = fs.readFileSync(
  path.join(root, 'src', 'lib', 'supermarketResultItem.ts'),
  'utf8',
);
const supermarketApiRoute = fs.readFileSync(
  path.join(root, 'src', 'app', 'api', 'supermarket', 'route.ts'),
  'utf8',
);
check(
  resultItem.includes('offerId: catalogOfferId(item)')
    && supermarketApiRoute.includes("from '@/lib/supermarketResultItem'"),
  'La API de supermercado vuelve a serializar canastas sin offerId.',
);

const background = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
check(background.includes('MAX_ITEMS = 200'), 'El cargador no conserva el límite de 200 productos.');
check(background.includes('safeProductUrl(item?.productUrl, config)'), 'Las URLs exactas no se validan por tienda.');
check(background.includes('completed_with_issues'), 'Los faltantes no tienen un cierre explícito.');

const loader = fs.readFileSync(path.join(extensionRoot, 'retailer-loader.js'), 'utf8');
check(loader.includes('pageIsBlocked'), 'Falta pausa ante verificación humana.');
check(loader.includes('interventionPrompt'), 'Falta pausa para seleccionar entrega.');
check(loader.includes('PAGE_SIGNALS.overlayIsBlocking'), 'La puerta de ubicación vuelve a matchear el widget del header.');
check(loader.includes('productIsOutOfStock'), 'Una ficha agotada vuelve a congelar toda la lista en el item 1.');
check(
  loader.includes('hasVisibleEmptyCartState()')
    && loader.includes('observedCartCount')
    && loader.includes('textLooksLikeEmptyCart')
    && loader.includes('dismissEmptyCartMarketing'),
  'El copy nativo de carro vacío vuelve a ignorarse y la carga se congela esperando un contador que nunca confirma 0.',
);
check(
  /intentelo aqui/.test(loader)
    && loader.includes('isCheckoutOrCampaignLabel')
    && !/triggerClick\([^)]*intentelo/i.test(loader),
  'El cargador pulsa la CTA de marketing “Inténtalo aquí” o un pago.',
);
check(loader.includes('está agotado'), 'El cargador no deja nota visible al omitir un agotado.');
check(loader.includes('isAddSkeleton'), 'El skeleton de agregar de Lider vuelve a tomarse como botón.');
check(loader.includes('attemptedItemIds'), 'Un lote parcial de Orchestra vuelve a marcar como fallidos productos no intentados.');
check(background.includes('attemptedItemIds'), 'El background no conserva los productos aún no intentados tras Orchestra.');
check(loader.includes('CLAIM_CART_ITEM'), 'Falta protección contra productos duplicados por recarga.');
check(loader.includes('COMPLETE_CART_ITEM'), 'Falta avance persistente producto por producto.');
// Se verifica el COMPORTAMIENTO, no la redaccion: que el alta se compare
// contra el contador del carro y que un clic sin efecto se cierre como
// pendiente. Atarlo al texto exacto hacia que una reescritura equivalente
// pareciera una regresion.
check(
  loader.includes('before.cartCount !== null && afterCount !== null')
    && /afterCount > before\.cartCount/.test(loader)
    && loader.includes('el carro no cambió')
    && loader.includes('éxito falso'),
  'Un clic sin efecto puede seguir reportándose como éxito.',
);
check(!/\b(click|submit)\s*\(\s*['"`]?(comprar|pagar|confirmar)/i.test(loader), 'El cargador intenta comprar o pagar.');

for (const file of ['store-config.js', 'page-signals.js', 'background.js', 'convive-bridge.js', 'retailer-loader.js']) {
  const source = fs.readFileSync(path.join(extensionRoot, file), 'utf8');
  new vm.Script(source, { filename: file });
}

const page = fs.readFileSync(
  path.join(root, 'src', 'app', '(dashboard)', 'resident', 'supermercado', 'page.tsx'),
  'utf8',
);
const button = fs.readFileSync(
  path.join(root, 'src', 'components', 'resident', 'supermarket', 'ShoppingAssistantButton.tsx'),
  'utf8',
);
const loaderHook = fs.readFileSync(
  path.join(root, 'src', 'hooks', 'useSupermarketShoppingAssistant.ts'),
  'utf8',
);
const supermarketRoute = fs.readFileSync(
  path.join(root, 'src', 'app', 'api', 'supermarket', 'route.ts'),
  'utf8',
);
check(
  !button.includes('/api/supermarket/cart-plan')
    && !button.includes('setCode(')
    && !page.includes('BOOKMARKLET')
    && !page.includes('javascript:(function'),
  'Volvió el flujo de código o marcador que obliga a reconstruir la compra.',
);
check(
  !fs.existsSync(path.join(root, 'public', 'downloads', 'convive-shopping-assistant.zip'))
    && !fs.existsSync(path.join(root, 'public', 'convive-shopping-assistant.zip')),
  'El asistente nuevo no debe volver a distribuirse como ZIP desde Convive.',
);
check(!fs.existsSync(path.join(root, 'src', 'lib', 'supermarket', 'vtexSharedCart.ts')), 'Quedó el adaptador de carro server-to-server.');
check(!button.includes('se abrió con tu carro cargado'), 'La UI todavía afirma un carro cargado sin leer la sesión.');
check(!button.includes('confirmó') || !button.includes('producto(s) en el carro'), 'La UI todavía presenta la API remota como confirmación del carro.');

// --- Invariantes de la carga por API (2026-08-17) ---
// Regresion concreta: el cargador llamaba a `/api/cart/items` y a una mutacion
// GraphQL inventadas, daba por buena la respuesta con `res.ok` y, si "acertaba"
// en la mitad, marcaba TODOS los productos como agregados. Estas tiendas son
// apps Next.js que responden 200 con HTML en rutas inexistentes, asi que el
// carro se informaba lleno y llegaba vacio. Contrato real en
// extensions/convive-shopping-assistant/ADAPTADORES.md
const loaderSource = fs.readFileSync(path.join(extensionRoot, 'retailer-loader.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');

check(!loaderSource.includes('/api/cart/items'), 'Volvio el endpoint de carro inventado.');
check(!loaderSource.includes('AddItemToCart'), 'Volvio la mutacion GraphQL inventada.');
check(!/length\s*\*\s*0\.5/.test(loaderSource), 'Volvio el umbral que daba la carga por buena a medias.');
check(!backgroundSource.includes('COMPLETE_BATCH_CART'), 'Volvio el cierre en bloque que marcaba todo como agregado.');
check(
  backgroundSource.includes('resultsFromConfirmation'),
  'La carga por API no se cierra con lo que la tienda confirmo.',
);
check(
  /sku: safeText\(item\?\.sku/.test(backgroundSource) && /offerId: safeText\(item\?\.offerId/.test(backgroundSource),
  'El sku o el offerId de la web no llegan al cargador.',
);
check(
  backgroundSource.includes('allItems: job.items'),
  'El content script no recibe la canasta completa para la carga por API.',
);
check(
  backgroundSource.includes('rewriteLiderUrl'),
  'Las fichas de www.lider.cl no se reescriben a super.lider.cl.',
);
check(
  backgroundSource.includes('addedItemIds')
    && backgroundSource.includes('failedItemDetails'),
  'La web no recibe qué productos sí entraron ni el detalle de los omitidos.',
);

// Un adaptador de API solo puede existir si devuelve el carro leido: sin esa
// lectura no hay forma de saber que entro.
for (const [storeName, storeConfig] of Object.entries(configs)) {
  if (!storeConfig.cartApi) continue;
  check(typeof storeConfig.cartApi.load === 'function', `${storeName}.cartApi.load debe ser funcion.`);
}
// Sin captura propia, declarar adaptador por parecido de plataforma seria una
// suposicion: solo Lider esta verificado.
check(
  Object.entries(configs).filter(([, storeConfig]) => storeConfig.cartApi).map(([name]) => name).join(',') === 'Lider',
  'Solo Lider debe declarar adaptador de API.',
);

// Cada capacidad declarada debe tener codigo que la respalde: declarar algo
// ausente hace que la app confie en un comportamiento que no ocurre.
const capabilityEvidence = {
  'cart-replace-v1': () => loader.includes('replaceExistingCart'),
  'cart-stale-job-recovery-v1': () => background.includes('liveRetailerTab'),
  'cart-zero-proof-v1': () => background.includes('cartStayedEmpty'),
  'cart-api-load-v1': () => loader.includes('tryCartApi'),
};
for (const [capability, implemented] of Object.entries(capabilityEvidence)) {
  if (!bridge.includes(capability)) continue;
  check(implemented(), `El puente declara ${capability} pero el codigo no lo implementa.`);
}

// Regresion: se llamaba a `/api/cart/items` y a una mutacion GraphQL inventadas,
// se daba por buena la respuesta con `res.ok` y, si "acertaba" en la mitad, se
// marcaban TODOS los productos como agregados. Contrato real en ADAPTADORES.md.
check(!loader.includes('/api/cart/items'), 'Volvio el endpoint de carro inventado.');
check(!loader.includes('AddItemToCart'), 'Volvio la mutacion GraphQL inventada.');
check(!/length\s*\*\s*0\.5/.test(loader), 'Volvio el umbral que daba la carga por buena a medias.');
check(!background.includes('COMPLETE_BATCH_CART'), 'Volvio el cierre en bloque que marcaba todo como agregado.');
check(background.includes('resultsFromConfirmation'), 'La carga por API no se cierra con lo que la tienda confirmo.');
check(
  /sku: safeText\(item\?\.sku/.test(background) && /offerId: safeText\(item\?\.offerId/.test(background),
  'El sku o el offerId de la web no llegan al cargador.',
);

// --- Honestidad de la UI del asistente nuevo ---
check(page.includes('<ShoppingAssistantButton basket={selectedBasket}'), 'La pagina no monta el asistente con la canasta elegida.');
// Sin extension NO puede anunciarse un carro cargado.
check(
  button.includes("assistant.availability !== 'ready'") && button.includes('Falta el Asistente de Compras'),
  'Sin extension la UI podria seguir prometiendo una carga automatica.',
);
check(
  button.includes('No descargues el cargador ZIP anterior'),
  'La UI vuelve a dirigir al paquete descargable antiguo.',
);
// El sku y el offerId viajan por el hook, que es quien arma el payload.
// Sin ellos la carga por API es imposible y solo queda recorrer la interfaz.
check(
  loaderHook.includes('sku: item.sku') && loaderHook.includes('offerId: item.offerId'),
  'El hook no envía el sku o el offerId al cargador.',
);// El progreso distingue fallo y termino: nunca se presenta como listo a ciegas.
check(button.includes("progress.status === 'failed'") && button.includes('done'), 'La UI no distingue una carga fallida de una terminada.');

// --- Capacidades restauradas el 2026-08-18 ---
// La reescritura a 1.2.0 habia dejado fuera estas tres funciones mientras el
// puente las seguia declarando. Se portaron desde codex/fix-supermarket-updater
// y estos checks vuelven a proteger que no se pierdan otra vez.

// cart-replace-v1: la lista nueva vacia el carro anterior en vez de mezclarse.
check(
  loader.includes('replaceExistingCart')
    && loader.includes('findEmptyCartControl')
    && stores.every(store => Array.isArray(configs[store].emptyCartLabels) && configs[store].emptyCartLabels.length > 0),
  'La lista nueva no reemplaza y verifica el carro anterior antes de cargar.',
);

// cart-stale-job-recovery-v1: una pestana cerrada no bloquea la proxima carga.
check(
  background.includes('liveRetailerTab')
    && background.includes('chrome.tabs.get')
    && background.includes('chrome.tabs.onRemoved.addListener')
    && background.includes("job.status = 'abandoned'"),
  'Una carga huerfana puede seguir bloqueando el cargador.',
);

// cart-zero-proof-v1: se informa el contador real antes y despues.
check(
  background.includes('cartStayedEmpty')
    && background.includes('initialCartCount')
    && background.includes('latestCartCount')
    && background.includes('COMPLETE_CART_RESET'),
  'El resultado no informa el contador real antes y despues de preparar el carro.',
);

// La UI debe PEDIR el reemplazo: sin esto el vaciado queda como codigo muerto,
// que es como se perdio la primera vez.
check(
  button.includes('assistant.start({ replaceCart: true })') && button.includes('window.confirm'),
  'La UI nunca solicita reemplazar el carro anterior.',
);
// Y debe pasar por el hook, no por su propio postMessage: saltarselo desactiva
// el gate de capacidades sin que nadie lo note.
check(
  button.includes('useSupermarketShoppingAssistant')
    && !button.includes("type: 'CONVIVE_CART_LOADER_START'"),
  'La UI se salta el hook y con el, el gate de capacidades.',
);

console.log('Multistore cart loader integrity QA passed.');
