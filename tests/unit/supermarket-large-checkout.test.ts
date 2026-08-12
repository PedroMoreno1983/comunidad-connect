import { describe, expect, it } from 'vitest';
import { buildBasketComparison } from '@/lib/supermarketBasket';
import {
  MAX_SHOPPING_LIST_ITEMS,
  parseGroupShoppingList,
} from '@/lib/supermarketGroupDomain';

function row(store: string, term: string, price: number) {
  return {
    id: `${store}-${term}`,
    store,
    name: term === 'leche' ? `${term} 1 L` : `${term} 1 kg`,
    brand: null,
    product_url: `https://example.com/${store}/${term}`,
    image_url: null,
    price,
    list_price: null,
    in_stock: true,
    last_seen_at: '2026-07-27T00:00:00Z',
    channel_type: 'retail',
    pack_units: 1,
    minimum_packs: 1,
  };
}

describe('large single-store supermarket checkout', () => {
  it('accepts one hundred and twenty distinct products and caps abusive lists', () => {
    const products = Array.from({ length: 205 }, (_, index) => `producto-codigo-${index + 1}`);
    const firstHundredTwenty = parseGroupShoppingList(products.slice(0, 120).join('\n'));
    const capped = parseGroupShoppingList(products.join('\n'));

    expect(firstHundredTwenty).toHaveLength(120);
    expect(capped).toHaveLength(MAX_SHOPPING_LIST_ITEMS);
    expect(capped.at(-1)?.term).toBe('producto codigo 200');
  });

  it('does not complete a personal purchase by splitting it across stores', () => {
    const result = buildBasketComparison(['arroz', 'leche'], {
      arroz: [row('Jumbo', 'arroz', 1500)],
      leche: [row('Lider', 'leche', 1000)],
    });

    expect(result.recommended).toBeNull();
    expect(result.purchasePlan).toMatchObject({
      status: 'needs_substitution',
      complete: false,
      requestedCount: 2,
      resolvedCount: 1,
      storeCount: 1,
      total: 1000,
      unresolvedTerms: ['arroz'],
    });
    expect(result.purchasePlan.baskets.map(basket => basket.store)).toEqual(['Lider']);
  });

  it('keeps unresolved products in the best single store', () => {
    const result = buildBasketComparison(['arroz', 'leche', 'aceite'], {
      arroz: [row('Jumbo', 'arroz', 1500)],
      leche: [row('Lider', 'leche', 1000)],
      aceite: [],
    });

    expect(result.purchasePlan).toMatchObject({
      status: 'needs_substitution',
      complete: false,
      requestedCount: 3,
      resolvedCount: 1,
      storeCount: 1,
      total: 1000,
      unresolvedTerms: ['arroz', 'aceite'],
    });
    expect(result.purchasePlan.baskets.map(basket => basket.store)).toEqual(['Lider']);
  });
});
