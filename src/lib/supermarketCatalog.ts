import 'server-only';

import { buildBasketComparison, buildSupermarketCandidate } from '@/lib/supermarketBasket';
import { matchAnchor, productMatchScore } from '@/lib/supermarketText';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

/** TTL dinámico: 96h para cubrir la rotación diaria de términos del refresh. */
const MAX_PRICE_AGE_MS = 96 * 60 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function comparePersistedSupermarkets(
  terms: string[],
  requestedQuantities: Record<string, number> = {},
) {
  const cutoff = new Date(Date.now() - MAX_PRICE_AGE_MS).toISOString();
  const supabaseAdmin = getSupabaseAdmin();
  const entries = await Promise.all(terms.map(async term => {
    // Postgres ILIKE es sensible a acentos: buscamos por la palabra ancla
    // (primera significativa, sin acentos y con stem: "jaleas"→"jalea") y
    // refinamos en JS, donde "queso en laminas" calza con "Queso en Láminas Colun".
    const anchor = matchAnchor(term);
    const pattern = `%${anchor}%`;
    const { data, error } = await supabaseAdmin
      .from('supermarket_products')
      .select('id,store,name,brand,product_url,image_url,price,list_price,in_stock,last_seen_at,channel_type,pack_units,minimum_packs')
      .eq('in_stock', true)
      .gte('last_seen_at', cutoff)
      .ilike('name', pattern)
      .order('price', { ascending: true })
      .limit(200);

    if (error) throw error;
    const rawData: unknown = data;
    const rows = Array.isArray(rawData)
      ? rawData.map(asRecord).filter((row): row is Record<string, unknown> => row !== null)
      : [];
    const refined = rows
      .map((row): Record<string, unknown> & { match_relevance: number } => ({
        ...row,
        match_relevance: productMatchScore(term, String(row.name || '')),
      }))
      .filter(row => row.match_relevance >= 0)
      .sort((left, right) => (
        right.match_relevance - left.match_relevance
        || Number(left.price || 0) - Number(right.price || 0)
      ));
    // Never fall back to the broad anchor: an honest missing item is safer
    // than presenting tomato sauce as tomato or a sugar-free yogurt as sugar.
    return [term, refined] as const;
  }));

  const rowsByTerm = Object.fromEntries(entries);
  const comparison = buildBasketComparison(terms, rowsByTerm, requestedQuantities);
  const alternativesByTerm = Object.fromEntries(entries.map(([term, rows]) => {
    const requestedQuantity = Math.min(500, Math.max(1, Math.round(requestedQuantities[term] || 1)));
    const seen = new Set<string>();
    const alternatives = rows
      .map(row => buildSupermarketCandidate(row, term, requestedQuantity))
      .filter(candidate => {
        const key = `${candidate.store}:${candidate.name}:${candidate.lineTotal}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) => left.lineTotal - right.lineTotal || left.store.localeCompare(right.store))
      .slice(0, 8);
    return [term, alternatives] as const;
  }));

  return { ...comparison, alternativesByTerm };
}

export async function searchPersistedSupermarkets(terms: string[]) {
  const comparison = await comparePersistedSupermarkets(terms);
  return (comparison.recommended ?? comparison.bestAvailable)?.items ?? [];
}
