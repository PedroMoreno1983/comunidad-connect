import { describe, expect, it } from 'vitest';
import { buildCheckoutPlan } from '@/lib/supermarketCheckoutPlan';
import type { SupermarketShoppingItem } from '@/lib/types';

function item(requestedTerm: string, store: string, lineTotal: number): SupermarketShoppingItem {
  return {
    id: `${store}-${requestedTerm}`,
    name: `${requestedTerm} seleccionado`,
    requestedTerm,
    requestedQuantity: 1,
    quantity: 1,
    packUnits: 1,
    suppliedQuantity: 1,
    price: lineTotal,
    lineTotal,
    store,
    checked: false,
    available: true,
    source: 'catalog',
  };
}

describe('buildCheckoutPlan', () => {
  it('never combines products from different stores into one personal checkout', () => {
    const plan = buildCheckoutPlan([
      item('arroz', 'Jumbo', 2_000),
      item('leche', 'Lider', 1_200),
    ], ['arroz', 'leche'], ['Jumbo', 'Lider']);

    expect(plan).toMatchObject({
      status: 'needs_substitution',
      complete: false,
      requestedCount: 2,
      resolvedCount: 1,
      storeCount: 1,
      total: 2_000,
      unresolvedTerms: ['leche'],
    });
    expect(plan.baskets.map(basket => basket.store)).toEqual(['Jumbo']);
  });

  it('returns one basket plus replacement tasks when products are missing', () => {
    const plan = buildCheckoutPlan([
      item('arroz', 'Jumbo', 2_000),
      {
        id: 'missing-aceite',
        name: 'aceite',
        requestedTerm: 'aceite',
        requestedQuantity: 1,
        quantity: 1,
        packUnits: 1,
        suppliedQuantity: 1,
        price: 0,
        lineTotal: 0,
        checked: false,
        available: false,
        source: 'missing',
      },
    ], ['arroz', 'aceite'], ['Jumbo']);

    expect(plan.status).toBe('needs_substitution');
    expect(plan.resolvedCount).toBe(1);
    expect(plan.baskets[0]?.items).toHaveLength(1);
    expect(plan.substitutionTasks).toEqual([
      expect.objectContaining({ requestedTerm: 'aceite', suggestedStore: 'Jumbo' }),
    ]);
  });
});
