import { describe, expect, it } from 'vitest';
import { buildBasketComparison } from '@/lib/supermarketBasket';
import { allocateGroupCosts, parseGroupShoppingList } from '@/lib/supermarketGroupDomain';

describe('supermarket group orders', () => {
  it('parses and consolidates mixed quantity formats without dropping unquantified products', () => {
    expect(parseGroupShoppingList('arroz 2, leche x 6, arroz 3, aceite')).toEqual([
      { term: 'arroz', quantity: 5 },
      { term: 'leche', quantity: 6 },
      { term: 'aceite', quantity: 1 },
    ]);
    expect(parseGroupShoppingList('2 arroz\n3 x huevos\npan (4)\nyogurt')).toEqual([
      { term: 'arroz', quantity: 2 },
      { term: 'huevos', quantity: 3 },
      { term: 'pan', quantity: 4 },
      { term: 'yogurt', quantity: 1 },
    ]);
    expect(parseGroupShoppingList('arroz 9999, x, leche 0')).toEqual([]);
  });

  it('keeps all fifteen requested products and defaults missing quantities to one', () => {
    const result = parseGroupShoppingList([
      '2 arroz',
      'leche',
      'huevos x 12',
      'aceite',
      'pan 2',
      'tomates',
      'cebolla 3',
      'papas',
      'detergente',
      'papel higiénico 2',
      'café',
      'azúcar',
      'sal',
      'yogurt 6',
      'avena',
    ].join('\n'));

    expect(result).toHaveLength(15);
    expect(result).toContainEqual({ term: 'arroz', quantity: 2 });
    expect(result).toContainEqual({ term: 'leche', quantity: 1 });
    expect(result).toContainEqual({ term: 'huevos', quantity: 12 });
    expect(result).toContainEqual({ term: 'avena', quantity: 1 });
  });

  it('allocates the prepared basket exactly by each participant contribution', () => {
    const allocation = allocateGroupCosts([
      { userId: 'ana', term: 'arroz', quantity: 2 },
      { userId: 'bea', term: 'arroz', quantity: 1 },
      { userId: 'ana', term: 'leche', quantity: 1 },
      { userId: 'bea', term: 'leche', quantity: 3 },
    ], [
      { requestedTerm: 'arroz', lineTotal: 3000 },
      { requestedTerm: 'leche', lineTotal: 4000 },
    ], 'ana');

    expect(allocation).toEqual({ ana: 3000, bea: 4000 });
    expect(Object.values(allocation).reduce((sum, amount) => sum + amount, 0)).toBe(7000);
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
