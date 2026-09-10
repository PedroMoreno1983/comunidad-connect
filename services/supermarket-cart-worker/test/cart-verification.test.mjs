import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyDirectCart, verifyLiderCart } from '../src/cartVerification.mjs';

const item = { name: 'Leche', productUrl: 'https://super.lider.cl/ip/leche/00123', quantity: 2 };
test('verifies the actual product and quantity, deduplicating image/title links', () => {
  const link = { href: 'https://super.lider.cl/ip/seort/00123', label: 'Leche, 2 en el carro' };
  assert.equal(verifyLiderCart([item], [link, link]).complete, true);
});
test('refuses wrong products, wrong quantities and login pages', () => {
  for (const links of [[], [{ href: item.productUrl, label: 'Leche, 1 en el carro' }], [{ href: 'https://super.lider.cl/ip/otra/999', label: 'Otra, 2 en el carro' }]]) {
    const result = verifyLiderCart([item], links);
    assert.equal(result.complete, false);
    assert.equal(result.verified, 0);
    assert.deepEqual(result.missingItems, ['Leche']);
  }
});
test('adds requested quantities for repeated products', () => {
  assert.equal(verifyLiderCart([item, item], [{ href: item.productUrl, label: 'Leche, 4 en el carro' }]).complete, true);
});

test('refuses a cart that also contains an unrequested product', () => {
  const result = verifyLiderCart([item], [
    { href: item.productUrl, label: 'Leche, 2 en el carro' },
    { href: 'https://super.lider.cl/ip/otra/999', label: 'Otra, 1 en el carro' },
  ]);
  assert.equal(result.complete, false);
  assert.deepEqual(result.unexpectedProducts, ['999']);
});

test('verifies every VTEX SKU, seller and quantity from the direct URL', () => {
  const url = 'https://store.example/checkout/cart/add?sku=1&qty=2&seller=1&sku=2&qty=1&seller=5';
  const items = [
    { id: '1', quantity: 2, seller: '1', availability: 'available' },
    { id: '2', quantity: 1, seller: '5', availability: 'available' },
  ];
  assert.equal(verifyDirectCart(url, 'vtex', { items }), true);
  assert.equal(verifyDirectCart(url, 'vtex', { items: [{ ...items[0], quantity: 1 }, items[1]] }), false);
  assert.equal(verifyDirectCart(url, 'vtex', { items: [items[0]] }), false);
  assert.equal(verifyDirectCart(url, 'vtex', { items: [...items, { id: '3', quantity: 1, seller: '1', availability: 'available' }] }), false);
  assert.equal(verifyDirectCart(url, 'vtex', { items: [{ ...items[0], availability: 'unavailable' }, items[1]] }), false);
});

test('verifies every Shopify variant and quantity from the direct URL', () => {
  const url = 'https://store.example/cart/10:2,20:1';
  const items = [{ variant_id: 10, quantity: 2 }, { variant_id: 20, quantity: 1 }];
  assert.equal(verifyDirectCart(url, 'shopify', { items }), true);
  assert.equal(verifyDirectCart(url, 'shopify', { items: [{ variant_id: 10, quantity: 2 }] }), false);
  assert.equal(verifyDirectCart(url, 'shopify', { items: [...items, { variant_id: 30, quantity: 1 }] }), false);
});
