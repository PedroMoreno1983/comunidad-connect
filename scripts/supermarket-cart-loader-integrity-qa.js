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
check(manifest.version === '0.2.0', 'La versión multitienda debe ser 0.2.0.');
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
  configs.Lider.searchUrl('leche').startsWith('https://www.lider.cl/'),
  'Lider conserva la ruta 404 de super.lider.cl para búsquedas.',
);
check(
  configs.Irurzun.searchUrl('arroz').startsWith('https://irurzun.cl/search?'),
  'Irurzun conserva la ruta /buscar inexistente.',
);

const background = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
check(background.includes('MAX_ITEMS = 200'), 'El cargador no conserva el límite de 200 productos.');
check(background.includes('safeProductUrl(item?.productUrl, config)'), 'Las URLs exactas no se validan por tienda.');
check(background.includes('completed_with_issues'), 'Los faltantes no tienen un cierre explícito.');
check(background.includes('Ya hay una carga de'), 'No se evita iniciar dos cargas simultáneas.');

const loader = fs.readFileSync(path.join(extensionRoot, 'retailer-loader.js'), 'utf8');
check(loader.includes('pageIsBlocked'), 'Falta pausa ante verificación humana.');
check(loader.includes('interventionPrompt'), 'Falta pausa para seleccionar entrega.');
check(loader.includes('additionWasVerified'), 'Falta verificar que el carro cambió.');
check(loader.includes('CLAIM_CART_ITEM'), 'Falta protección contra productos duplicados por recarga.');
check(loader.includes('COMPLETE_CART_ITEM'), 'Falta avance persistente producto por producto.');
check(
  loader.includes('el carro no cambió') && loader.includes('éxito falso'),
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
check(
  page.includes('<CartLoaderButton basket={selectedBasket} onQuote={applyCheckoutQuote} />'),
  'La UI no usa el cargador de la tienda elegida ni aplica la cotizacion confirmada.',
);
for (const store of stores) {
  check(button.includes(`'${store}'`), `La UI no habilita ${store}.`);
}
check(
  button.includes('Confirmar carro y precio') && button.includes('Abrir checkout y cargar carro'),
  'La UI no separa la confirmacion de productos/precio de la apertura del checkout.',
);
check(
  button.includes("quoteSource === 'retailer_checkout'")
    && button.includes('Preparar carro en ${basket.store}'),
  'La UI confunde la cotizacion VTEX verificada con el intento de carga de Lider.',
);
check(button.includes('confirmas la entrega y pagas'), 'La UI perdió el límite de seguridad.');
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
  cartUrl.includes('https://santaisabel.vtexcommercestable.com.br')
    && cartUrl.includes('https://unimarc.vtexcommercestable.com.br')
    && cartUrl.includes('https://jumbo.vtexcommercestable.com.br'),
  'Los enlaces VTEX no apuntan a los hosts reales de checkout.',
);
check(cartUrl.includes("params.append('redirect', 'true')"), 'El enlace no redirige al checkout visible.');
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
check(button.includes('Usar el cargador asistido'), 'Falta recuperación cuando la carga directa falla.');
check(
  !button.includes("window.open('about:blank', '_blank')")
    && button.includes('href={directResult.cartUrl}'),
  'El checkout no queda asociado a un clic explicito del usuario.',
);
check(button.includes('href={directResult.cartUrl}'), 'Falta enlace manual si el navegador bloquea la pestaña.');

console.log('Multistore cart loader integrity QA passed.');
