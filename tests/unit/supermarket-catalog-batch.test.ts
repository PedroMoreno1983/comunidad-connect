import { beforeEach, describe, expect, it, vi } from 'vitest';

type BatchQuery = {
  term: string;
  anchor: string;
  anchors: string[];
  intent: string;
};

const state = vi.hoisted(() => ({
  batches: [] as BatchQuery[][],
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    rpc: async (name: string, params: { p_queries: BatchQuery[] }) => {
      state.batches.push(params.p_queries);
      if (name !== 'search_supermarket_products_batch_v2') {
        return { data: null, error: { code: 'PGRST202', message: 'missing function' } };
      }
      return {
        data: Object.fromEntries(params.p_queries.map((query, index) => [
          query.term,
          query.term === 'pechuga de pollo' ? [{
            id: 'cooked-snack',
            store: 'aCuenta',
            name: 'Pechuga de Pollo Cocida Bolsa 150 g PF',
            brand: 'PF',
            product_url: 'https://example.com/cooked-snack',
            image_url: null,
            price: 1750,
            list_price: null,
            in_stock: true,
            last_seen_at: '2026-07-27T00:00:00Z',
            channel_type: 'wholesale',
            pack_units: 1,
            minimum_packs: 1,
          }, {
            id: 'raw-chicken',
            store: 'aCuenta',
            name: 'Pollo Pechuga Deshuesada Congelada 750 g Super Pollo',
            brand: 'Super Pollo',
            product_url: 'https://example.com/raw-chicken',
            image_url: null,
            price: 5690,
            list_price: null,
            in_stock: true,
            last_seen_at: '2026-07-27T00:00:00Z',
            channel_type: 'wholesale',
            pack_units: 1,
            minimum_packs: 1,
          }] : [{
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
          }],
        ])),
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

  it('processes one hundred products in bounded grouped batches', async () => {
    const terms = Array.from({ length: 100 }, (_, index) => `producto ${index + 1}`);
    const result = await fetchBatchSupermarketRows(terms, '2026-07-20T00:00:00Z');

    expect(state.batches.map(batch => batch.length)).toEqual([25, 25, 25, 25]);
    expect(Object.keys(result || {})).toHaveLength(100);
    expect(result?.['producto 100'][0]).toMatchObject({
      requested_term: 'producto 100',
      name: 'producto 100 1 kg',
    });
  });

  it('keeps a suitable raw chicken option when a cooked snack has a higher text score', async () => {
    const result = await fetchBatchSupermarketRows(['pechuga de pollo'], '2026-07-20T00:00:00Z');

    expect(result?.['pechuga de pollo'].map(row => row.name)).toEqual([
      'Pollo Pechuga Deshuesada Congelada 750 g Super Pollo',
    ]);
  });

  it('sends distinctive later words so yogurt protein is not drowned by cheap yogurts', async () => {
    await fetchBatchSupermarketRows(['yogurt protein'], '2026-07-20T00:00:00Z');
    const query = state.batches.flat().find(item => item.term === 'yogur protein' || item.term === 'yogurt protein');
    expect(query?.anchor).toBe('yogur');
    expect(query?.anchors).toEqual(expect.arrayContaining(['yogur', 'yogurt', 'protein', 'proteina']));
  });
});
