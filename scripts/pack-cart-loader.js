/**
 * Empaqueta `extensions/convive-cart-loader` en el ZIP que la web ofrece en
 * descarga.
 *
 * Existe porque el paquete publicado llegó a estar seis archivos por detrás del
 * código con el mismo número de versión, así que nadie podía notar la
 * diferencia. `qa:supermarket-cart-loader` falla si vuelven a separarse.
 *
 *   node scripts/pack-cart-loader.js
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const extensionRoot = path.join(root, 'extensions', 'convive-cart-loader');
const output = path.join(root, 'public', 'downloads', 'convive-cart-loader.zip');
const files = [
  'background.js',
  'convive-bridge.js',
  'loader.css',
  'manifest.json',
  'README.md',
  'retailer-loader.js',
  'store-config.js',
];

for (const file of files) {
  if (!fs.existsSync(path.join(extensionRoot, file))) {
    throw new Error(`Falta ${file} en extensions/convive-cart-loader.`);
  }
}

fs.rmSync(output, { force: true });
// -X evita metadatos de plataforma para que el ZIP sea comparable entre equipos.
execFileSync('zip', ['-q', '-X', output, ...files], { cwd: extensionRoot });

const version = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8')).version;
console.log(`convive-cart-loader.zip regenerado con la versión ${version}.`);
