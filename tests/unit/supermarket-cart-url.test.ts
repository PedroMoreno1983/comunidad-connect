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
  storeSupportsVtexCart,
} from '@/lib/supermarket/cartUrl';

const DIRECT_STORES = ['Jumbo', 'Santa Isabel', 'Unimarc', 'Irurzun'] as const;
const MANUAL_STORES = ['Lider', 'Tottus', 'aCuenta'] as const;

describe('supermarket direct cart links', () => {
  it('builds a VTEX session add URL on the account host, not the branded site', () => {
    const url = buildDirectCartUrl('Jumbo', [
      { sku: '111151', quantity: 2 },
      { sku: '6699', quantity: 1 },
    ]);

    expect(url).toBe(
      'https://jumbo.vtexcommercestable.com.br/checkout/cart/add?sku=111151&sku=6699&qty=2&qty=1&seller=1&seller=1&sc=1&redirect=true',
    );
    expect(url).not.toContain('jumbo.cl');
  });

  it('builds Santa Isabel and Unimarc add URLs on their VTEX account hosts', () => {
    expect(buildDirectCartUrl('Santa Isabel', [{ sku: '11389', quantity: 1 }])).toContain(
      'https://santaisabel.vtexcommercestable.com.br/checkout/cart/add?',
    );
    expect(buildDirectCartUrl('Unimarc', [{ sku: '32', quantity: 2 }])).toBe(
      'https://unimarc.vtexcommercestable.com.br/checkout/cart/add?sku=32&qty=2&seller=1&sc=1&redirect=true',
    );
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

  it('marks the four verified stores as direct', () => {
    expect(DIRECT_STORES.every(storeSupportsDirectCart)).toBe(true);
    expect(storeSupportsVtexCart('Jumbo')).toBe(true);
    expect(storeSupportsShopifyCart('Irurzun')).toBe(true);
    expect(DIRECT_STORES.map(loadabilityRank)).toEqual([0, 0, 0, 0]);
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
