/**
 * Cobertura utilizable del catalogo, por tienda.
 *
 * Es LA metrica detras de "a esta tienda le falta un producto": un plan solo
 * puede usar filas frescas (dentro del TTL de 96h) y en stock. Una tienda con
 * muchas filas pero pocas utilizables aparece siempre con faltantes, aunque el
 * catalogo se vea enorme.
 *
 * Medido el 2026-08-24, antes de paginar Jumbo y de dirigir el refresco:
 *   Unimarc 97% · aCuenta 90% · Lider 88% · Santa Isabel 81% · Tottus 80%
 *   Jumbo 8%  <- 31.076 filas y solo 2.570 utilizables
 *
 * Uso:
 *   npm run supermarket:catalog-status
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

/** Igual que el TTL de lectura del catalogo. */
const TTL_HOURS = 96;
const STORES = ['Lider', 'Jumbo', 'Santa Isabel', 'Unimarc', 'Tottus', 'aCuenta', 'Irurzun'];

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .reduce((acc, line) => {
      const index = line.indexOf('=');
      acc[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
      return acc;
    }, {});
}

const localEnv = readEnvFile(path.join(process.cwd(), '.env.local'));
const env = key => process.env[key] || localEnv[key];

async function main() {
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const cutoff = new Date(Date.now() - TTL_HOURS * 3600 * 1000).toISOString();

  const count = async build => {
    const { count: total, error } = await build();
    if (error) throw new Error(error.message);
    return total ?? 0;
  };

  console.log(`Cobertura utilizable (fresco < ${TTL_HOURS}h y en stock)\n`);
  console.log('tienda           total   utilizable      %   ultimo refresco');
  let totalAll = 0;
  let usableAll = 0;

  for (const store of STORES) {
    const base = () => admin.from('supermarket_products').select('*', { count: 'exact', head: true }).eq('store', store);
    const total = await count(base);
    if (total === 0) continue;
    const usable = await count(() => base().eq('in_stock', true).gte('last_seen_at', cutoff));
    const { data } = await admin.from('supermarket_products')
      .select('last_seen_at').eq('store', store)
      .order('last_seen_at', { ascending: false }).limit(1);
    const last = data?.[0]?.last_seen_at?.slice(0, 16).replace('T', ' ') ?? '—';
    const percent = Math.round((usable / total) * 100);
    const flag = percent < 50 ? '  <-- revisar' : '';
    console.log(
      `${store.padEnd(15)} ${String(total).padStart(6)} ${String(usable).padStart(11)}  ${String(percent).padStart(5)}%   ${last}${flag}`,
    );
    totalAll += total;
    usableAll += usable;
  }

  console.log(`\nTOTAL           ${String(totalAll).padStart(6)} ${String(usableAll).padStart(11)}  ${String(Math.round(usableAll / Math.max(1, totalAll) * 100)).padStart(5)}%`);
  console.log('\nUna tienda muy por debajo del resto es la que aparecera con faltantes.');
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
