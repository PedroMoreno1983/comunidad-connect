const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const extensionRoot = path.join(root, 'extensions', 'convive-cart-loader');
const requiredFiles = [
  'manifest.json',
  'background.js',
  'convive-bridge.js',
  'lider-loader.js',
  'loader.css',
  'README.md',
];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

for (const file of requiredFiles) {
  check(fs.existsSync(path.join(extensionRoot, file)), `Falta archivo de extensión: ${file}`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
check(manifest.manifest_version === 3, 'La extensión debe usar Manifest V3.');
check(manifest.permissions.includes('storage'), 'Falta permiso storage para reanudar.');
check(manifest.permissions.includes('tabs'), 'Falta permiso tabs para usar una única pestaña.');
check(!manifest.permissions.includes('<all_urls>'), 'No se permite acceso global a sitios.');

const allowedHostPermissions = new Set([
  'https://super.lider.cl/*',
  'https://www.lider.cl/*',
  'https://lider.cl/*',
]);
check(
  manifest.host_permissions.every(permission => allowedHostPermissions.has(permission)),
  'La extensión solicita un dominio no autorizado.',
);

const bridge = fs.readFileSync(path.join(extensionRoot, 'convive-bridge.js'), 'utf8');
check(bridge.includes('https://conviveconnect.com'), 'El puente no valida el origen de producción.');
check(bridge.includes("event.source !== window"), 'El puente no valida la ventana emisora.');
check(bridge.includes("event.origin !== window.location.origin"), 'El puente no valida el origen del mensaje.');

const background = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
check(background.includes('MAX_ITEMS = 200'), 'El cargador no conserva el límite de 200 productos.');
check(background.includes('ALLOWED_LIDER_HOSTS'), 'Las URLs de productos no están acotadas a Lider.');
check(background.includes('completed_with_issues'), 'Los faltantes no tienen un cierre explícito.');

const loader = fs.readFileSync(path.join(extensionRoot, 'lider-loader.js'), 'utf8');
check(loader.includes('pageIsBlocked'), 'Falta pausa ante verificación humana.');
check(loader.includes('CLAIM_CART_ITEM'), 'Falta protección contra productos duplicados por recarga.');
check(loader.includes('COMPLETE_CART_ITEM'), 'Falta avance persistente producto por producto.');
check(!/\b(click|submit)\s*\(\s*['"`]?(comprar|pagar|confirmar)/i.test(loader), 'El cargador intenta comprar o pagar.');

for (const file of ['background.js', 'convive-bridge.js', 'lider-loader.js']) {
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
check(page.includes('<CartLoaderButton basket={basket} />'), 'La UI no usa el cargador por canasta.');
check(button.includes("SUPPORTED_STORES = new Set(['Lider'])"), 'La UI declara tiendas no validadas.');
check(button.includes('Cargar ${basket.items.length} en Lider'), 'Falta acción clara para cargar el carro.');
check(
  button.includes('La carga automática todavía no está validada'),
  'Las tiendas no compatibles no muestran una limitación honesta.',
);

console.log('Cart loader integrity QA passed.');
