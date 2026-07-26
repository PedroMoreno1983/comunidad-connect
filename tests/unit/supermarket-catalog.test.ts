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
                id: 'jumbo-arroz',
                store: 'Jumbo',
                name: 'Arroz grano largo 1 kg',
                brand: null,
                product_url: 'https://www.jumbo.cl/arroz',
                image_url: null,
                price: 1800,
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
                id: 'lider-arroz',
                store: 'Lider',
                name: 'Arroz grado 2 1 kg',
                brand: null,
                product_url: 'https://super.lider.cl/arroz',
                image_url: null,
                price: 1200,
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

  it('queries an absent store separately so the global price limit cannot hide Lider', async () => {
    const comparison = await comparePersistedSupermarkets(['arroz']);

    expect(state.calls).toContain('global');
    expect(state.calls).toContain('Lider');
    expect(comparison.recommended?.store).toBe('Lider');
    expect(comparison.recommended?.coveragePercent).toBe(100);
  });
});