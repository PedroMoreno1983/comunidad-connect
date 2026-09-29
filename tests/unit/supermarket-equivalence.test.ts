import { describe, expect, it } from 'vitest';
import { comparableProduct, comparisonTerm } from '@/lib/supermarketEquivalence';
import type { SupermarketCatalogProduct, SupermarketSearchCandidate } from '@/lib/types';

const source: SupermarketCatalogProduct = {
  id: '1', store: 'Lider', name: 'Leche Natural Entera caja, 1 L Lider',
  brand: 'Lider', price: 1000,
};

function candidate(name: string, brand = 'Jumbo'): SupermarketSearchCandidate {
  return { id: name, name, brand, requestedTerm: 'leche natural entera caja',
    requestedQuantity: 1, quantity: 1, packUnits: 1, suppliedQuantity: 1,
    price: 1000, lineTotal: 1000, store: 'Jumbo' };
}

describe('cross-store product equivalence', () => {
  it('compares an own-brand milk with the same kind and pack size', () => {
    expect(comparableProduct(source, candidate('Leche Natural Entera caja 1 L Jumbo'))).toBe('equivalent');
    expect(comparisonTerm(source)).not.toContain('lider');
  });
  it('rejects different fat, flavor and pack sizes', () => {
    expect(comparableProduct(source, candidate('Leche Natural Semidescremada caja 1 L Jumbo'))).toBeNull();
    expect(comparableProduct(source, candidate('Leche Chocolate Entera caja 1 L Jumbo'))).toBeNull();
    expect(comparableProduct(source, candidate('Leche Natural Entera caja 200 ml Jumbo'))).toBeNull();
  });
  it('does not call another store own brand the exact same product', () => {
    expect(comparableProduct(source, candidate('Leche Natural Entera caja 1 L Lider', 'Lider'))).toBe('equivalent');
  });
});
