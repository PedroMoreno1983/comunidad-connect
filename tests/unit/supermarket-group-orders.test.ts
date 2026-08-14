import { describe, expect, it } from 'vitest';
import {
  buildBasketComparison,
  buildSupermarketCandidate,
  isProductSuitableForRequest,
} from '@/lib/supermarketBasket';
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

  it('removes measurement words from the product term without losing quantity', () => {
    expect(parseGroupShoppingList('3 kilos de papas\n2 kg tomates\ncebollas 4 kg')).toEqual([
      { term: 'papas', quantity: 3, unit: 'kg' },
      { term: 'tomates', quantity: 2, unit: 'kg' },
      { term: 'cebollas', quantity: 4, unit: 'kg' },
    ]);
    expect(parseGroupShoppingList(
      'leche en polvo 800 g, detergente en polvo 700 g, jugo 1500 ml',
    )).toEqual([
      { term: 'leche en polvo', quantity: 800, unit: 'g' },
      { term: 'detergente en polvo', quantity: 700, unit: 'g' },
      { term: 'jugo', quantity: 1500, unit: 'ml' },
    ]);
  });

  it('accepts the common un abbreviation without leaving it in the product term', () => {
    expect(parseGroupShoppingList('pan de molde 1 un, te 20 un')).toEqual([
      { term: 'pan de molde', quantity: 1 },
      { term: 'te', quantity: 20 },
    ]);
  });

  it('parses a party drinks list with emoji bullets and packaging quantities', () => {
    expect(parseGroupShoppingList([
      '- 🍷 3 botellas de vino',
      '- 🍸 1 botella de gin',
      '- 🥃 3 botellas de pisco',
      '- 🍹 2 botellas de Aperol',
      '- 3 champaña brut',
      '- 🍺 40 cervezas .',
      '- 3 botellas de agua con gas',
      '- 4 coca',
      '- 1 tónica',
      '- 2 Canadá dray',
    ].join('\n'))).toEqual([
      { term: 'vino', quantity: 3 },
      { term: 'gin', quantity: 1 },
      { term: 'pisco', quantity: 3 },
      { term: 'aperol', quantity: 2 },
      { term: 'champana brut', quantity: 3 },
      { term: 'cervezas', quantity: 40 },
      { term: 'agua con gas', quantity: 3 },
      { term: 'coca', quantity: 4 },
      { term: 'tonica', quantity: 1 },
      { term: 'canada dray', quantity: 2 },
    ]);
  });

  it('uses declared pack size to supply a requested number of beers', () => {
    const result = buildBasketComparison(['cervezas'], {
      cervezas: [
        {
          id: 'single',
          store: 'Lider',
          name: 'Cerveza Lager Lata 350 ml',
          price: 1290,
          pack_units: 1,
          channel_type: 'retail',
        },
        {
          id: 'pack',
          store: 'Lider',
          name: 'Cerveza Lager Latas Pack 12 Un 350 ml',
          price: 8690,
          pack_units: 1,
          channel_type: 'retail',
        },
      ],
    }, { cervezas: 40 });

    expect(result.comparisons[0]?.items[0]).toMatchObject({
      name: 'Cerveza Lager Latas Pack 12 Un 350 ml',
      requestedQuantity: 40,
      quantity: 4,
      packUnits: 12,
      suppliedQuantity: 48,
    });
  });

  it('does not confuse a 330 ml presentation with a pack of 330 beers', () => {
    const candidate = buildSupermarketCandidate({
      id: 'unknown-pack',
      store: 'Lider',
      name: 'Cerveza Pils Lager Botellas Pack 330 ml Kross',
      price: 5190,
      pack_units: 1,
    }, 'cervezas', 40);
    expect(candidate).toMatchObject({ packUnits: 1, quantity: 40, suppliedQuantity: 40 });

    const explicitPack = buildSupermarketCandidate({
      id: 'six-pack',
      store: 'Unimarc',
      name: 'Pack cerveza Corelli lager lata 6 un de 330 cc',
      price: 4990,
      pack_units: 1,
    }, 'cervezas', 40);
    expect(explicitPack).toMatchObject({ packUnits: 6, quantity: 7, suppliedQuantity: 42 });

    const multipliedPack = buildSupermarketCandidate({
      id: 'multiplied-six-pack',
      store: 'Tottus',
      name: 'Pack Bebida Coca Cola Original Lata 6 x 350 ml',
      price: 4990,
      pack_units: 1,
    }, 'coca', 4);
    expect(multipliedPack).toMatchObject({ packUnits: 6, quantity: 1, suppliedQuantity: 6 });

    const namedSixPack = buildSupermarketCandidate({
      id: 'named-six-pack',
      store: 'Tottus',
      name: 'Cerveza Estrella Damm Botella 330 cc Six Pack',
      price: 5990,
      pack_units: 1,
    }, 'cervezas', 40);
    expect(namedSixPack).toMatchObject({ packUnits: 6, quantity: 7, suppliedQuantity: 42 });
  });

  it('does not substitute a prepared sour mix for a bottle of pisco', () => {
    expect(isProductSuitableForRequest('Pisco Especial 35° Botella 1 L', 'pisco', undefined)).toBe(true);
    expect(isProductSuitableForRequest('Pisco Sour Campanario 1 L', 'pisco', undefined)).toBe(false);
    expect(isProductSuitableForRequest('Base Pisco Sour Mix 200 g', 'pisco', undefined)).toBe(false);
    expect(isProductSuitableForRequest('Pisco Ice Altonic 7°', 'pisco', undefined)).toBe(false);
  });

  it('does not silently substitute alcohol-free beer or a mixed soda pack', () => {
    expect(isProductSuitableForRequest('Cerveza Lager Lata 350 ml', 'cervezas', undefined)).toBe(true);
    expect(isProductSuitableForRequest('Cerveza Sin Alcohol Lata 330 cc', 'cervezas', undefined)).toBe(false);
    expect(isProductSuitableForRequest('Cerveza Sin Alcohol Lata 330 cc', 'cerveza sin alcohol', undefined)).toBe(true);
    expect(isProductSuitableForRequest('Bebida Coca-Cola Original 2 L', 'coca', undefined)).toBe(true);
    expect(isProductSuitableForRequest('Pack Coca-Cola + Sprite 3 L', 'coca', undefined)).toBe(false);
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
