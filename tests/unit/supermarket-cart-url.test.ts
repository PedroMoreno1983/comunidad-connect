import { describe, expect, it } from 'vitest';
import {
  buildDirectCartUrl,
  countUnsupportedItems,
  directCartConfidence,
  loadabilityRank,
  MAX_ITEMS_PER_URL,
  storeLoadability,
  storeSupportsDirectCart,
  storeSupportsShopifyCart,
  storeSupportsStorefrontQueryCart,
  storeSupportsVtexCart,
} from '@/lib/supermarket/cartUrl';

const DIRECT_STORES = ['Jumbo', 'Santa Isabel', 'Irurzun'] as const;
const MANUAL_STORES = ['Lider', 'Unimarc', 'Tottus', 'aCuenta'] as const;

describe('supermarket direct cart links', () => {
  it('builds a Jumbo storefront query that CartFromUrl reads on jumbo.cl', () => {
    const url = buildDirectCartUrl('Jumbo', [
      { sku: '111151', quantity: 2 },
      { sku: '6699', quantity: 1 },
    ]);

    expect(url).toBe('https://www.jumbo.cl/?sku=111151%2C6699&qty=2%2C1');
    expect(url).not.toContain('vtexcommercestable');
    expect(url).not.toContain('/checkout/cart/add');
  });

  it('builds a Santa Isabel home query with quantity (not Jumbo qty) and without action', () => {
    const url = buildDirectCartUrl('Santa Isabel', [
      { sku: '3294', quantity: 2 },
      { sku: '875', quantity: 1 },
    ]);

    expect(url).toBe('https://www.santaisabel.cl/?sku=3294%2C875&quantity=2%2C1');
    expect(url).not.toContain('qty=');
    expect(url).not.toContain('action=');
    expect(url).not.toContain('vtexcommercestable');
    expect(url).not.toContain('/checkout/cart/add');
  });

  it('does not send Unimarc to a VTEX account-host cart', () => {
    expect(buildDirectCartUrl('Unimarc', [{ sku: '32', quantity: 2 }])).toBeNull();
    expect(storeLoadability('Unimarc')).toBe('manual');
  });

  it('builds an Irurzun Shopify cart permalink from variant ids', () => {
    expect(buildDirectCartUrl('Irurzun', [
      { sku: '48766781554945', quantity: 2 },
      { sku: '49884190769409', quantity: 1 },
    ])).toBe('https://irurzun.cl/cart/48766781554945:2,49884190769409:1');
  });

  it('does not invent a cart link for stores without a public add URL', () => {
    for (const store of MANUAL_STORES) {
      expect(buildDirectCartUrl(store, [{ sku: '1', quantity: 1 }])).toBeNull();
      expect(storeSupportsDirectCart(store)).toBe(false);
      expect(directCartConfidence(store)).toBeNull();
      expect(storeLoadability(store)).toBe('manual');
    }
  });

  it('marks Jumbo, Santa Isabel and Irurzun as direct', () => {
    expect(DIRECT_STORES.every(storeSupportsDirectCart)).toBe(true);
    expect(storeSupportsStorefrontQueryCart('Jumbo')).toBe(true);
    expect(storeSupportsStorefrontQueryCart('Santa Isabel')).toBe(true);
    expect(storeSupportsVtexCart('Jumbo')).toBe(true);
    expect(storeSupportsVtexCart('Santa Isabel')).toBe(false);
    expect(storeSupportsShopifyCart('Irurzun')).toBe(true);
    expect(DIRECT_STORES.map(loadabilityRank)).toEqual([0, 0, 0]);
  });

  it('returns null when no SKU can travel in the link', () => {
    expect(buildDirectCartUrl('Jumbo', [{ sku: '  ', quantity: 1 }])).toBeNull();
    expect(buildDirectCartUrl('Jumbo', [])).toBeNull();
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
