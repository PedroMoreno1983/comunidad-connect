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

  it('includes Tottus when it has the cheapest complete basket', () => {
    const result = buildBasketComparison(['arroz', 'leche'], {
      arroz: [row('Jumbo', 'Arroz 1 kg', 1500), row('Tottus', 'Arroz 1 kg', 900)],
      leche: [row('Jumbo', 'Leche 1 L', 1200), row('Tottus', 'Leche 1 L', 1000)],
    });

    expect(result.recommended?.store).toBe('Tottus');
    expect(result.recommended?.subtotal).toBe(1900);
  });

  it('counts a 12-unit egg tray as one pack for a request of 12 eggs', () => {
    const result = buildBasketComparison(['huevos'], {
      huevos: [row('Santa Isabel', 'Huevos blancos grandes 12 un.', 3000)],
    }, { huevos: 12 });

    expect(result.recommended?.items[0]).toMatchObject({
      requestedQuantity: 12,
      quantity: 1,
      packUnits: 12,
      suppliedQuantity: 12,
      lineTotal: 3000,
    });
  });

  it('prefers the relevant product over a cheaper secondary mention', () => {
    const result = buildBasketComparison(['pechuga de pollo'], {
      'pechuga de pollo': [
        { ...row('Unimarc', 'Alimento gato sabor pechuga de pollo 85 g', 500), match_relevance: 70 },
        { ...row('Unimarc', 'Pechuga de pollo deshuesada 700 g', 5000), match_relevance: 140 },
      ],
    });

    expect(result.recommended?.items[0].name).toBe('Pechuga de pollo deshuesada 700 g');
  });

  it('buys enough measured packs to cover requested kilograms', () => {
    const result = buildBasketComparison(['papas'], {
      papas: [{ ...row('Tottus', 'Papa Mix Bolsa 650 g', 1790), match_relevance: 140 }],
    }, { papas: 3 }, { papas: 'kg' });

    expect(result.recommended?.items[0]).toMatchObject({
      requestedQuantity: 3,
      requestedUnit: 'kg',
      quantity: 5,
      suppliedQuantity: 3.25,
      lineTotal: 8950,
    });
  });
  it('compares different pack sizes by the full measured quantity requested', () => {
    const result = buildBasketComparison(['detergente en polvo'], {
      'detergente en polvo': [
        row('Lider', 'Detergente en polvo 700 g', 2590),
        row('Unimarc', 'Detergente en polvo 2.5 kg', 5090),
        row('Jumbo', 'Detergente en polvo 2.5 kg', 5190),
        row('Santa Isabel', 'Detergente en polvo 2.5 kg', 5290),
        row('Tottus', 'Detergente en polvo 2.5 kg', 5290),
      ],
    }, { 'detergente en polvo': 700 }, { 'detergente en polvo': 'g' });

    expect(result.recommended?.store).toBe('Lider');
    expect(result.recommended?.items[0]).toMatchObject({
      requestedQuantity: 700,
      quantity: 1,
      suppliedQuantity: 700,
      lineTotal: 2590,
    });
  });

  it('does not truncate gram requests when calculating required packs', () => {
    const result = buildBasketComparison(['leche en polvo'], {
      'leche en polvo': [row('Unimarc', 'Leche en polvo 300 g', 3790)],
    }, { 'leche en polvo': 800 }, { 'leche en polvo': 'g' });

    expect(result.recommended?.items[0]).toMatchObject({
      requestedQuantity: 800,
      quantity: 3,
      suppliedQuantity: 900,
      lineTotal: 11370,
    });
  });

  it('rejects incompatible or unprovable package units for measured requests', () => {
    const result = buildBasketComparison(['yogur'], {
      yogur: [
        row('Tottus', 'Yogur griego 150 g', 570),
        row('Tottus', 'Yogur bebible 1 L', 2500),
        row('Lider', 'Yogur familiar', 1200),
      ],
    }, { yogur: 1 }, { yogur: 'l' });

    expect(result.recommended?.store).toBe('Tottus');
    expect(result.recommended?.items[0].name).toBe('Yogur bebible 1 L');
    expect(result.comparisons.some(basket => basket.store === 'Lider')).toBe(false);
  });
});
