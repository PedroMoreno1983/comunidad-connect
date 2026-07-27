import 'server-only';

import {
  buildBasketComparison,
  buildSupermarketCandidate,
  isProductMeasurementCompatible,
  normalizeRequestedQuantity,
  SUPERMARKET_STORES,
} from '@/lib/supermarketBasket';
import { fetchBatchSupermarketRows } from '@/lib/supermarketCatalogBatch';
import { matchAnchor, productMatchScore } from '@/lib/supermarketText';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { SupermarketMeasurementUnit } from '@/lib/types';

/** TTL dinámico: 96h para cubrir la rotación diaria de términos del refresh. */
const MAX_PRICE_AGE_MS = 96 * 60 * 60 * 1000;
const GLOBAL_CANDIDATE_LIMIT = 200;
const STORE_FALLBACK_LIMIT = 250;

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

export async function comparePersistedSupermarkets(
  terms: string[],
  requestedQuantities: Record<string, number> = {},
  requestedUnits: Record<string, SupermarketMeasurementUnit | undefined> = {},
) {
  const cutoff = new Date(Date.now() - MAX_PRICE_AGE_MS).toISOString();
  const supabaseAdmin = getSupabaseAdmin();
  const batchedRows = await fetchBatchSupermarketRows(terms, cutoff);
  const entries: Array<[string, Record<string, unknown>[]]> = batchedRows
    ? Object.entries(batchedRows)
    : await Promise.all(terms.map(async term => {
    // Postgres ILIKE es sensible a acentos: buscamos por la palabra ancla
    // (primera significativa, sin acentos y con stem: "jaleas"→"jalea") y
    // refinamos en JS, donde "queso en laminas" calza con "Queso en Láminas Colun".
    const anchor = matchAnchor(term);
    const pattern = anchor.length <= 2 ? `${anchor}%` : `%${anchor}%`;
    const { data, error } = await supabaseAdmin
      .from('supermarket_products')
      .select('id,store,name,brand,product_url,image_url,price,list_price,in_stock,last_seen_at,channel_type,pack_units,minimum_packs')
      .eq('in_stock', true)
      .gte('last_seen_at', cutoff)
      .ilike('name', pattern)
      .order('price', { ascending: true })
      .limit(GLOBAL_CANDIDATE_LIMIT);

    if (error) throw error;
    const initialRows = normalizeRows(data);
    const presentStores = new Set(initialRows
      .filter(row => productMatchScore(term, String(row.name || '')) >= 0)
      .map(row => String(row.store || '')));
    const missingStores = SUPERMARKET_STORES.filter(store => !presentStores.has(store));
    const fallbackRows = (await Promise.all(missingStores.map(async store => {
      const { data: storeData, error: storeError } = await supabaseAdmin
        .from('supermarket_products')
        .select('id,store,name,brand,product_url,image_url,price,list_price,in_stock,last_seen_at,channel_type,pack_units,minimum_packs')
        .eq('in_stock', true)
        .eq('store', store)
        .gte('last_seen_at', cutoff)
        .ilike('name', pattern)
        .order('price', { ascending: true })
        .limit(STORE_FALLBACK_LIMIT);

      if (storeError) throw storeError;
      return normalizeRows(storeData);
    }))).flat();
    const rows = deduplicateRows([...initialRows, ...fallbackRows]);
    const scored = rows
      .map((row): Record<string, unknown> & { match_relevance: number } => ({
        ...row,
        match_relevance: productMatchScore(term, String(row.name || '')),
      }))
      .filter(row => row.match_relevance >= 0);
    const bestRelevanceByStore = new Map<string, number>();
    for (const row of scored) {
      const store = String(row.store || '');
      bestRelevanceByStore.set(
        store,
        Math.max(bestRelevanceByStore.get(store) ?? -1, row.match_relevance),
      );
    }
    const refined = scored
      .filter(row => row.match_relevance >= (bestRelevanceByStore.get(String(row.store || '')) ?? 0) - 15)
      .sort((left, right) => (
        right.match_relevance - left.match_relevance
        || Number(left.price || 0) - Number(right.price || 0)
      ));
    // Never fall back to the broad anchor: an honest missing item is safer
    // than presenting tomato sauce as tomato or a sugar-free yogurt as sugar.
    return [term, refined] as [string, Record<string, unknown>[]];
  }));

  const rowsByTerm = Object.fromEntries(entries);
  const comparison = buildBasketComparison(terms, rowsByTerm, requestedQuantities, requestedUnits);
  const alternativesByTerm = Object.fromEntries(entries.map(([term, rows]) => {
    const requestedQuantity = normalizeRequestedQuantity(
      requestedQuantities[term] || 1,
      requestedUnits[term],
    );
    const seen = new Set<string>();
    const alternatives = rows
      .filter(row => isProductMeasurementCompatible(String(row.name || ''), requestedUnits[term]))
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
