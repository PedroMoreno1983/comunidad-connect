import { after, NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { canonicalCatalogTerm, catalogNameOrFilter, catalogSearchScore, foldAccents, matchAnchors } from '@/lib/supermarketText';
import { SUPERMARKET_STORES } from '@/lib/supermarketBasket';
import { FRESH_PRICE_AGE_MS, STALE_PRICE_AGE_MS } from '@/lib/supermarketCatalogGaps';
import { rememberLiveProducts } from '@/lib/supermarketCatalogLiveFill';
import { searchAllRetailerProducts, type ScrapedItem } from '@/lib/supermarketLive';
import type { SupermarketCatalogProduct, SupermarketCatalogResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

const PAGE_SIZE = 24;
const SEARCH_BATCH_SIZE = 1000;
const MAX_SEARCH_MATCHES = 5000;
const COLUMNS = 'id,store,name,brand,sku,offer_id,sales_unit,price,image_url,product_url,last_seen_at,last_query';
const LIVE_FILL_BELOW = 8;
const LIVE_QUERY_REFRESH_MS = 12 * 60 * 60 * 1000;
const LIVE_STORES = new Set<ScrapedItem['store']>(['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus']);

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
  const score = catalogSearchScore(query, name);
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

function isLiveStore(store: string): store is ScrapedItem['store'] {
  return LIVE_STORES.has(store as ScrapedItem['store']);
}

function queryFilledRecently(rows: Record<string, unknown>[], query: string): boolean {
  const wanted = foldAccents(query);
  return rows.some(row => {
    const seen = Date.parse(String(row.last_seen_at || ''));
    return foldAccents(String(row.last_query || '')) === wanted
      && Number.isFinite(seen)
      && Date.now() - seen < LIVE_QUERY_REFRESH_MS;
  });
}

function liveRow(item: ScrapedItem): Record<string, unknown> {
  return {
    id: item.sku || item.productUrl || `${item.store}:${item.name}`,
    store: item.store,
    name: item.name,
    brand: item.brand,
    sku: item.sku,
    offer_id: item.offerId,
    sales_unit: item.salesUnit,
    price: item.price,
    image_url: item.imageUrl,
    product_url: item.productUrl,
    last_seen_at: new Date().toISOString(),
    last_query: item.query,
  };
}

function mergeCatalogRows(stored: Record<string, unknown>[], live: Record<string, unknown>[]): Record<string, unknown>[] {
  const rows = new Map(stored.map(row => [String(row.sku || row.id), row]));
  for (const row of live) {
    const key = String(row.sku || row.id);
    rows.set(key, { ...rows.get(key), ...row });
  }
  return [...rows.values()];
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
    const nameFilter = query
      ? matchAnchors(canonical).map(anchor => catalogNameOrFilter(anchor.replace(/[%_]/g, ''))).join(',')
      : '';
    const search = async (maxAge: number, from: number, to: number) => {
      let request = admin.from('supermarket_products').select(COLUMNS)
        .eq('store', store)
        .eq('in_stock', true)
        .gt('price', 0)
        .gte('last_seen_at', new Date(Date.now() - maxAge).toISOString());
      // Líder exige ambos identificadores para transferir el producto al carro.
      // La búsqueda histórica dejó duplicados sin ellos que no se pueden comprar.
      if (store === 'Lider') request = request.not('sku', 'is', null).not('offer_id', 'is', null);
      if (nameFilter) request = request.or(nameFilter);
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

    const storedMatches = (data ?? []).filter(row => !query || catalogMatchScore(query, String(row.name)) >= 0);
    // El páprika y el sabor sandía puntúan bajo. No cuentan como catálogo
    // suficiente: si no hay una ficha firme, se lee la tienda.
    const solidMatches = storedMatches.filter(row => !query || catalogMatchScore(query, String(row.name)) >= 70);
    const catalogAlreadyChecked = solidMatches.length === 0 && queryFilledRecently(data ?? [], query);
    if (query && page === 0 && isLiveStore(store) && solidMatches.length < LIVE_FILL_BELOW && !queryFilledRecently(solidMatches, query) && !catalogAlreadyChecked) {
      try {
        const live = (await searchAllRetailerProducts(store, query))
          .filter(item => item.store === store
            && item.price > 0
            && (store !== 'Lider' || Boolean(item.sku && item.offerId))
            && catalogMatchScore(query, item.name) >= 0);
        data = mergeCatalogRows(data ?? [], live.map(liveRow));
        after(async () => {
          try { await rememberLiveProducts(store, query, live); }
          catch (error) { console.error('[supermarket catalog] live persistence failed', error); }
        });
      } catch (error) {
        console.error('[supermarket catalog] no se pudo completar la busqueda en la tienda', error);
      }
    }

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
