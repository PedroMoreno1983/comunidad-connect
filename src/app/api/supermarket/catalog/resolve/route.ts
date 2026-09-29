import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { canonicalCatalogTerm, matchAnchor, productMatchScore } from '@/lib/supermarketText';
import { isProductSuitableForRequest, matchesRequestedPackageSize, SUPERMARKET_STORES } from '@/lib/supermarketBasket';
import { parseGroupShoppingList, MAX_SHOPPING_LIST_CHARS } from '@/lib/supermarketGroupDomain';
import { FRESH_PRICE_AGE_MS, STALE_PRICE_AGE_MS } from '@/lib/supermarketCatalogGaps';
import type { SupermarketCatalogProduct, SupermarketListResolution } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const COLUMNS = 'id,store,name,brand,sku,offer_id,sales_unit,price,image_url,product_url,last_seen_at';

export async function POST(req: NextRequest) {
  const client = await getSupabaseUserClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Lista inválida.' }, { status: 400 });
  const input = body as Record<string, unknown>;
  const store = input.store;
  const list = input.list;
  if (typeof store !== 'string' || !SUPERMARKET_STORES.includes(store as typeof SUPERMARKET_STORES[number])
    || typeof list !== 'string' || list.length > MAX_SHOPPING_LIST_CHARS) {
    return NextResponse.json({ error: 'Supermercado o lista inválida.' }, { status: 400 });
  }
  const requested = parseGroupShoppingList(list, true);
  if (requested.length === 0 || requested.length > 25) {
    return NextResponse.json({ error: 'Envía entre 1 y 25 productos por bloque.' }, { status: 400 });
  }
  try {
    const admin = getSupabaseAdmin();
    const resolved: SupermarketListResolution[] = await Promise.all(requested.map(async item => {
      const anchor = matchAnchor(canonicalCatalogTerm(item.term)).replace(/[%_]/g, '');
      if (anchor.length < 2) return { term: item.term, quantity: item.quantity };
      const fetchRows = async (age: number) => {
        let query = admin.from('supermarket_products').select(COLUMNS)
          .eq('store', store).eq('in_stock', true).gt('price', 0)
          .gte('last_seen_at', new Date(Date.now() - age).toISOString())
          .ilike('name', `%${anchor}%`).order('last_seen_at', { ascending: false }).limit(350);
        if (store === 'Lider') query = query.not('sku', 'is', null).not('offer_id', 'is', null);
        const result = await query;
        if (result.error) throw result.error;
        return result.data ?? [];
      };
      let rows = await fetchRows(FRESH_PRICE_AGE_MS);
      if (!rows.length) rows = await fetchRows(STALE_PRICE_AGE_MS);
      const best = rows.map(row => ({ row, score: productMatchScore(item.term, String(row.name || '')) }))
        .filter(entry => entry.score >= 0 && isProductSuitableForRequest(String(entry.row.name), item.term, item.unit)
          && matchesRequestedPackageSize(String(entry.row.name), item.term)
          && (store !== 'Lider' || Boolean(entry.row.sku && entry.row.offer_id)))
        .sort((a, b) => b.score - a.score || Number(a.row.price) - Number(b.row.price))[0];
      if (!best) return { term: item.term, quantity: item.quantity };
      const row = best.row;
      const product: SupermarketCatalogProduct = {
        id: String(row.id), store, name: String(row.name), brand: String(row.brand || ''),
        sku: String(row.sku || '') || undefined, offerId: String(row.offer_id || '') || undefined,
        salesUnit: String(row.sales_unit || '') || undefined, price: Number(row.price),
        imageUrl: String(row.image_url || '') || undefined, productUrl: String(row.product_url || '') || undefined,
        fetchedAt: String(row.last_seen_at || '') || undefined,
      };
      return { term: item.term, quantity: item.quantity, product };
    }));
    return NextResponse.json({ resolved }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (failure) {
    console.error('[supermarket list resolution] failed', failure);
    return NextResponse.json({ error: 'No se pudo consultar el catálogo.' }, { status: 502 });
  }
}
