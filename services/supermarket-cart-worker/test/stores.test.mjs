import assert from 'node:assert/strict';
import test from 'node:test';
import { InputError, STORE_CONFIGS, sanitizeSessionRequest } from '../src/stores.mjs';

const stores = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus', 'aCuenta', 'Irurzun'];

test('defines a browser adapter for every compared supermarket', () => {
  assert.deepEqual(Object.keys(STORE_CONFIGS), stores);
  for (const config of Object.values(STORE_CONFIGS)) {
    assert.ok(config.cartUrl.startsWith('https://'));
    assert.ok(config.addSelectors.length > 0);
    assert.ok(config.cartSelectors.length > 0);
  }
});

test('keeps only exact retailer HTTPS product hosts', () => {
  const result = sanitizeSessionRequest({
    store: 'Lider',
    items: [
      { id: 'ok', name: 'Arroz', requestedTerm: 'arroz', quantity: 500, productUrl: 'https://super.lider.cl/ip/arroz/123' },
      { id: 'bad', name: 'Leche', requestedTerm: 'leche', quantity: 1, productUrl: 'https://evil.example/super.lider.cl/leche' },
    ],
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].quantity, 99);
  assert.deepEqual(result.missingItems, ['Leche']);
});

test('allows only the official direct-cart host for the selected retailer', () => {
  const result = sanitizeSessionRequest({
    store: 'Jumbo',
    plannedCount: 1,
    directCartUrl: 'https://jumbo.vtexcommercestable.com.br/checkout/cart/add?sku=1&qty=1&seller=1',
    items: [],
  });
  assert.equal(result.plannedCount, 1);
  assert.match(result.directCartUrl, /^https:\/\/jumbo\.vtexcommercestable\.com\.br\//);

  assert.throws(() => sanitizeSessionRequest({
    store: 'Jumbo',
    plannedCount: 1,
    directCartUrl: 'https://example.com/checkout/cart/add?sku=1',
    items: [],
  }), InputError);
});

test('rejects unsupported stores and empty managed carts', () => {
  assert.throws(() => sanitizeSessionRequest({ store: 'Otro', items: [] }), InputError);
  assert.throws(() => sanitizeSessionRequest({ store: 'Tottus', items: [] }), InputError);
});
