import { afterEach, describe, expect, it, vi } from 'vitest';
import { simulateBasketTotal } from '@/lib/supermarketSimulation';
import { fetchSealsBySku } from '@/lib/supermarketSeals';
import { supermarketBasketIdentity } from '@/lib/supermarketBasketIdentity';
import type { SupermarketShoppingItem } from '@/lib/types';

afterEach(() => vi.unstubAllGlobals());

describe('basket integrity regressions', () => {
  it.each([
    { id: '111', quantity: 4, seller: '1', availability: 'withoutStock' },
    { id: '111', quantity: 3, seller: '1', availability: 'available' },
    { id: 'different', quantity: 4, seller: '1', availability: 'available' },
  ])('rejects unavailable or mismatched items: %j', async item => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      totals: [{ id: 'Items', value: 100_000 }], items: [item],
    }))));
    const result = await simulateBasketTotal('Jumbo', [{ sku: '111', quantity: 4 }]);
    expect(result.complete).toBe(false);
    expect(result.total).toBeUndefined();
  });

  it('does not truncate 61 requested items', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await simulateBasketTotal('Jumbo', Array.from({ length: 61 }, (_, index) => ({ sku: String(index), quantity: 1 })));
    expect(result.complete).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recognizes aggregated quantities of a repeated SKU', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      totals: [{ id: 'Items', value: 100_000 }],
      items: [{ id: '111', quantity: 4, seller: '1', availability: 'available' }],
    }))));
    expect(await simulateBasketTotal('Jumbo', [{ sku: '111', quantity: 2 }, { sku: '111', quantity: 2 }]))
      .toMatchObject({ complete: true, total: 1000, resolvedItems: 2 });
  });

  it('distinguishes missing specifications from an explicitly empty specification', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { items: [{ itemId: '111' }] },
      { items: [{ itemId: '222' }], 'Flag Nutricional': [] },
    ]))));
    expect(await fetchSealsBySku('Jumbo', ['111', '222'])).toEqual({ '222': [] });
  });

  it('invalidates enrichment when quantity, SKU, store or availability changes', () => {
    const item = { sku: '111', quantity: 1, available: true, requestedTerm: 'leche' } as SupermarketShoppingItem;
    const initial = supermarketBasketIdentity('Jumbo', [item]);
    for (const change of [{ quantity: 2 }, { sku: '222' }, { available: false }]) {
      expect(supermarketBasketIdentity('Jumbo', [{ ...item, ...change }])).not.toBe(initial);
    }
    expect(supermarketBasketIdentity('Unimarc', [item])).not.toBe(initial);
  });
});
