const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const { loadEnvFile } = require('./load-env');

loadEnvFile();

const root = path.resolve(__dirname, '..');
const stores = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus', 'aCuenta', 'Irurzun'];
const sampleTerms = ['arroz', 'leche', 'aceite', 'huevos', 'papel', 'fideos'];
const report = {
  generatedAt: new Date().toISOString(),
  passed: false,
  live: process.env.LIVE_SUPERMARKET_COMPARISON === '1',
  checks: [],
  stores: [],
};

function assert(condition, message, details = {}) {
  if (!condition) throw Object.assign(new Error(message), { details });
  report.checks.push({ message, details });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function pathContainsFiles(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return false;
  if (!fs.statSync(absolutePath).isDirectory()) return true;
  return fs.readdirSync(absolutePath).length > 0;
}

function assertReplacementIntegrity() {
  const page = read('src/app/(dashboard)/resident/supermercado/page.tsx');
  const basket = read('src/lib/supermarketBasket.ts');
  const cartButton = read('src/components/resident/supermarket/ManagedCartButton.tsx');
  const directHandoff = read('src/lib/supermarketDirectHandoff.ts');
  const managedCart = read('src/lib/supermarketManagedCart.ts');
  const packageJson = read('package.json');

  for (const store of stores) {
    assert(page.includes(store), `La interfaz declara ${store}.`);
  }
  assert(page.includes('data-testid="store-comparison-row"'), 'La comparación usa una hilera única de supermercados.');
  assert(page.includes('<Drone'), 'La interfaz distingue despacho con iconografía vectorial.');
  assert(page.includes('Una canasta incompleta nunca gana'), 'La interfaz explica el criterio de recomendación.');
  assert(basket.includes('const availableComparisons = comparisons.filter'), 'Solo canastas con productos participan de la recomendación.');
  assert(basket.includes('bestAvailable: availableComparisons[0] ?? null'), 'Una tienda vacía no puede ser la mejor disponible.');
  assert(page.includes('<ManagedCartButton'), 'La canasta elegida ofrece traspaso al carro.');
  assert(cartButton.includes('prepareHandoff'), 'El control prepara el carro antes de abrir la tienda.');
  assert(directHandoff.includes('/checkout/cart/add?'), 'Las cadenas compatibles usan su checkout oficial.');
  assert(directHandoff.includes("store === 'Irurzun'"), 'Irurzun usa un enlace oficial de carro.');
  assert(managedCart.includes('openManagedRetailerCart'), 'Las cadenas restantes tienen carga en sesión móvil administrada.');
  assert(managedCart.includes('persistWebViewData: true'), 'La sesión del supermercado permanece local en el teléfono.');
  assert(packageJson.includes('@capgo/capacitor-inappbrowser'), 'La app incluye la ventana móvil administrada.');

  const removedPaths = [
    'extensions/convive-cart-loader',
    'public/convive-cart-loader.zip',
    'public/downloads/convive-cart-loader.zip',
    'src/app/(dashboard)/resident/supermercado/cargador',
    'src/app/api/supermarket/cart-url',
    'src/components/resident/supermarket/CartLoaderButton.tsx',
    'src/hooks/useSupermarketCartLoader.ts',
  ];
  for (const relativePath of removedPaths) {
    assert(!pathContainsFiles(relativePath), `Se eliminó ${relativePath}.`);
  }
  assert(!packageJson.includes('qa:supermarket-cart-loader'), 'Los comandos del cargador salieron del proyecto.');
  assert(!page.includes('convive-cart-loader'), 'La interfaz ya no detecta la extensión antigua.');
  assert(!cartButton.includes('chrome.runtime'), 'El traspaso no depende de una extensión Chrome.');
}

async function countRows(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function verifyLiveCatalogs() {
  if (!report.live) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan credenciales Supabase para la prueba real.');

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const cutoff = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();

  for (const store of stores) {
    const usable = await countRows(admin
      .from('supermarket_products')
      .select('id', { count: 'exact', head: true })
      .eq('store', store)
      .eq('in_stock', true)
      .gt('price', 0)
      .gte('last_seen_at', cutoff));

    const sampleHits = [];
    for (const term of sampleTerms) {
      const { data, error } = await admin
        .from('supermarket_products')
        .select('name,price,last_seen_at')
        .eq('store', store)
        .eq('in_stock', true)
        .gt('price', 0)
        .gte('last_seen_at', cutoff)
        .ilike('name', `%${term}%`)
        .order('price', { ascending: true })
        .limit(1);
      if (error) throw error;
      if (data?.[0]) sampleHits.push({ term, name: data[0].name, price: data[0].price });
    }

    let fallbackProducts = [];
    if (sampleHits.length === 0) {
      const { data, error } = await admin
        .from('supermarket_products')
        .select('name,price,last_seen_at')
        .eq('store', store)
        .eq('in_stock', true)
        .gt('price', 0)
        .gte('last_seen_at', cutoff)
        .order('last_seen_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      fallbackProducts = data ?? [];
    }

    report.stores.push({ store, usable, sampleHits, fallbackProducts });
    assert(usable > 0, `${store} tiene productos vigentes utilizables.`, { usable });
    assert(sampleHits.length > 0, `${store} respondió al menos un producto de la lista de control.`, {
      sampleHits,
      fallbackProducts,
    });
  }
}

async function main() {
  assertReplacementIntegrity();
  await verifyLiveCatalogs();
  report.passed = true;
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({
    ...report,
    passed: false,
    error: error.message,
    details: error.details ?? {},
  }, null, 2));
  process.exit(1);
});
