import 'server-only';

import { buildBasketComparison } from '@/lib/supermarketBasket';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

const MAX_PRICE_AGE_MS = 24 * 60 * 60 * 1000;

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
    const pattern = `%${term.split(' ').join('%')}%`;
    const { data, error } = await supabaseAdmin
      .from('supermarket_products')
      .select('id,store,name,brand,product_url,image_url,price,list_price,in_stock,last_seen_at,channel_type,pack_units,minimum_packs')
      .eq('in_stock', true)
      .gte('last_seen_at', cutoff)
      .ilike('name', pattern)
      .order('price', { ascending: true })
      .limit(100);

    if (error) throw error;
    const rawData: unknown = data;
    const rows = Array.isArray(rawData)
      ? rawData.map(asRecord).filter((row): row is Record<string, unknown> => row !== null)
      : [];
    return [term, rows] as const;
  }));

  return buildBasketComparison(terms, Object.fromEntries(entries), requestedQuantities);
}

export async function searchPersistedSupermarkets(terms: string[]) {
  const comparison = await comparePersistedSupermarkets(terms);
  return (comparison.recommended ?? comparison.bestAvailable)?.items ?? [];
}
