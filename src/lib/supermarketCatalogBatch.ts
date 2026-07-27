import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { matchAnchor, productMatchScore } from '@/lib/supermarketText';

const QUERY_CHUNK_SIZE = 40;
const CANDIDATES_PER_STORE = 12;

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

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function isMissingBatchFunction(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202'
    || error.code === '42883'
    || /(could not find.*search_supermarket_products_batch|search_supermarket_products_batch.*does not exist)/i.test(error.message || '');
}

export async function fetchBatchSupermarketRows(
  terms: string[],
  cutoff: string,
): Promise<Record<string, Record<string, unknown>[]> | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const collected: Record<string, unknown>[] = [];

  for (const termChunk of chunks(terms, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabaseAdmin.rpc('search_supermarket_products_batch', {
      p_queries: termChunk.map(term => ({ term, anchor: matchAnchor(term) })),
      p_cutoff: cutoff,
      p_limit_per_store: CANDIDATES_PER_STORE,
    });
    if (error) {
      if (isMissingBatchFunction(error)) return null;
      throw error;
    }
    collected.push(...normalizeRows(data));
  }

  return Object.fromEntries(terms.map(term => {
    const scored = collected
      .filter(row => row.requested_term === term)
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
    return [term, refined];
  }));
}
