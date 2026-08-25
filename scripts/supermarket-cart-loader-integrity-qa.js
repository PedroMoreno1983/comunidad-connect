/**
 * QA de integridad del cargador de carro.
 *
 * Vigila el contrato entre tres piezas que viven en repositorios lógicos
 * distintos y que ya se han desincronizado antes: la extensión de Chrome
 * (`extensions/convive-cart-loader`), la web que la usa (`src/`) y el ZIP que
 * se ofrece en descarga (`public/downloads`).
 *
 * La regla de fondo es la honestidad: la extensión no puede anunciar
 * capacidades que no implementa, y la web no puede prometerle al comprador algo
 * que el cargador no hace.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

/**
 * Lee un ZIP recorriendo su directorio central. Se hace a mano para no añadir
 * una dependencia sólo por esta comprobación.
 */
function readZipEntries(buffer) {
  const endSignature = 0x06054b50;
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== endSignature) end -= 1;
  if (end < 0) throw new Error('El ZIP no tiene un directorio central legible.');

  const total = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = new Map();

  for (let i = 0; i < total; i += 1) {
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, method === 0 ? data : zlib.inflateRawSync(data));

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

const root = path.resolve(__dirname, '..');
const extensionRoot = path.join(root, 'extensions', 'convive-cart-loader');
const requiredFiles = [
  'manifest.json',
  'store-config.js',
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

// --- Versión: una sola fuente de verdad -------------------------------------
// El número vive en src/lib/supermarket/cartLoader.ts. Aquí solo se comprueba
// que el manifiesto y la web no se separen de él: la extensión llegó a estar en
// 1.0.0 mientras la página seguía ofreciendo "0.3.11".
const declaredVersion = /CART_LOADER_VERSION = '([^']+)'/.exec(
  fs.readFileSync(path.join(root, 'src', 'lib', 'supermarket', 'cartLoader.ts'), 'utf8'),
)?.[1];
check(Boolean(declaredVersion), 'No se pudo leer CART_LOADER_VERSION.');

const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
check(manifest.manifest_version === 3, 'La extensión debe usar Manifest V3.');
check(
  manifest.version === declaredVersion,
  `El manifiesto (${manifest.version}) no coincide con CART_LOADER_VERSION (${declaredVersion}).`,
);

// --- Permisos ----------------------------------------------------------------
check(manifest.permissions.includes('storage'), 'Falta permiso storage para reanudar.');
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
]);
check(
  manifest.host_permissions.length === expectedHosts.size
    && manifest.host_permissions.every(permission => expectedHosts.has(permission)),
  'Los permisos de host no coinciden con los supermercados autorizados.',
);

// --- Puente: aislamiento y honestidad de capacidades -------------------------
const bridge = fs.readFileSync(path.join(extensionRoot, 'convive-bridge.js'), 'utf8');
check(bridge.includes('https://conviveconnect.com'), 'El puente no valida el origen de producción.');
check(bridge.includes('event.source !== window'), 'El puente no valida la ventana emisora.');
check(bridge.includes('event.origin !== window.location.origin'), 'El puente no valida el origen del mensaje.');
check(
  bridge.includes('chrome.runtime.getManifest().version'),
  'El puente no informa la versión instalada.',
);

const declaredCapabilities = (() => {
  const block = /const LOADER_CAPABILITIES = \[([\s\S]*?)\];/.exec(bridge)?.[1] || '';
  return [...block.matchAll(/'([^']+)'/g)].map(match => match[1]);
})();
check(declaredCapabilities.length > 0, 'El puente no declara capacidades.');

const loaderHook = fs.readFileSync(path.join(root, 'src', 'hooks', 'useSupermarketCartLoader.ts'), 'utf8');
const requiredCapabilities = (() => {
  const block = /const REQUIRED_LOADER_CAPABILITIES = \[([\s\S]*?)\] as const;/.exec(loaderHook)?.[1] || '';
  return [...block.matchAll(/'([^']+)'/g)].map(match => match[1]);
})();
check(requiredCapabilities.length > 0, 'La web no exige ninguna capacidad al cargador.');
check(
  requiredCapabilities.every(capability => declaredCapabilities.includes(capability)),
  `La web exige capacidades que el cargador publicado no declara: ${
    requiredCapabilities.filter(capability => !declaredCapabilities.includes(capability)).join(', ')
  }.`,
);

// Cada capacidad anunciada tiene que estar respaldada por código. Se anunciaron
// durante días 'cart-replace-v1' y 'cart-zero-proof-v1' después de que su
// implementación se eliminara, y la web las dio por buenas.
const background = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
const retailerLoader = fs.readFileSync(path.join(extensionRoot, 'retailer-loader.js'), 'utf8');
const capabilityEvidence = {
  'cart-baseline-v1': () => background.includes('CLAIM_CART_ITEM') && background.includes('COMPLETE_CART_ITEM'),
  'cart-auto-open-v2': () => background.includes('chrome.tabs.create'),
  'loader-version-handshake-v1': () => bridge.includes('chrome.runtime.getManifest().version'),
  'cart-ui-complete-v1': () => (
    retailerLoader.includes('items.length !== allItems.length')
    && retailerLoader.includes('No se encontró botón de compra')
    && retailerLoader.includes("window.location.hostname !== 'super.lider.cl'")
  ),
  'cart-batch-inject-v1': () => background.includes('COMPLETE_BATCH_CART') && retailerLoader.includes('COMPLETE_BATCH_CART'),
  'cart-replace-v1': () => retailerLoader.includes('replaceExistingCart') && background.includes('replaceCart'),
  'cart-stale-job-recovery-v1': () => background.includes('chrome.tabs.onRemoved') && background.includes("'abandoned'"),
  'cart-zero-proof-v1': () => background.includes('cartStayedEmpty') && background.includes('initialCartCount'),
};
for (const capability of declaredCapabilities) {
  const evidence = capabilityEvidence[capability];
  check(evidence, `El puente anuncia una capacidad desconocida para el QA: ${capability}.`);
  check(evidence(), `El puente anuncia '${capability}' pero no queda código que lo implemente.`);
}

// --- Adaptadores por tienda --------------------------------------------------
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
  configs.Irurzun.searchUrl('arroz').startsWith('https://irurzun.cl/search?'),
  'Irurzun conserva la ruta /buscar inexistente.',
);
// Cada campo que el código lee tiene que existir en la configuración: el
// fallback de `config.cartUrl`, que nunca se declaró, mandaba al comprador a
// google.com al terminar la carga.
for (const store of stores) {
  const usesCartUrl = configs[store].cartUrl !== undefined;
  check(
    !usesCartUrl || /^https:\/\//.test(configs[store].cartUrl),
    `${store} declara un cartUrl que no es una URL https de la tienda.`,
  );
}
check(
  !/cartUrl \|\| ['"`]https?:\/\//.test(background),
  'El cargador vuelve a tener un destino final inventado cuando la tienda no declara su carro.',
);

// --- Trabajo en segundo plano ------------------------------------------------
check(background.includes('MAX_ITEMS = 200'), 'El cargador no conserva el límite de 200 productos.');
check(background.includes('safeProductUrl(item?.productUrl, config)'), 'Las URLs exactas no se validan por tienda.');
check(background.includes('completed_with_issues'), 'Los faltantes no tienen un cierre explícito.');

// --- Recorrido en la página del comercio -------------------------------------
check(retailerLoader.includes('pageIsBlocked'), 'Falta pausa ante verificación humana.');
check(retailerLoader.includes('interventionPrompt'), 'Falta pausa para seleccionar entrega.');
check(retailerLoader.includes('CLAIM_CART_ITEM'), 'Falta protección contra productos duplicados por recarga.');
check(retailerLoader.includes('COMPLETE_CART_ITEM'), 'Falta avance persistente producto por producto.');
check(
  !/\b(click|submit)\s*\(\s*['"`]?(comprar|pagar|confirmar)/i.test(retailerLoader),
  'El cargador intenta comprar o pagar.',
);

for (const file of ['store-config.js', 'background.js', 'convive-bridge.js', 'retailer-loader.js']) {
  const source = fs.readFileSync(path.join(extensionRoot, file), 'utf8');
  new vm.Script(source, { filename: file });
}

// --- El ZIP publicado es el código de este repositorio -----------------------
// El paquete que ofrece la web llegó a estar seis archivos por detrás del
// código, con el mismo número de versión, así que nadie podía notarlo.
const zipPath = path.join(root, 'public', 'downloads', 'convive-cart-loader.zip');
check(fs.existsSync(zipPath), 'Falta el paquete descargable del cargador.');
const zipEntries = readZipEntries(fs.readFileSync(zipPath));
for (const file of requiredFiles) {
  const packaged = zipEntries.get(file);
  check(packaged, `El ZIP publicado no incluye ${file}.`);
  check(
    packaged.equals(fs.readFileSync(path.join(extensionRoot, file))),
    `El ZIP publicado tiene una versión distinta de ${file}. Regenéralo desde extensions/convive-cart-loader.`,
  );
}

// --- La web no promete lo que el cargador no hace ----------------------------
const page = fs.readFileSync(
  path.join(root, 'src', 'app', '(dashboard)', 'resident', 'supermercado', 'page.tsx'),
  'utf8',
);
const button = fs.readFileSync(
  path.join(root, 'src', 'components', 'resident', 'supermarket', 'CartLoaderButton.tsx'),
  'utf8',
);
const activationPage = fs.readFileSync(
  path.join(root, 'src', 'app', '(dashboard)', 'resident', 'supermercado', 'cargador', 'page.tsx'),
  'utf8',
);
const supermarketRoute = fs.readFileSync(
  path.join(root, 'src', 'app', 'api', 'supermarket', 'route.ts'),
  'utf8',
);

check(
  activationPage.includes('Descargar cargador {CART_LOADER_VERSION}')
    && activationPage.includes("'/downloads/convive-cart-loader.zip'")
    && activationPage.includes('Actualización manual disponible'),
  'La guía del cargador no explica ni enlaza el paquete que se descarga.',
);
check(
  activationPage.includes('NEXT_PUBLIC_CART_LOADER_INSTALL_URL')
    && activationPage.includes('La publicación en Chrome Web Store sigue pendiente'),
  'La actualización manual oculta el estado real de publicación en Chrome Web Store.',
);
check(
  !activationPage.includes('comprueba que el carro quedó en cero')
    && !activationPage.includes('reemplazar el carro anterior'),
  'La guía vuelve a prometer un vaciado del carro que el cargador no hace.',
);
check(
  activationPage.includes('no vacía tu carro anterior'),
  'La guía no advierte que la lista se agrega sobre el carro existente.',
);

check(
  button.includes('useSupermarketCartLoader(basket)')
    && button.includes("cartLoader.availability === 'ready'")
    && button.includes("cartLoader.availability === 'outdated'")
    && button.includes('Actualizar cargador')
    && button.includes('cartLoader.start()'),
  'El botón no negocia versión con la extensión ni ofrece actualizarla cuando está obsoleta.',
);
check(
  !button.includes("window.postMessage(")
    && !button.includes("'*'"),
  'El botón vuelve a hablar con la extensión por su cuenta en vez de usar el hook.',
);
check(
  button.includes('missingCount > 0')
    && button.includes('no entraron al carro'),
  'La UI vuelve a ocultar los productos que no entraron al carro.',
);
check(
  !button.includes('con todos tus productos en el carro'),
  'La UI vuelve a afirmar que el carro quedó completo sin poder comprobarlo.',
);
check(button.includes('Revisa el carro antes de pagar'), 'La UI perdió el límite de pago manual.');

check(
  page.includes('<CartLoaderButton')
    && page.includes('autoLoadKey={autoLoadKey}')
    && page.includes('setAutoLoadKey')
    && page.includes('basket={selectedBasket}'),
  'La UI no reinicia el cargador al cambiar de tienda: arrastra el estado de la anterior.',
);
check(
  page.includes('const selectBasket = (')
    && page.includes('setSelectedStore(basket.store)')
    && page.includes('setList('),
  'La tabla de productos puede quedar mostrando otra tienda distinta a la seleccionada.',
);
check(
  !supermarketRoute.includes('.slice(0, 2)'),
  'La comparación vuelve a recortar los supermercados ofrecidos.',
);
for (const store of stores) {
  const homeKey = store.includes(' ') ? `'${store}'` : `${store}:`;
  check(button.includes(homeKey), `La UI no declara el destino de ${store}.`);
}

// --- Handoff VTEX: el carro se crea en la sesión del navegador ---------------
// Nunca en una sesión server-to-server que el comprador no posee.
const cartUrl = fs.readFileSync(path.join(root, 'src', 'lib', 'supermarket', 'cartUrl.ts'), 'utf8');
const cartRoute = fs.readFileSync(
  path.join(root, 'src', 'app', 'api', 'supermarket', 'cart-url', 'route.ts'),
  'utf8',
);
check(
  cartUrl.includes('Retailer `/checkout/cart/add` URLs are not a stable public API')
    && cartUrl.includes('export function supportedDirectCartStores(): string[]')
    && cartUrl.includes('return [];')
    && cartUrl.includes('export function buildDirectCartUrl')
    && cartUrl.includes('return null;'),
  'Los enlaces de carro no respetan los dominios de sesión verificados.',
);
check(!cartUrl.includes('/checkout/cart/add?'), 'Unimarc debe evitar la redireccion rota a /checkout/#/cart.');
check(!cartUrl.includes('/checkout/?orderFormId='), 'Volvió el handoff de orderForm sin cookie de sesión.');
check(!cartRoute.includes('buildSharedCart'), 'La API volvió a crear un carro ajeno a la sesión del comprador.');
check(cartRoute.includes("mode: 'browser-session-link'"), 'La API no identifica el handoff de sesión.');
check(
  cartRoute.includes('const planned = withSku.slice(0, MAX_ITEMS_PER_URL)'),
  'La API no respeta el tope real del enlace.',
);
check(cartRoute.includes('plannedCount: planned.length'), 'La API vuelve a contar productos que no viajan en el enlace.');
check(
  cartRoute.includes('missingItems: [...missing, ...overflow]'),
  'La API oculta los productos que exceden el tope del enlace.',
);
check(
  !fs.existsSync(path.join(root, 'src', 'lib', 'supermarket', 'vtexSharedCart.ts')),
  'Quedó el adaptador de carro server-to-server.',
);

console.log('Multistore cart loader integrity QA passed.');
