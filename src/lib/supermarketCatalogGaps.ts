import { SUPERMARKET_STORES } from '@/lib/supermarketBasket';

/** Same window the compare reads as "fresh". */
export const FRESH_PRICE_AGE_MS = 96 * 60 * 60 * 1000;
/**
 * Jumbo historically kept ~31k rows of which only ~8% were inside 96h
 * (measured 2026-08-24). Those SKUs are still in the ~60k catalog; treating
 * them as missing is a search bug, not an absence.
 */
export const STALE_PRICE_AGE_MS = 21 * 24 * 60 * 60 * 1000;

export const LIVE_GAP_STORES = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc'] as const;

export function storesWithHits(rows: Array<{ store?: unknown }>): Set<string> {
  return new Set(rows.map(row => String(row.store || '')).filter(Boolean));
}

export function termsMissingAnyStore(
  rowsByTerm: Record<string, Array<Record<string, unknown>>>,
  terms: string[],
): string[] {
  return terms.filter((term) => {
    const present = storesWithHits(rowsByTerm[term] || []);
    return SUPERMARKET_STORES.some(store => !present.has(store));
  });
}

/** Keep fresh hits; add secondary rows only for stores that still have none. */
export function mergeMissingStoreRows(
  primary: Record<string, Array<Record<string, unknown>>>,
  secondary: Record<string, Array<Record<string, unknown>>>,
): Record<string, Array<Record<string, unknown>>> {
  const merged: Record<string, Array<Record<string, unknown>>> = { ...primary };
  for (const [term, rows] of Object.entries(secondary)) {
    const existing = merged[term] || [];
    const present = storesWithHits(existing);
    const extras = rows.filter(row => !present.has(String(row.store || '')));
    merged[term] = extras.length > 0 ? [...existing, ...extras] : existing;
  }
  for (const term of Object.keys(primary)) {
    if (!(term in merged)) merged[term] = primary[term];
  }
  return merged;
}

/**
 * Terms a live-capable store missed that at least one other store already
 * resolved. Those are the "SKU exists in the 60k catalog" gaps — not true
 * absences.
 */
export function liveGapSearchPairs(
  rowsByTerm: Record<string, Array<Record<string, unknown>>>,
  terms: string[],
  liveStores: readonly string[] = LIVE_GAP_STORES,
  maxPairs = 12,
): Array<{ store: string; term: string }> {
  const foundElsewhereByStore = liveStores.map((store) => {
    const missing = terms.filter((term) => {
      const present = storesWithHits(rowsByTerm[term] || []);
      if (present.has(store)) return false;
      return SUPERMARKET_STORES.some(other => other !== store && present.has(other));
    });
    return { store, missing };
  }).sort((left, right) => (
    right.missing.length - left.missing.length
    || (left.store === 'Jumbo' ? -1 : right.store === 'Jumbo' ? 1 : left.store.localeCompare(right.store))
  ));

  const pairs: Array<{ store: string; term: string }> = [];
  for (const entry of foundElsewhereByStore) {
    for (const term of entry.missing) {
      pairs.push({ store: entry.store, term });
      if (pairs.length >= maxPairs) return pairs;
    }
  }
  return pairs;
}
