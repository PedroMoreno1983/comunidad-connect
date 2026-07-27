import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  batches: [] as Array<Array<{ term: string; anchor: string }>>,
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    rpc: async (_name: string, params: {
      p_queries: Array<{ term: string; anchor: string }>;
    }) => {
      state.batches.push(params.p_queries);
      return {
        data: params.p_queries.map((query, index) => ({
          requested_term: query.term,
          id: `product-${query.term}`,
          store: index % 2 === 0 ? 'Lider' : 'Jumbo',
          name: `${query.term} 1 kg`,
          brand: null,
          product_url: `https://example.com/${query.term}`,
          image_url: null,
          price: 1000 + index,
          list_price: null,
          in_stock: true,
          last_seen_at: '2026-07-27T00:00:00Z',
          channel_type: 'retail',
          pack_units: 1,
          minimum_packs: 1,
        })),
        error: null,
      };
    },
  }),
}));

import { fetchBatchSupermarketRows } from '@/lib/supermarketCatalogBatch';

describe('fetchBatchSupermarketRows', () => {
  beforeEach(() => {
    state.batches.length = 0;
  });

  it('processes one hundred products in bounded database batches', async () => {
    const terms = Array.from({ length: 100 }, (_, index) => `producto ${index + 1}`);
    const result = await fetchBatchSupermarketRows(terms, '2026-07-20T00:00:00Z');

    expect(state.batches.map(batch => batch.length)).toEqual([40, 40, 20]);
    expect(Object.keys(result || {})).toHaveLength(100);
    expect(result?.['producto 100'][0]).toMatchObject({
      requested_term: 'producto 100',
      name: 'producto 100 1 kg',
    });
  });
});
