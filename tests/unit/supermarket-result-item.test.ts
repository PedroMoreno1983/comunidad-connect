import { describe, expect, it } from 'vitest';
import { catalogOfferId, toSupermarketShoppingItem } from '@/lib/supermarketResultItem';

describe('catalogOfferId', () => {
  it('reads offerId from catalog candidates and offer_id from raw rows', () => {
    expect(catalogOfferId({ offerId: '821920' })).toBe('821920');
    expect(catalogOfferId({ offer_id: '821916' })).toBe('821916');
    expect(catalogOfferId({ offerId: '  ', offer_id: '4523' })).toBe('4523');
    expect(catalogOfferId({ sku: '0078' })).toBeUndefined();
  });
});

describe('toSupermarketShoppingItem', () => {
  it('keeps Lider identifiers and sales unit for the official app link', () => {
    const item = toSupermarketShoppingItem({
      id: 'lider-leche',
      name: 'Leche Colun 1 L',
      brand: 'Colun',
      sku: '00780433000693',
      offerId: '821920',
      salesUnit: 'EACH',
      price: 1190,
      store: 'Lider',
      productUrl: 'https://www.lider.cl/ip/leche/00780433000693',
      quantity: 2,
      packUnits: 1,
      suppliedQuantity: 2,
    }, { term: 'leche', quantity: 2 }, 'catalog', 3);

    expect(item).toMatchObject({
      sku: '00780433000693',
      offerId: '821920',
      salesUnit: 'EACH',
      store: 'Lider',
      quantity: 2,
      available: true,
      source: 'catalog',
    });
  });

  it('does not drop offer_id when the row still uses the database column name', () => {
    const item = toSupermarketShoppingItem({
      id: 'jumbo-arroz',
      name: 'Arroz Grado 2 1 kg',
      sku: '123',
      offer_id: 'offer-row',
      sales_unit: 'WEIGHT',
      price: 1490,
      store: 'Jumbo',
      productUrl: 'https://www.jumbo.cl/arroz/p',
    }, { term: 'arroz', quantity: 1 }, 'catalog');

    expect(item.offerId).toBe('offer-row');
    expect(item.salesUnit).toBe('WEIGHT');
    expect(item.sku).toBe('123');
  });
});
