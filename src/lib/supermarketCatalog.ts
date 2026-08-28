import 'server-only';

import {
  buildBasketComparison,
  buildSupermarketCandidate,
  isProductSuitableForRequest,
  normalizeRequestedQuantity,
  SUPERMARKET_STORES,
} from '@/lib/supermarketBasket';
import { fetchBatchSupermarketRows } from '@/lib/supermarketCatalogBatch';
import {
  FRESH_PRICE_AGE_MS,
  LIVE_GAP_STORES,
  STALE_PRICE_AGE_MS,
  liveGapSearchPairs,
  mergeMissingStoreRows,
  storesWithHits,
  termsMissingAnyStore,
} from '@/lib/supermarketCatalogGaps';
import { searchAllRetailerProducts } from '@/lib/supermarketLive';
import { matchAnchor, matchAnchors, productMatchScore } from '@/lib/supermarketText';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { SupermarketMeasurementUnit } from '@/lib/types';

const GLOBAL_CANDIDATE_LIMIT = 200;
const STORE_FALLBACK_LIMIT = 250;
const PACK_CANDIDATE_LIMIT = 300;
const PRODUCT_COLUMNS = 'id,sku,offer_id,store,name,brand,product_url,image_url,price,list_price,in_stock,last_seen_at,channel_type,pack_units,minimum_packs';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((row): row is Record<string, unknown> => row !== null)
    : [];
}

function deduplicateRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = String(row.id || `${row.store}:${row.product_url}:${row.name}:${row.price}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreRows(
  rows: Record<string, unknown>[],
  term: string,
  requestedUnit: SupermarketMeasurementUnit | undefined,
): Record<string, unknown>[] {
  const scored = rows
    .map((row): Record<string, unknown> & { match_relevance: number } => ({
      ...row,
      match_relevance: productMatchScore(term, String(row.name || '')),
    }))
    .filter(row => (
      row.match_relevance >= 0
      && isProductSuitableForRequest(String(row.name || ''), term, requestedUnit)
    ));
  const bestRelevanceByStore = new Map<string, number>();
  for (const row of scored) {
    const store = String(row.store || '');
    bestRelevanceByStore.set(
      store,
      Math.max(bestRelevanceByStore.get(store) ?? -1, row.match_relevance),
    );
  }
  return scored
    .filter(row => row.match_relevance >= (bestRelevanceByStore.get(String(row.store || '')) ?? 0) - 15)
    .sort((left, right) => (
      right.match_relevance - left.match_relevance
      || Number(left.price || 0) - Number(right.price || 0)
    ));
}

async function ilikeTermRows(
  term: string,
  cutoff: string,
  requestedUnit: SupermarketMeasurementUnit | undefined,
  missingStores?: readonly string[],
): Promise<Record<string, unknown>[]> {
  const supabaseAdmin = getSupabaseAdmin();
  const anchors = matchAnchors(term);
  const primary = matchAnchor(term);
  const pattern = primary.length <= 2 ? `${primary}%` : `%${primary}%`;
  const { data, error } = await supabaseAdmin
    .from('supermarket_products')
    .select(PRODUCT_COLUMNS)
    .eq('in_stock', true)
    .gte('last_seen_at', cutoff)
    .ilike('name', pattern)
    .order('price', { ascending: true })
    .limit(GLOBAL_CANDIDATE_LIMIT);

  if (error) throw error;
  const initialRows = normalizeRows(data);
  const presentStores = storesWithHits(
    initialRows.filter(row => productMatchScore(term, String(row.name || '')) >= 0),
  );
  const storesToScan = (missingStores ?? SUPERMARKET_STORES).filter(store => !presentStores.has(store));
  const fallbackRows = (await Promise.all(storesToScan.map(async store => {
    const patterns = [...new Set([pattern, ...anchors.map(anchor => (
      anchor.length <= 2 ? `${anchor}%` : `%${anchor}%`
    ))])];
    const pages = await Promise.all(patterns.map(async storePattern => {
      const { data: storeData, error: storeError } = await supabaseAdmin
        .from('supermarket_products')
        .select(PRODUCT_COLUMNS)
        .eq('in_stock', true)
        .eq('store', store)
        .gte('last_seen_at', cutoff)
        .ilike('name', storePattern)
        .order('price', { ascending: true })
        .limit(STORE_FALLBACK_LIMIT);
      if (storeError) throw storeError;
      return normalizeRows(storeData);
    }));
    return pages.flat();
  }))).flat();
  return scoreRows(deduplicateRows([...initialRows, ...fallbackRows]), term, requestedUnit);
}

function liveItemToRow(item: {
  store: string;
  name: string;
  brand: string;
  price: number;
  productUrl?: string;
  imageUrl?: string;
  sku?: string;
  offerId?: string;
  originalPrice?: number;
  query: string;
}): Record<string, unknown> {
  return {
    id: item.sku || `${item.store}:${item.productUrl || item.name}`,
    store: item.store,
    name: item.name,
    brand: item.brand || null,
    product_url: item.productUrl,
    image_url: item.imageUrl,
    price: item.price,
    list_price: item.originalPrice && item.originalPrice > item.price ? item.originalPrice : null,
    in_stock: true,
    last_seen_at: new Date().toISOString(),
    channel_type: 'retail',
    pack_units: 1,
    minimum_packs: 1,
    sku: item.sku,
    offer_id: item.offerId,
    requested_term: item.query,
  };
}

async function fillLiveGaps(
  rowsByTerm: Record<string, Record<string, unknown>[]>,
  terms: string[],
  requestedUnits: Record<string, SupermarketMeasurementUnit | undefined>,
): Promise<Record<string, Record<string, unknown>[]>> {
  const pairs = liveGapSearchPairs(rowsByTerm, terms, LIVE_GAP_STORES, 12);
  if (pairs.length === 0) return rowsByTerm;
  const hits = await Promise.all(pairs.map(async ({ store, term }) => {
    if (!LIVE_GAP_STORES.includes(store as typeof LIVE_GAP_STORES[number])) {
      return { term, rows: [] as Record<string, unknown>[] };
    }
    const items = await searchAllRetailerProducts(
      store as typeof LIVE_GAP_STORES[number],
      term,
      { pages: store === 'Jumbo' ? 2 : 1 },
    );
    return {
      term,
      rows: scoreRows(
        items.filter(item => item.store === store).map(item => liveItemToRow({ ...item, query: term })),
        term,
        requestedUnits[term],
      ),
    };
  }));
  const extras: Record<string, Record<string, unknown>[]> = {};
  for (const hit of hits) {
    extras[hit.term] = [...(extras[hit.term] || []), ...hit.rows];
  }
  return mergeMissingStoreRows(rowsByTerm, extras);
}

export async function comparePersistedSupermarkets(
  terms: string[],
  requestedQuantities: Record<string, number> = {},
  requestedUnits: Record<string, SupermarketMeasurementUnit | undefined> = {},
) {
  const freshCutoff = new Date(Date.now() - FRESH_PRICE_AGE_MS).toISOString();
  const staleCutoff = new Date(Date.now() - STALE_PRICE_AGE_MS).toISOString();
  const supabaseAdmin = getSupabaseAdmin();
  const freshBatch = await fetchBatchSupermarketRows(terms, freshCutoff, requestedUnits);
  let rowsByTerm: Record<string, Record<string, unknown>[]> = freshBatch
    ?? Object.fromEntries(await Promise.all(terms.map(async term => [
      term,
      await ilikeTermRows(term, freshCutoff, requestedUnits[term]),
    ] as const)));

  const gapTerms = termsMissingAnyStore(rowsByTerm, terms);
  if (gapTerms.length > 0) {
    const staleBatch = await fetchBatchSupermarketRows(gapTerms, staleCutoff, requestedUnits);
    if (staleBatch) {
      rowsByTerm = mergeMissingStoreRows(rowsByTerm, staleBatch);
    }
    const stillMissing = termsMissingAnyStore(rowsByTerm, gapTerms);
    if (stillMissing.length > 0) {
      const ilikeFills = Object.fromEntries(await Promise.all(stillMissing.map(async term => {
        const missingStores = SUPERMARKET_STORES.filter(
          store => !storesWithHits(rowsByTerm[term] || []).has(store),
        );
        return [term, await ilikeTermRows(term, staleCutoff, requestedUnits[term], missingStores)] as const;
      })));
      rowsByTerm = mergeMissingStoreRows(rowsByTerm, ilikeFills);
    }
    rowsByTerm = await fillLiveGaps(rowsByTerm, terms, requestedUnits);
  }

  const supplementalPackEntries = await Promise.all(terms
    .filter(term => !requestedUnits[term] && (requestedQuantities[term] || 1) >= 4)
    .map(async term => {
      const anchor = matchAnchor(term);
      const pattern = anchor.length <= 2 ? `${anchor}%` : `%${anchor}%`;
      const { data, error } = await supabaseAdmin
        .from('supermarket_products')
        .select(PRODUCT_COLUMNS)
        .eq('in_stock', true)
        .gte('last_seen_at', freshCutoff)
        .ilike('name', pattern)
        .ilike('name', '%pack%')
        .order('price', { ascending: true })
        .limit(PACK_CANDIDATE_LIMIT);

      if (error) throw error;
      return [term, scoreRows(normalizeRows(data), term, undefined)] as const;
    }));
  const supplementalPackRows = Object.fromEntries(supplementalPackEntries);
  const enrichedEntries = terms.map(term => [
    term,
    deduplicateRows([...(rowsByTerm[term] || []), ...(supplementalPackRows[term] || [])]),
  ] as [string, Record<string, unknown>[]]);

  rowsByTerm = Object.fromEntries(enrichedEntries);
  const comparison = buildBasketComparison(terms, rowsByTerm, requestedQuantities, requestedUnits);
  const alternativesByTerm = Object.fromEntries(enrichedEntries.map(([term, rows]) => {
    const requestedQuantity = normalizeRequestedQuantity(
      requestedQuantities[term] || 1,
      requestedUnits[term],
    );
    const seen = new Set<string>();
    const alternatives = rows
      .filter(row => isProductSuitableForRequest(
        String(row.name || ''),
        term,
        requestedUnits[term],
      ))
      .map(row => buildSupermarketCandidate(row, term, requestedQuantity, requestedUnits[term]))
      .filter(candidate => {
        const key = `${candidate.store}:${candidate.name}:${candidate.lineTotal}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) => (
        right.matchRelevance - left.matchRelevance
        || left.lineTotal - right.lineTotal
        || left.store.localeCompare(right.store)
      ))
      .slice(0, 8);
    return [term, alternatives] as const;
  }));

  return { ...comparison, alternativesByTerm };
}

export async function searchPersistedSupermarkets(terms: string[]) {
  const comparison = await comparePersistedSupermarkets(terms);
  return (comparison.recommended ?? comparison.bestAvailable)?.items ?? [];
}
