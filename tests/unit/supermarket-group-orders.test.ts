import { describe, expect, it } from 'vitest';
import { buildBasketComparison } from '@/lib/supermarketBasket';
import { parseGroupShoppingList } from '@/lib/supermarketGroupDomain';

describe('supermarket group orders', () => {
  it('parses and consolidates quantities without trusting arbitrary values', () => {
    expect(parseGroupShoppingList('arroz 2, leche x 6, arroz 3, aceite')).toEqual([
      { term: 'arroz', quantity: 5 },
      { term: 'leche', quantity: 6 },
      { term: 'aceite', quantity: 1 },
    ]);
    expect(parseGroupShoppingList('arroz 9999, x, leche 0')).toEqual([]);
  });

  it('compares total packs for an aggregated group quantity', () => {
    const rows = {
      arroz: [
        {
          id: 'retail',
          store: 'Lider',
          name: 'Arroz 1 kg',
          price: 1500,
          pack_units: 1,
          channel_type: 'retail',
          last_seen_at: '2026-07-23T10:00:00Z',
        },
        {
          id: 'wholesale',
          store: 'Irurzun',
          name: 'Arroz 1 kg manga 10 unidades',
          price: 12000,
          pack_units: 10,
          channel_type: 'wholesale',
          last_seen_at: '2026-07-23T10:00:00Z',
        },
      ],
    };
    const result = buildBasketComparison(['arroz'], rows, { arroz: 18 });
    const lider = result.comparisons.find(item => item.store === 'Lider');
    const irurzun = result.comparisons.find(item => item.store === 'Irurzun');
    expect(lider?.subtotal).toBe(27000);
    expect(irurzun?.subtotal).toBe(24000);
    expect(irurzun?.items[0]).toMatchObject({
      requestedQuantity: 18,
      quantity: 2,
      packUnits: 10,
      suppliedQuantity: 20,
      lineTotal: 24000,
    });
    expect(result.recommended?.store).toBe('Irurzun');
  });
});
