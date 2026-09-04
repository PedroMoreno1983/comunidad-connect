const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
check(manifest.manifest_version === 3, 'La extensión debe usar Manifest V3.');
check(/^\d+\.\d+\.\d+$/.test(manifest.version), 'La version del manifest debe ser semver.');
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

const bridge = fs.readFileSync(path.join(extensionRoot, 'convive-bridge.js'), 'utf8');
check(bridge.includes('https://conviveconnect.com'), 'El puente no valida el origen de producción.');
check(bridge.includes('event.source !== window'), 'El puente no valida la ventana emisora.');
check(bridge.includes('event.origin !== window.location.origin'), 'El puente no valida el origen del mensaje.');
check(
  bridge.includes('chrome.runtime.getManifest().version')
    && bridge.includes('cart-baseline-v1')
    && bridge.includes('cart-auto-open-v2')
    && bridge.includes('cart-replace-v1')
    && bridge.includes('cart-stale-job-recovery-v1')
    && bridge.includes('cart-zero-proof-v1'),
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
  check(configs[store].emptyCartLabels.length > 0, `${store} no declara cómo vaciar el carro anterior.`);
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

const background = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
check(background.includes('MAX_ITEMS = 200'), 'El cargador no conserva el límite de 200 productos.');
check(background.includes('safeProductUrl(item?.productUrl, config)'), 'Las URLs exactas no se validan por tienda.');
check(background.includes('completed_with_issues'), 'Los faltantes no tienen un cierre explícito.');
check(
  background.includes('liveRetailerTab')
    && background.includes('chrome.tabs.get')
    && background.includes('chrome.tabs.onRemoved.addListener')
    && background.includes("job.status = 'abandoned'")
    && background.includes('Retomando la carga de'),
  'Una carga huérfana puede seguir bloqueando el cargador o una carga activa no vuelve a enfocar su pestaña.',
);
check(
  background.includes('cartStayedEmpty')
    && background.includes("job.status = cartStayedEmpty")
    && background.includes('El contador sigue en 0')
    && background.includes('initialCartCount')
    && background.includes('latestCartCount')
    && background.includes('previousCartCount')
    && background.includes('currentCartCount')
    && background.includes('cartCountAfter')
    && background.includes('removedCartCount')
    && background.includes('COMPLETE_CART_RESET'),
  'El resultado no informa el contador real antes y después de preparar el carro.',
);

const loader = fs.readFileSync(path.join(extensionRoot, 'retailer-loader.js'), 'utf8');
check(loader.includes('pageIsBlocked'), 'Falta pausa ante verificación humana.');
check(loader.includes('interventionPrompt'), 'Falta pausa para seleccionar entrega.');
check(loader.includes('additionWasVerified'), 'Falta verificar que el carro cambió.');
check(loader.includes('CLAIM_CART_ITEM'), 'Falta protección contra productos duplicados por recarga.');
check(loader.includes('COMPLETE_CART_ITEM'), 'Falta avance persistente producto por producto.');
check(
  loader.includes('replaceExistingCart')
    && loader.includes('findEmptyCartControl')
    && loader.includes('findEmptyCartConfirmation')
    && loader.includes('settledCartCount')
    && loader.includes('visibleCartPanelCount')
    && loader.includes('cartCountWithDrawerProbe')
    && loader.includes('cartControl.click()')
    && loader.includes('closeCartPanel()'),
  'La lista nueva no reemplaza y verifica el carro anterior antes de cargar.',
);
check(
  loader.includes('findCartControl')
    && loader.includes('cartControl.click()')
    && loader.includes('cartCountBefore')
    && loader.includes('cartCountAfter')
    && loader.includes('chrome.runtime.getManifest().version'),
  'Al terminar no se encuentra o abre el carro oficial, o no se registra su conteo previo.',
);
check(
  loader.includes('before.cartCount !== null && afterCount !== null')
    && loader.includes('return afterCount > before.cartCount')
    && loader.includes('el carro no cambió')
    && loader.includes('éxito falso'),
  'Un clic sin efecto puede seguir reportándose como éxito.',
);
check(!/\b(click|submit)\s*\(\s*['"`]?(comprar|pagar|confirmar)/i.test(loader), 'El cargador intenta comprar o pagar.');

for (const file of ['store-config.js', 'background.js', 'convive-bridge.js', 'retailer-loader.js']) {
  const source = fs.readFileSync(path.join(extensionRoot, file), 'utf8');
  new vm.Script(source, { filename: file });
}

const page = fs.readFileSync(
  path.join(root, 'src', 'app', '(dashboard)', 'resident', 'supermercado', 'page.tsx'),
  'utf8',
);
const button = fs.readFileSync(
  path.join(root, 'src', 'components', 'resident', 'supermarket', 'CartLoaderButton.tsx'),
  'utf8',
);
const loaderHook = fs.readFileSync(
  path.join(root, 'src', 'hooks', 'useSupermarketCartLoader.ts'),
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
  activationPage.includes('Descargar cargador 0.3.11')
    && activationPage.includes("'/downloads/convive-cart-loader.zip'")
    && activationPage.includes('Actualización manual disponible')
    && activationPage.includes('Cargar lista nueva')
    && activationPage.includes('Confirma que quieres reemplazar el carro anterior'),
  'La guía del cargador no explica ni enlaza la versión que realmente reemplaza el carro.',
);
check(
  page.includes('<CartLoaderButton')
    && page.includes('function cartLoaderKey')
    && page.includes('key={cartLoaderKey(selectedBasket)}')
    && page.includes('basket={selectedBasket}')
    && page.includes('onQuote={applyCheckoutQuote}'),
  'La UI no reinicia el cargador para una lista nueva o no aplica la cotizacion confirmada.',
);
check(
  page.includes('const initialBasket = nextOptions[0] ?? null')
    && page.includes('selectBasket(initialBasket, nextRequested)')
    && page.includes('setList(shoppingListForBasket(basket, requested))'),
  'La tabla de productos puede quedar mostrando otra tienda distinta a la seleccionada.',
);
check(
  page.includes('additionalBasketOptions')
    && page.includes('Otros supermercados')
    && page.includes('onSelect={() => selectBasket(basket)}')
    && button.includes('onSelect?.()')
    && !supermarketRoute.includes('.slice(0, 2)'),
  'La comparación no ofrece todos los supermercados o la carga no selecciona la tienda en el mismo clic.',
);
check(
  button.includes('return false;') && button.includes('nunca abrimos un enlace antiguo'),
  'La carga directa de respaldo no delega su capacidad a la fuente compartida.',
);
check(
  loaderHook.includes('CONVIVE_CART_LOADER_PING')
    && loaderHook.includes('CONVIVE_CART_LOADER_START')
    && loaderHook.includes('REQUIRED_LOADER_CAPABILITIES')
    && loaderHook.includes("setAvailability(compatible ? 'ready' : 'outdated')")
    && button.includes('useSupermarketCartLoader(basket)')
    && button.includes("cartLoader.availability === 'outdated'")
    && button.includes('Actualizar cargador de Convive')
    && button.includes("cartLoader.availability === 'ready'")
    && button.includes('cartLoader.start({ replaceCart: true })')
    && button.includes('Vaciar carro anterior y cargar')
    && loaderHook.includes("'cart-replace-v1'")
    && loaderHook.includes("'cart-stale-job-recovery-v1'")
    && loaderHook.includes("'cart-zero-proof-v1'"),
  'El botón visible no usa el puente de la extensión como flujo principal.',
);
check(
  button.includes('No se pudo confirmar el carro de')
    && button.includes('Carga incompleta en')
    && button.includes('Carro de ${basket.store} confirmado')
    && !button.includes('Carro de ${basket.store} listo'),
  'La web todavía presenta una carga fallida o incompleta como carro listo.',
);
check(
  !button.includes('/api/supermarket/cart-plan')
    && !button.includes('setCode(')
    && !activationPage.includes('BOOKMARKLET')
    && !activationPage.includes('javascript:(function'),
  'Volvió el flujo de código o marcador que obliga a reconstruir la compra.',
);
check(
  activationPage.includes('NEXT_PUBLIC_CART_LOADER_INSTALL_URL')
    && activationPage.includes('La publicación en Chrome Web Store sigue pendiente'),
  'La actualización manual oculta el estado real de publicación en Chrome Web Store.',
);
for (const store of stores) {
  const homeKey = store.includes(' ') ? `'${store}'` : `${store}:`;
  check(button.includes(homeKey), `La UI no declara el destino de ${store}.`);
}
check(
  button.includes('Cargar lista nueva en ${basket.store}') && button.includes('Volver a abrir el carro'),
  'La UI no ofrece la carga directa en un clic y su recuperacion manual.',
);
check(
  button.includes("basket.store === 'Unimarc'")
    && button.includes('pulsa el carro de la esquina')
    && button.includes('El acceso con Google no está configurado por Unimarc')
    && button.includes('Recibir la clave de acceso rápido'),
  'Unimarc no explica su handoff especial o la alternativa al acceso roto con Google.',
);
check(
  button.includes("quoteSource === 'retailer_checkout'")
    && button.includes('Preparar carro en ${basket.store}'),
  'La UI confunde la cotizacion VTEX verificada con el intento de carga de Lider.',
);
check(button.includes('tú revisas y pagas'), 'La UI perdió el límite de seguridad y pago manual.');
check(
  button.includes("basket.store === 'Irurzun'") && button.includes('Preparar cotización en'),
  'Irurzun no se presenta honestamente como cotización.',
);

// Regresión del handoff VTEX: el carro se crea en la sesión del navegador,
// nunca en una sesión server-to-server que el comprador no posee.
const cartUrl = fs.readFileSync(
  path.join(root, 'src', 'lib', 'supermarket', 'cartUrl.ts'),
  'utf8',
);
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
check(
  !cartUrl.includes('/checkout/cart/add?'),
  'Unimarc debe evitar la redireccion rota a /checkout/#/cart.',
);
check(!cartUrl.includes('/checkout/?orderFormId='), 'Volvió el handoff de orderForm sin cookie de sesión.');
check(!cartRoute.includes('buildSharedCart'), 'La API volvió a crear un carro ajeno a la sesión del comprador.');
check(cartRoute.includes("mode: 'browser-session-link'"), 'La API no identifica el handoff de sesión.');
check(cartRoute.includes('const planned = withSku.slice(0, MAX_ITEMS_PER_URL)'), 'La API no respeta el tope real del enlace.');
check(cartRoute.includes('plannedCount: planned.length'), 'La API vuelve a contar productos que no viajan en el enlace.');
check(
  cartRoute.includes('missingItems: [...missing, ...overflow]'),
  'La API oculta los productos que exceden el tope del enlace.',
);
check(!fs.existsSync(path.join(root, 'src', 'lib', 'supermarket', 'vtexSharedCart.ts')), 'Quedó el adaptador de carro server-to-server.');
check(!button.includes('se abrió con tu carro cargado'), 'La UI todavía afirma un carro cargado sin leer la sesión.');
check(!button.includes('confirmó') || !button.includes('producto(s) en el carro'), 'La UI todavía presenta la API remota como confirmación del carro.');
check(
  button.includes('La tienda conserva productos de carros anteriores')
    && button.includes('Revisar o vaciar mi carro anterior'),
  'La UI no pide revisar el carro real ni advierte sobre productos anteriores.',
);
check(button.includes('Activar el cargador automático'), 'Falta recuperación cuando la carga directa falla.');
check(
  button.includes("window.open('about:blank', '_blank')")
    && button.includes('void loadDirectly(checkoutTab)')
    && button.includes('navigatePreparedCart(checkoutTab, cartUrl)')
    && button.includes('UNIMARC_LANDING_DELAY_MS')
    && button.includes("currentRetailerCartUrl(cartUrl, 'Unimarc')"),
  'La carga directa no reserva la pestana en el clic o Unimarc no completa su handoff.',
);
check(button.includes('reopenPreparedCart(directResult.cartUrl)'), 'Falta reabrir el carro si la pestaña se cierra.');
check(
  page.includes('Carga automática')
    && page.includes('Lista lista para cargar')
    && !page.includes('No carga automática')
    && !page.includes('carga manual'),
  'La comparación todavía obliga a rehacer el carro en alguna de las siete tiendas.',
);

// --- Invariantes de la carga por API (2026-08-17) ---
// Regresion concreta: el cargador llamaba a `/api/cart/items` y a una mutacion
// GraphQL inventadas, daba por buena la respuesta con `res.ok` y, si "acertaba"
// en la mitad, marcaba TODOS los productos como agregados. Estas tiendas son
// apps Next.js que responden 200 con HTML en rutas inexistentes, asi que el
// carro se informaba lleno y llegaba vacio. Contrato real en
// extensions/convive-cart-loader/ADAPTADORES.md
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

// Un adaptador de API solo puede existir si devuelve el carro leido: sin esa
// lectura no hay forma de saber que entro.
for (const [storeName, storeConfig] of Object.entries(configs)) {
  if (!storeConfig.cartApi) continue;
  check(typeof storeConfig.cartApi.load === 'function', `${storeName}.cartApi.load debe ser funcion.`);
  check(Boolean(storeConfig.cartUrl), `${storeName} con cartApi debe declarar cartUrl.`);
}
// Sin captura propia, declarar adaptador por parecido de plataforma seria una
// suposicion: solo Lider esta verificado.
check(
  Object.entries(configs).filter(([, storeConfig]) => storeConfig.cartApi).map(([name]) => name).join(',') === 'Lider',
  'Solo Lider debe declarar adaptador de API.',
);
// Al terminar, la pestana debe quedar en el carro de la tienda, no en Google.
for (const storeName of stores) {
  if (storeName === 'Irurzun') continue;
  check(Boolean(configs[storeName].cartUrl), `${storeName} no declara cartUrl y la carga terminaria fuera de la tienda.`);
}

console.log('Multistore cart loader integrity QA passed.');
