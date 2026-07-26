import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      let store: string | undefined;
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          if (column === 'store') store = String(value);
          return query;
        },
        gte: () => query,
        ilike: () => query,
        order: () => query,
        limit: async () => {
          state.calls.push(store ?? 'global');
          if (!store) {
            return {
              data: [{
                id: 'jumbo-leche-polvo',
                store: 'Jumbo',
                name: 'Leche en polvo entera 800 g',
                brand: null,
                product_url: 'https://www.jumbo.cl/leche-polvo',
                image_url: null,
                price: 7800,
                list_price: null,
                in_stock: true,
                last_seen_at: new Date().toISOString(),
                channel_type: 'retail',
                pack_units: 1,
                minimum_packs: 1,
              }, {
                id: 'lider-irrelevant',
                store: 'Lider',
                name: 'Chocolate con leche 100 g',
                brand: null,
                product_url: 'https://super.lider.cl/chocolate',
                image_url: null,
                price: 500,
                list_price: null,
                in_stock: true,
                last_seen_at: new Date().toISOString(),
                channel_type: 'retail',
                pack_units: 1,
                minimum_packs: 1,
              }],
              error: null,
            };
          }
          if (store === 'Lider') {
            return {
              data: [{
                id: 'lider-leche-polvo',
                store: 'Lider',
                name: 'Leche en polvo entera 900 g',
                brand: null,
                product_url: 'https://super.lider.cl/leche-polvo',
                image_url: null,
                price: 7200,
                list_price: null,
                in_stock: true,
                last_seen_at: new Date().toISOString(),
                channel_type: 'retail',
                pack_units: 1,
                minimum_packs: 1,
              }],
              error: null,
            };
          }
          return { data: [], error: null };
        },
      };
      return query;
    },
  }),
}));

import { comparePersistedSupermarkets } from '@/lib/supermarketCatalog';

describe('comparePersistedSupermarkets', () => {
  beforeEach(() => {
    state.calls.length = 0;
  });

  it('queries a store again when the global limit contains only irrelevant matches for it', async () => {
    const comparison = await comparePersistedSupermarkets(['leche en polvo']);

    expect(state.calls).toContain('global');
    expect(state.calls).toContain('Lider');
    expect(comparison.recommended?.store).toBe('Lider');
    expect(comparison.recommended?.coveragePercent).toBe(100);
  });
});