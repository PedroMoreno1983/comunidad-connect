import { describe, expect, it } from 'vitest';
import {
  buildDirectCartUrl,
  countUnsupportedItems,
  directCartConfidence,
  loadabilityRank,
  MAX_ITEMS_PER_URL,
  storeLoadability,
  storeSupportsDirectCart,
} from '@/lib/supermarket/cartUrl';

const STORES = ['Jumbo', 'Santa Isabel', 'Unimarc', 'Lider', 'Tottus', 'aCuenta', 'Irurzun'];

describe('supermarket direct cart links', () => {
  it('never emits an external cart endpoint', () => {
    for (const store of STORES) {
      expect(buildDirectCartUrl(store, [{ sku: '1', quantity: 1 }])).toBeNull();
      expect(storeSupportsDirectCart(store)).toBe(false);
      expect(directCartConfidence(store)).toBeNull();
    }
  });

  it('requires the verified cart loader for every retailer', () => {
    expect(STORES.map(storeLoadability)).toEqual(STORES.map(() => 'manual'));
    expect(new Set(STORES.map(loadabilityRank))).toEqual(new Set([2]));
  });
});

describe('countUnsupportedItems', () => {
  it('counts missing SKU values', () => {
    expect(countUnsupportedItems([
      { sku: 'A', quantity: 1 },
      { sku: '', quantity: 1 },
      { sku: '  ', quantity: 1 },
    ])).toBe(2);
  });

  it('also counts products beyond the link-size ceiling', () => {
    const items = Array.from({ length: 60 }, (_, index) => ({ sku: `s${index}`, quantity: 1 }));
    expect(countUnsupportedItems(items)).toBe(60 - MAX_ITEMS_PER_URL);
  });
});
