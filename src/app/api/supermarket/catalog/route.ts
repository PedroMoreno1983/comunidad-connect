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
    const search = async (maxAge: number) => {
      let request = admin.from('supermarket_products').select(COLUMNS)
        .eq('store', store)
        .eq('in_stock', true)
        .gt('price', 0)
        .gte('last_seen_at', new Date(Date.now() - maxAge).toISOString());
      if (anchor) request = request.ilike('name', `%${anchor}%`);
      const from = page * PAGE_SIZE;
      const size = PAGE_SIZE;
      return request.order('last_seen_at', { ascending: false }).range(from, from + size);
    };

    let { data, error } = await search(FRESH_PRICE_AGE_MS);
    if (error) throw error;
    if (!data?.length) {
      ({ data, error } = await search(STALE_PRICE_AGE_MS));
      if (error) throw error;
    }

    const scored = (data ?? []).map(row => ({
      product: productFromRow(row),
      score: query ? productMatchScore(query, String(row.name)) : 0,
    })).filter(entry => !query || entry.score >= 0)
      .sort((left, right) => right.score - left.score || left.product.price - right.product.price);
    const products = scored.slice(0, PAGE_SIZE).map(entry => entry.product);
    const payload: SupermarketCatalogResponse = {
      products,
      hasMore: Boolean(data && data.length > PAGE_SIZE),
    };
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[supermarket catalog] query failed', error);
    return NextResponse.json({ error: 'No se pudo cargar el catálogo.' }, { status: 502 });
  }
}
