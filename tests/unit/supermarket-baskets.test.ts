import { describe, expect, it } from 'vitest';
import { buildBasketComparison } from '@/lib/supermarketBasket';

function row(store: string, name: string, price: number) {
  return {
    id: `${store}-${name}`,
    store,
    name,
    brand: null,
    product_url: `https://example.com/${store}/${name}`,
    image_url: null,
    price,
    list_price: null,
    in_stock: true,
    last_seen_at: '2026-07-22T12:00:00.000Z',
  };
}

describe('buildBasketComparison', () => {
  it('chooses the cheapest complete basket instead of mixing stores', () => {
    const result = buildBasketComparison(['arroz', 'leche'], {
      arroz: [
        row('Jumbo', 'Arroz premium 1 kg', 1600),
        row('Lider', 'Arroz económico 1 kg', 1300),
      ],
      leche: [
        row('Jumbo', 'Leche entera 1 L', 1000),
        row('Lider', 'Leche entera 1 L', 1500),
      ],
    });

    expect(result.recommended?.store).toBe('Jumbo');
    expect(result.recommended?.subtotal).toBe(2600);
    expect(result.recommended?.items).toHaveLength(2);
    expect(new Set(result.recommended?.items.map(item => item.store))).toEqual(new Set(['Jumbo']));
  });

  it('does not mark an incomplete basket ready for checkout', () => {
    const result = buildBasketComparison(['arroz', 'leche'], {
      arroz: [row('Jumbo', 'Arroz premium 1 kg', 1600)],
      leche: [row('Lider', 'Leche entera 1 L', 1000)],
    });

    expect(result.recommended).toBeNull();
    expect(result.bestAvailable?.complete).toBe(false);
    expect(result.bestAvailable?.missingTerms).toHaveLength(1);
  });

  it('compares equivalent package sizes across stores', () => {
    const result = buildBasketComparison(['leche'], {
      leche: [
        row('Jumbo', 'Leche chocolate 200 ml', 500),
        row('Jumbo', 'Leche entera 1 L', 1100),
        row('Lider', 'Leche entera 1 L', 1000),
        row('Santa Isabel', 'Leche entera 1 L', 1200),
      ],
    });

    expect(result.recommended?.store).toBe('Lider');
    expect(result.recommended?.items[0].name).toContain('1 L');
  });
});
