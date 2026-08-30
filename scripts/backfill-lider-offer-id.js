/**
 * Completa `offer_id` y `sales_unit` de los productos de Lider.
 *
 * Por que existe: la mutacion `updateItems` del BFF Orchestra de Walmart exige
 * `offerId` ademas del `usItemId` (que ya guardamos como `sku`). Son codigos
 * distintos -para el SKU 00780433000693 el offerId es 821920- y el offerId no
 * viene en el ld+json del que sale el resto del catalogo. Si viene en el
 * `__NEXT_DATA__` de cada ficha, según el contrato observado del retailer.
 *
 * Lo que lo hace eficiente: cada ficha trae los pares de su carrusel de
 * relacionados, no solo el suyo. Medido el 2026-08-17: una corrida de 500
 * productos visito 196 fichas y completo 1.700 filas del catalogo. Por eso se
 * guardan TODOS los pares de cada respuesta y se cruzan contra el catalogo
 * completo, no solo contra el lote.
 *
 * Es incremental e idempotente: cada corrida consulta los que siguen sin
 * offer_id, asi que se repite hasta que la cobertura deje de subir, y cortarlo
 * a media corrida no deja estado inconsistente.
 *
 * Uso:
 *   node scripts/backfill-lider-offer-id.js --status        # solo cobertura
 *   node scripts/backfill-lider-offer-id.js                 # simulacion
 *   node scripts/backfill-lider-offer-id.js --apply --limit 3000
 *
 * Requiere la migracion 20260816230000_supermarket_lider_offer_id.sql aplicada.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const root = process.cwd();

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

const localEnv = readEnvFile(path.join(root, '.env.local'));
function env(key) {
  return process.env[key] || localEnv[key];
}

const APPLY = process.argv.includes('--apply');
/** Solo informa la cobertura actual y sale, sin pedir ninguna ficha. */
const STATUS = process.argv.includes('--status');
const limitFlag = process.argv.indexOf('--limit');
const LIMIT = limitFlag > -1 ? Number(process.argv[limitFlag + 1]) || 500 : 500;

/** Pausa entre fichas: el objetivo es completar el catalogo, no saturar a Lider. */
const DELAY_MS = 900;
/** PostgREST corta cualquier select en 1000 filas: un --limit mayor exige paginar. */
const PAGE_SIZE = 1000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Espejo de `parseLiderOfferRefs` de src/lib/supermarketLive.ts, que es donde
 * esta la version con tests (tests/unit/cart-loader-contract.test.ts).
 * Se duplica porque los scripts del repo son CommonJS y no compilan TS.
 */
function parseOfferRefs(html) {
  const match = html.match(/<script[^>]*id=["']?__NEXT_DATA__["']?[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return [];

  let root;
  try {
    root = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const refs = new Map();
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    const usItemId = typeof node.usItemId === 'string' ? node.usItemId : '';
    const offerId = typeof node.offerId === 'string' ? node.offerId : '';
    if (usItemId && offerId && !refs.has(usItemId)) {
      refs.set(usItemId, {
        usItemId,
        offerId,
        salesUnit: typeof node.salesUnit === 'string' && node.salesUnit ? node.salesUnit : 'EACH',
      });
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(root);
  return [...refs.values()];
}

async function main() {
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');

  const admin = createClient(url, key, { auth: { persistSession: false } });

  // Falla temprano y con un mensaje claro si la migracion no se aplico todavia.
  const probe = await admin.from('supermarket_products').select('offer_id').limit(1);
  if (probe.error) {
    throw new Error(
      `No se puede leer offer_id (${probe.error.message}). `
      + 'Aplica supabase/migrations/20260816230000_supermarket_lider_offer_id.sql antes de correr esto.',
    );
  }

  const { count: totalPending } = await admin
    .from('supermarket_products')
    .select('*', { count: 'exact', head: true })
    .eq('store', 'Lider')
    .is('offer_id', null)
    .not('product_url', 'is', null);

  if (STATUS) {
    const { count: total } = await admin
      .from('supermarket_products')
      .select('*', { count: 'exact', head: true })
      .eq('store', 'Lider');
    const { count: withOffer } = await admin
      .from('supermarket_products')
      .select('*', { count: 'exact', head: true })
      .eq('store', 'Lider')
      .not('offer_id', 'is', null);
    const percent = total ? Math.round((withOffer / total) * 100) : 0;
    console.log(`Lider: ${withOffer} de ${total} productos con offer_id (${percent}%).`);
    console.log(`Pendientes con ficha para visitar: ${totalPending ?? '?'}.`);
    return;
  }

  const pending = [];
  while (pending.length < LIMIT) {
    const from = pending.length;
    const to = Math.min(from + PAGE_SIZE, LIMIT) - 1;
    const { data, error } = await admin
      .from('supermarket_products')
      .select('id, sku, product_url')
      .eq('store', 'Lider')
      .is('offer_id', null)
      .not('product_url', 'is', null)
      .order('id')
      .range(from, to);
    if (error) throw new Error(`No se pudo leer el catalogo: ${error.message}`);
    if (!data || data.length === 0) break;
    pending.push(...data);
    if (data.length < to - from + 1) break;
  }

  console.log(`Productos de Lider sin offer_id: ${totalPending ?? '?'} en total, ${pending.length} en este lote (tope ${LIMIT}).`);
  console.log(APPLY ? 'Modo: ESCRITURA' : 'Modo: simulacion (usa --apply para escribir)');

  const resolved = new Map();
  let visited = 0;
  let failed = 0;

  for (const product of pending) {
    // Otra ficha ya pudo aportar este par desde su carrusel.
    if (resolved.has(product.sku)) continue;

    try {
      const response = await fetch(product.product_url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es-CL,es;q=0.9' },
        signal: AbortSignal.timeout(20000),
      });
      visited += 1;
      if (!response.ok) {
        failed += 1;
        continue;
      }
      for (const ref of parseOfferRefs(await response.text())) {
        if (!resolved.has(ref.usItemId)) resolved.set(ref.usItemId, ref);
      }
    } catch {
      failed += 1;
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nFichas visitadas: ${visited} (fallidas: ${failed})`);
  console.log(`Pares usItemId<->offerId obtenidos: ${resolved.size}`);

  // La mayoria de los pares que devuelve una ficha son de OTROS productos: en la
  // primera corrida, 13 fichas dieron 206 pares para un lote de 20.
  const skus = [...resolved.keys()];
  const targets = [];
  for (let index = 0; index < skus.length; index += 200) {
    const { data, error } = await admin
      .from('supermarket_products')
      .select('id, sku')
      .eq('store', 'Lider')
      .is('offer_id', null)
      .in('sku', skus.slice(index, index + 200));
    if (error) throw new Error(`No se pudo cruzar contra el catalogo: ${error.message}`);
    targets.push(...(data ?? []));
  }
  console.log(`Filas del catalogo que estos pares completan: ${targets.length}`);

  if (!APPLY) {
    for (const target of targets.slice(0, 5)) {
      const ref = resolved.get(target.sku);
      console.log(`  ${target.sku} -> offerId=${ref.offerId} ${ref.salesUnit}`);
    }
    console.log('\nSimulacion: no se escribio nada. Repite con --apply.');
    return;
  }

  let written = 0;
  for (const target of targets) {
    const ref = resolved.get(target.sku);
    const { error } = await admin
      .from('supermarket_products')
      .update({ offer_id: ref.offerId, sales_unit: ref.salesUnit })
      .eq('id', target.id);
    if (error) {
      console.warn(`  fallo al escribir ${target.sku}: ${error.message}`);
      continue;
    }
    written += 1;
  }
  console.log(`\nProductos actualizados: ${written}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
