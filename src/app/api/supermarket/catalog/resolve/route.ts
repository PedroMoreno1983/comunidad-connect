import { after, NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { rememberLiveProducts } from '@/lib/supermarketCatalogLiveFill';
import { searchAllRetailerProducts, type ScrapedItem } from '@/lib/supermarketLive';
import { canonicalCatalogTerm, catalogNameOrFilter, catalogSearchScore, matchAnchor, matchAnchors } from '@/lib/supermarketText';
import { isProductSuitableForRequest, matchesRequestedPackageSize, SUPERMARKET_STORES } from '@/lib/supermarketBasket';
import { parseGroupShoppingList, MAX_SHOPPING_LIST_CHARS } from '@/lib/supermarketGroupDomain';
import { FRESH_PRICE_AGE_MS, STALE_PRICE_AGE_MS } from '@/lib/supermarketCatalogGaps';
import type { SupermarketCatalogProduct, SupermarketListResolution } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const COLUMNS = 'id,store,name,brand,sku,offer_id,sales_unit,price,image_url,product_url,last_seen_at';
const MAX_LIST_CANDIDATES = 5000;
const SOLID_MATCH_SCORE = 70;
const LIVE_STORES = new Set<ScrapedItem['store']>(['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus']);

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
        const rows: Record<string, unknown>[] = [];
        const filters = matchAnchors(canonicalCatalogTerm(item.term)).map(catalogNameOrFilter).join(',');
        // Rank every candidate, not only the newest 350. The desired brand or
        // package can be further down the same catalog that browsing displays.
        for (let offset = 0; rows.length < MAX_LIST_CANDIDATES; offset += 500) {
          let query = admin.from('supermarket_products').select(COLUMNS)
            .eq('store', store).eq('in_stock', true).gt('price', 0)
            .gte('last_seen_at', new Date(Date.now() - age).toISOString())
            .or(filters).order('last_seen_at', { ascending: false }).order('id');
          if (store === 'Lider') query = query.not('sku', 'is', null).not('offer_id', 'is', null);
          const result = await query.range(offset, offset + 499);
          if (result.error) throw result.error;
          const batch = result.data ?? [];
          rows.push(...batch);
          if (batch.length < 500) break;
        }
        return rows;
      };
      let rows = await fetchRows(FRESH_PRICE_AGE_MS);
      let usedStale = false;
      if (!rows.length) {
        rows = await fetchRows(STALE_PRICE_AGE_MS);
        usedStale = true;
      }
      const suitable = (name: string, sku?: string, offerId?: string) => (
        catalogSearchScore(item.term, name) >= 0
        && isProductSuitableForRequest(name, item.term, item.unit)
        && matchesRequestedPackageSize(name, item.term)
        && (store !== 'Lider' || Boolean(sku && offerId))
      );
      const pickBest = (candidates: Record<string, unknown>[]) => candidates.map(row => ({ row, score: catalogSearchScore(item.term, String(row.name || '')) }))
        .filter(entry => suitable(String(entry.row.name), String(entry.row.sku || ''), String(entry.row.offer_id || '')))
        .sort((a, b) => b.score - a.score || Number(a.row.price) - Number(b.row.price))[0];
      let best = pickBest(rows);
      // A recent spice jar must not hide an older exact vegetable.
      if ((!best || best.score < SOLID_MATCH_SCORE) && !usedStale) {
        const older = pickBest(await fetchRows(STALE_PRICE_AGE_MS));
        if (older && (!best || older.score > best.score)) best = older;
      }
      if ((!best || best.score < SOLID_MATCH_SCORE) && LIVE_STORES.has(store as ScrapedItem['store'])) {
        const live = (await searchAllRetailerProducts(store as ScrapedItem['store'], item.term).catch(error => {
          console.error('[supermarket list resolution] live search failed', error);
          return [];
        }))
          .filter(hit => hit.store === store && suitable(hit.name, hit.sku, hit.offerId))
          .sort((a, b) => catalogSearchScore(item.term, b.name) - catalogSearchScore(item.term, a.name) || a.price - b.price);
        const chosen = live[0];
        const chosenScore = chosen ? catalogSearchScore(item.term, chosen.name) : -1;
        if (chosen && (!best || chosenScore > best.score)) {
          after(async () => {
            try { await rememberLiveProducts(store, item.term, live.slice(0, 8)); }
            catch (error) { console.error('[supermarket list resolution] live persistence failed', error); }
          });
          return {
            term: item.term,
            quantity: item.quantity,
            product: {
              id: chosen.sku || `${store}:${chosen.name}`,
              store,
              name: chosen.name,
              brand: chosen.brand || '',
              sku: chosen.sku,
              offerId: chosen.offerId,
              salesUnit: chosen.salesUnit,
              price: chosen.price,
              imageUrl: chosen.imageUrl,
              productUrl: chosen.productUrl,
              fetchedAt: new Date().toISOString(),
            },
          };
        }
      }
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
