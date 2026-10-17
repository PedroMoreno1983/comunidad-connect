import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ gtinQueries: [] as string[] }));

vi.mock('server-only', () => ({}));

// Filas reales de supermarket_products (17-oct-2026), recortadas.
const LASAGNA = {
  santa: { id: '00000000-0000-4000-8000-000000000001', store: 'Santa Isabel', name: 'Lasaña Carozzi 400 g', brand: 'Carozzi', price: 2390, gtin: '7802575007261' },
  lider: { id: '00000000-0000-4000-8000-000000000002', store: 'Lider', name: 'Lasaña Tradicional Caja 400 g Carozzi', brand: null, price: 2190, sku: '780257500726', offer_id: 'OFF1', gtin: '7802575007261' },
  acuenta: { id: '00000000-0000-4000-8000-000000000003', store: 'aCuenta', name: 'Lasaña Tradicional Caja 400 g Carozzi', brand: 'Carozzi', price: 2090, gtin: '7802575007261' },
  unimarc: { id: '00000000-0000-4000-8000-000000000004', store: 'Unimarc', name: 'Lasaña tradicional Carozzi caja 400 g', brand: 'Carozzi', price: 2490, gtin: '7802575007261' },
};

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        in: async (_column: string, ids: string[]) => ({
          data: Object.values(LASAGNA).filter(row => ids.includes(row.id)).map(row => ({ id: row.id, gtin: row.gtin })),
          error: null,
        }),
        eq: (column: string, value: unknown) => { filters[column] = value; return query; },
        gte: () => query,
        order: () => query,
        limit: async () => {
          state.gtinQueries.push(String(filters.gtin));
          return { data: Object.values(LASAGNA).filter(row => row.gtin === filters.gtin), error: null };
        },
      };
      return query;
    },
  }),
}));

import { normalizeGtin, gtinCheckDigit } from '@/lib/supermarketGtin';
import {
  attachSameProductRows,
  isSpecificProductTerm,
  mergeSameProductRows,
  pickAnchorGtin,
  sizeTokens,
} from '@/lib/supermarketGtinMatch';
import { canonicalCatalogTerm, matchAnchors, productMatchScore, significantWords } from '@/lib/supermarketText';
import { buildBasketComparison } from '@/lib/supermarketBasket';

describe('normalizeGtin', () => {
  it('completes Lider codes stored without check digit', () => {
    expect(gtinCheckDigit('780462162162')).toBe(9);
    expect(normalizeGtin('00780462162162', 'Lider')).toBe('7804621621629');
    expect(normalizeGtin('00780257500726', 'Lider')).toBe('7802575007261');
  });

  it('keeps valid EAN-13 and pads UPC-A / EAN-8', () => {
    expect(normalizeGtin('7802575007261', 'Santa Isabel')).toBe('7802575007261');
    expect(normalizeGtin('036000291452', 'aCuenta')).toBe('0036000291452');
    expect(normalizeGtin('78014046', 'Unimarc')).toBe('0000078014046');
  });

  it('keeps GTIN-14 with indicator digit whole', () => {
    expect(normalizeGtin('17808709504252', 'Unimarc')).toBe('17808709504252');
  });

  it('drops invalid, internal and restricted-circulation codes', () => {
    expect(normalizeGtin('7802575007262')).toBeNull();
    expect(normalizeGtin('12345')).toBeNull();
    expect(normalizeGtin('2000000000008')).toBeNull();
    expect(normalizeGtin('400000000003')).toBeNull();
    expect(normalizeGtin(null)).toBeNull();
    expect(normalizeGtin('78025750072a1')).toBeNull();
  });
});

describe('brand spelling', () => {
  it('folds Coca-Cola, Coca Cola and CocaCola to the same words', () => {
    expect(canonicalCatalogTerm('Coca-Cola')).toBe('coca cola');
    expect(canonicalCatalogTerm('CocaCola')).toBe('coca cola');
    expect(significantWords('Bebida Original Botella 3 L CocaCola')).toEqual(['bebida', 'original', 'botella', 'coca', 'cola']);
    expect(productMatchScore('coca cola', 'Bebida Original Botella 3 L CocaCola')).toBeGreaterThan(0);
    expect(productMatchScore('cocacola', 'Bebida Original Botella 3 L Coca-Cola')).toBeGreaterThan(0);
  });

  it('keeps short-word brands (Mc Kay, Oral-B, Watt\'s) matchable', () => {
    expect(productMatchScore('galletas mckay', 'Galletas Mc Kay Soda 160 g')).toBeGreaterThan(0);
    expect(productMatchScore('galletas mc kay', 'Galletas McKay Soda 160 g')).toBeGreaterThan(0);
    expect(productMatchScore('pasta dental oral b', 'Pasta Dental Oral-B Pro 90 g')).toBeGreaterThan(0);
    expect(productMatchScore('nectar watts', "Néctar Watt's Durazno 1,5 L")).toBeGreaterThan(0);
    expect(matchAnchors('galletas mc kay')).toEqual(expect.arrayContaining(['mckay', 'mc kay']));
  });
});

describe('same product by GTIN', () => {
  it('only treats branded/sized requests as concrete products', () => {
    expect(isSpecificProductTerm('lasaña carozzi 400 g')).toBe(true);
    expect(isSpecificProductTerm('coca cola 3 l')).toBe(true);
    expect(isSpecificProductTerm('leche')).toBe(false);
    expect(isSpecificProductTerm('coca cola')).toBe(false);
  });

  it('anchors on a top-scored code whose brand the person named', () => {
    const rows = [
      { ...LASAGNA.santa, match_relevance: 140 },
      { ...LASAGNA.unimarc, match_relevance: 130 },
      { id: 'x', store: 'Unimarc', name: 'Lasaña Lucchetti 400 g', brand: 'Lucchetti', gtin: '7801320240015', match_relevance: 120 },
    ];
    expect(pickAnchorGtin(rows, 'lasaña carozzi 400 g')).toBe('7802575007261');
    expect(pickAnchorGtin(rows, 'lasaña 400 g')).toBeNull();
  });

  it('does not anchor on a size the person did not ask for', () => {
    // Medición del 17-oct: "coca cola original 3 l" anclaba en la de 591 ml.
    expect([...sizeTokens('coca cola original 3 l')]).toEqual(['3000ml']);
    expect([...sizeTokens('Leche Entera Natural Caja 1 l 1 L Colun')]).toEqual(['1000ml']);
    const rows = [
      { id: 'a', store: 'Santa Isabel', name: 'Bebida Coca-Cola Original 591 ml', brand: 'Coca-Cola', gtin: '7801610000571', match_relevance: 150 },
      { id: 'b', store: 'Unimarc', name: 'Bebida Coca Cola original botella 591 ml', brand: 'Coca Cola', gtin: '7801610000571', match_relevance: 150 },
      { id: 'c', store: 'Santa Isabel', name: 'Bebida Coca-Cola Original 3 L', brand: 'Coca-Cola', gtin: '7801610323236', match_relevance: 140 },
    ];
    expect(pickAnchorGtin(rows, 'coca cola original 3 l')).toBe('7801610323236');
  });

  it('keeps the common format for stores without the GTIN (Jumbo)', () => {
    const term = 'leche entera colun 1 l';
    const rows = mergeSameProductRows([
      { id: 'j1', store: 'Jumbo', name: 'Leche Colun Entera 1 L', brand: 'Colun', price: 1180, match_relevance: 140 },
      { id: 'j2', store: 'Jumbo', name: 'Leche Colun Entera 200 ml', brand: 'Colun', price: 620, match_relevance: 140 },
      { id: 's0', store: 'Santa Isabel', name: 'Leche Colun Entera 1 L', brand: 'Colun', price: 1150, match_relevance: 140 },
    ], '7802920777542', [
      { id: 's1', store: 'Santa Isabel', name: 'Leche Colun Entera 1 L', brand: 'Colun', price: 1150 },
      { id: 'u1', store: 'Unimarc', name: 'Leche entera natural Colun sin tapa 1 L', brand: 'Colun', price: 1250 },
    ], term);
    const comparison = buildBasketComparison([term], { [term]: rows });
    const jumbo = comparison.comparisons.find(basket => basket.store === 'Jumbo');
    expect(jumbo?.items[0]?.name).toBe('Leche Colun Entera 1 L');
  });

  it('pulls the same GTIN from stores whose names did not match', async () => {
    const result = await attachSameProductRows({
      'lasaña carozzi 400 g': [{ ...LASAGNA.santa, match_relevance: 140 }],
    }, ['lasaña carozzi 400 g', 'leche'], new Date(0).toISOString(), 'id,store,name');
    const rows = result['lasaña carozzi 400 g'];
    expect(new Set(rows.map(row => row.store))).toEqual(new Set(['Santa Isabel', 'Lider', 'aCuenta', 'Unimarc']));
    expect(rows.every(row => row.same_product === true)).toBe(true);
    expect(state.gtinQueries).toEqual(['7802575007261']);
  });

  it('prefers the same product over a cheaper name match in the basket', () => {
    const cheaperNameMatch = { id: 'u2', store: 'Unimarc', name: 'Lasaña Carozzi Espinaca 400 g', brand: 'Carozzi', price: 1500, match_relevance: 150 };
    const rows = mergeSameProductRows(
      [{ ...LASAGNA.santa, match_relevance: 140 }, cheaperNameMatch],
      '7802575007261',
      [LASAGNA.lider, LASAGNA.unimarc],
      'lasaña carozzi 400 g',
    );
    const comparison = buildBasketComparison(['lasaña carozzi 400 g'], { 'lasaña carozzi 400 g': rows });
    const unimarc = comparison.comparisons.find(basket => basket.store === 'Unimarc');
    expect(unimarc?.items[0]?.name).toBe('Lasaña tradicional Carozzi caja 400 g');
    const lider = comparison.comparisons.find(basket => basket.store === 'Lider');
    expect(lider?.items[0]?.name).toBe('Lasaña Tradicional Caja 400 g Carozzi');
  });

  it('falls back to name matching when the gtin column is missing', async () => {
    const rows = { 'lasaña carozzi 400 g': [{ id: 'not-a-uuid', store: 'Jumbo', name: 'Lasaña Carozzi 400 g', match_relevance: 140 }] };
    await expect(attachSameProductRows(rows, ['lasaña carozzi 400 g'], '', 'id')).resolves.toBe(rows);
  });
});
