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
    name: `${term} 1 kg`,
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

describe('large resilient supermarket checkout', () => {
  it('accepts one hundred and twenty distinct products and caps abusive lists', () => {
    const products = Array.from({ length: 205 }, (_, index) => `producto-codigo-${index + 1}`);
    const firstHundredTwenty = parseGroupShoppingList(products.slice(0, 120).join('\n'));
    const capped = parseGroupShoppingList(products.join('\n'));

    expect(firstHundredTwenty).toHaveLength(120);
    expect(capped).toHaveLength(MAX_SHOPPING_LIST_ITEMS);
    expect(capped.at(-1)?.term).toBe('producto codigo 200');
  });

  it('completes the purchase with a second store when no single store has everything', () => {
    const result = buildBasketComparison(['arroz', 'leche'], {
      arroz: [row('Jumbo', 'arroz', 1500)],
      leche: [row('Lider', 'leche', 1000)],
    });

    expect(result.recommended).toBeNull();
    expect(result.purchasePlan).toMatchObject({
      status: 'split_store',
      complete: true,
      requestedCount: 2,
      resolvedCount: 2,
      storeCount: 2,
      total: 2500,
      unresolvedTerms: [],
    });
    expect(result.purchasePlan.baskets.map(basket => basket.store).sort()).toEqual(['Jumbo', 'Lider']);
  });

  it('keeps the best available plan moving and exposes only genuinely unresolved products', () => {
    const result = buildBasketComparison(['arroz', 'leche', 'aceite'], {
      arroz: [row('Jumbo', 'arroz', 1500)],
      leche: [row('Lider', 'leche', 1000)],
      aceite: [],
    });

    expect(result.purchasePlan).toMatchObject({
      status: 'needs_substitution',
      complete: false,
      requestedCount: 3,
      resolvedCount: 2,
      storeCount: 2,
      total: 2500,
      unresolvedTerms: ['aceite'],
    });
  });
});
