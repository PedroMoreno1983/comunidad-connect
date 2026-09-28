import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { canonicalCatalogTerm, matchAnchor, productMatchScore } from '@/lib/supermarketText';
import { SUPERMARKET_STORES } from '@/lib/supermarketBasket';
import { FRESH_PRICE_AGE_MS, STALE_PRICE_AGE_MS } from '@/lib/supermarketCatalogGaps';
import type { SupermarketCatalogProduct, SupermarketCatalogResponse } from '@/lib/types';

export const runtime = 'nodejs';

const PAGE_SIZE = 24;
const SEARCH_BATCH_SIZE = 1000;
const MAX_SEARCH_MATCHES = 5000;
const COLUMNS = 'id,store,name,brand,sku,offer_id,sales_unit,price,image_url,product_url,last_seen_at';

function productFromRow(row: Record<string, unknown>): SupermarketCatalogProduct {
  return {
    id: String(row.id),
    store: String(row.store),
    name: String(row.name),
    brand: typeof row.brand === 'string' ? row.brand : '',
    sku: typeof row.sku === 'string' ? row.sku : undefined,
    offerId: typeof row.offer_id === 'string' ? row.offer_id : undefined,
    salesUnit: typeof row.sales_unit === 'string' ? row.sales_unit : undefined,
    price: Number(row.price),
    imageUrl: typeof row.image_url === 'string' ? row.image_url : undefined,
    productUrl: typeof row.product_url === 'string' ? row.product_url : undefined,
    fetchedAt: typeof row.last_seen_at === 'string' ? row.last_seen_at : undefined,
  };
}

function catalogMatchScore(query: string, name: string): number {
  const score = productMatchScore(query, name);
  if (score < 0) return score;
  // A generic milk search should surface everyday cartons before flavoured
  // drinks. The comparison matcher deliberately treats these as equal matches.
  if (canonicalCatalogTerm(query) === 'leche'
    && /\b(?:natural|blanca|entera|semidescremada|descremada)\b/i.test(name)
    && /\b1\s*l\b/i.test(name)
    && !/\b(?:chocolate|frutilla|vainilla|pl[aá]tano)\b/i.test(name)) {
    return score + 20;
  }
  return score;
}

export async function GET(req: NextRequest) {
  const limited = await enforceDistributedRateLimit(req, 'supermarket.catalog', {
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const store = req.nextUrl.searchParams.get('store') || '';
  if (!SUPERMARKET_STORES.includes(store as typeof SUPERMARKET_STORES[number])) {
    return NextResponse.json({ error: 'Supermercado no disponible.' }, { status: 400 });
  }
  const query = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 80);
  const page = Math.min(20, Math.max(0, Number.parseInt(req.nextUrl.searchParams.get('page') || '0', 10) || 0));
  if (query.length === 1) return NextResponse.json({ products: [], hasMore: false } satisfies SupermarketCatalogResponse);

  try {
    const client = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const admin = getSupabaseAdmin();
    const canonical = canonicalCatalogTerm(query);
    const anchor = query ? matchAnchor(canonical).replace(/[%_]/g, '') : '';
    const search = async (maxAge: number, from: number, to: number) => {
      let request = admin.from('supermarket_products').select(COLUMNS)
        .eq('store', store)
        .eq('in_stock', true)
        .gt('price', 0)
        .gte('last_seen_at', new Date(Date.now() - maxAge).toISOString());
      // Líder exige ambos identificadores para transferir el producto al carro.
      // La búsqueda histórica dejó duplicados sin ellos que no se pueden comprar.
      if (store === 'Lider') request = request.not('sku', 'is', null).not('offer_id', 'is', null);
      if (anchor) request = request.ilike('name', `%${anchor}%`);
      return request.order('last_seen_at', { ascending: false }).range(from, to);
    };

    // Rank the complete matching set before paging. Ranking only the newest 25
    // rows hid ordinary milk behind newer chocolates and milk flavourings.
    const fetchMatches = async (maxAge: number) => {
      if (!query) {
        const from = page * PAGE_SIZE;
        const result = await search(maxAge, from, from + PAGE_SIZE);
        if (result.error) throw result.error;
        return result.data ?? [];
      }
      const rows: Record<string, unknown>[] = [];
      while (rows.length < MAX_SEARCH_MATCHES) {
        const from = rows.length;
        const result = await search(maxAge, from, from + SEARCH_BATCH_SIZE - 1);
        if (result.error) throw result.error;
        const batch = result.data ?? [];
        rows.push(...batch);
        if (batch.length < SEARCH_BATCH_SIZE) break;
      }
      if (rows.length === MAX_SEARCH_MATCHES) {
        throw new Error('Demasiados resultados; escribe un término más específico.');
      }
      return rows;
    };

    let data = await fetchMatches(FRESH_PRICE_AGE_MS);
    if (!data.length) data = await fetchMatches(STALE_PRICE_AGE_MS);

    const scored = (data ?? []).map(row => ({
      product: productFromRow(row),
      score: query ? catalogMatchScore(query, String(row.name)) : 0,
    })).filter(entry => !query || entry.score >= 0)
      .sort((left, right) => right.score - left.score
        || left.product.name.length - right.product.name.length
        || left.product.price - right.product.price);
    const from = query ? page * PAGE_SIZE : 0;
    const products = scored.slice(from, from + PAGE_SIZE).map(entry => entry.product);
    const payload: SupermarketCatalogResponse = {
      products,
      hasMore: query ? scored.length > from + PAGE_SIZE : data.length > PAGE_SIZE,
    };
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'Demasiados resultados; escribe un término más específico.') {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error('[supermarket catalog] query failed', error);
    return NextResponse.json({ error: 'No se pudo cargar el catálogo.' }, { status: 502 });
  }
}
