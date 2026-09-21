import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIDER_CART_API_HOSTS,
  LIDER_CART_API_SCRIPT,
  LIDER_CART_API_URL,
  apiEligibleItems,
  apiRequestItems,
  confirmLiderItems,
  normalizeItemKey,
  parseLiderCartResponse,
} from '../src/liderCartApi.mjs';
import { STORE_CONFIGS, sanitizeSessionRequest } from '../src/stores.mjs';

const items = [
  { id: 'a', name: 'Resma oficio', quantity: 2, sku: '00000003448847', offerId: '6203', salesUnit: 'EACH' },
  { id: 'b', name: 'Desodorante', quantity: 1, sku: '00000004006023', offerId: '1044390' },
  { id: 'c', name: 'Sin codigo', quantity: 1, productUrl: 'https://super.lider.cl/ip/x/1' },
];

test('normalizes numeric keys by dropping leading zeros only', () => {
  assert.equal(normalizeItemKey('00000003448847'), '3448847');
  assert.equal(normalizeItemKey('3448847'), '3448847');
  assert.equal(normalizeItemKey('0'), '0');
  assert.equal(normalizeItemKey('abc-01'), 'abc-01');
  assert.equal(normalizeItemKey(undefined), '');
});

test('only items with both sku and offerId can go through the API', () => {
  assert.deepEqual(apiEligibleItems(items).map(item => item.id), ['a', 'b']);
  assert.deepEqual(apiEligibleItems(undefined), []);
});

test('builds the exact input shape updateItems expects, defaulting salesUnit', () => {
  assert.deepEqual(apiRequestItems(items), [
    { offerId: '6203', quantity: 2, usItemId: '00000003448847', salesUnit: 'EACH', name: 'Resma oficio' },
    { offerId: '1044390', quantity: 1, usItemId: '00000004006023', salesUnit: 'EACH', name: 'Desodorante' },
  ]);
});

test('a response without lineItems proves nothing', () => {
  assert.equal(parseLiderCartResponse(null), null);
  assert.equal(parseLiderCartResponse({ data: {} }), null);
  assert.equal(parseLiderCartResponse({ data: { updateItems: { lineItems: null } } }), null);
  // HTTP 200 con `errors` y sin carro: sigue sin probar nada.
  assert.equal(parseLiderCartResponse({ errors: [{ message: 'x' }], data: { updateItems: {} } }), null);
});

test('reads landed quantities keyed by normalized usItemId', () => {
  const landed = parseLiderCartResponse({
    data: {
      updateItems: {
        lineItems: [
          { quantity: 2, product: { usItemId: '00000003448847' } },
          { quantity: 0, product: { usItemId: '00000004006023' } },
          { quantity: 1, product: {} },
        ],
      },
    },
  });
  assert.deepEqual([...landed], [['3448847', 2]]);
});

test('an empty cart response never marks anything as added', () => {
  const { confirmed, unconfirmed } = confirmLiderItems(items, new Map());
  assert.equal(confirmed.length, 0);
  assert.deepEqual(unconfirmed.map(entry => entry.item.id), ['a', 'b']);
  assert.ok(unconfirmed.every(entry => entry.detail.includes('no confirmo')));
});

test('confirms exact quantities and reports short ones instead of accepting them', () => {
  const landed = new Map([['3448847', 1], ['4006023', 1]]);
  const { confirmed, unconfirmed } = confirmLiderItems(items, landed);
  assert.deepEqual(confirmed.map(entry => entry.item.id), ['b']);
  assert.equal(unconfirmed.length, 1);
  assert.equal(unconfirmed[0].item.id, 'a');
  assert.match(unconfirmed[0].detail, /1 de 2/);
});

test('the in-page script is valid JS that always answers Selenium and targets the real contract', () => {
  assert.doesNotThrow(() => new Function(LIDER_CART_API_SCRIPT));
  for (const marker of [
    '/orchestra/graphql',
    'mutation updateItems',
    'x-o-platform-version',
    'release-metadata',
    "'_app-'",
    'usItemId',
    'offerId',
    'salesUnit',
  ]) {
    assert.ok(LIDER_CART_API_SCRIPT.includes(marker), `falta ${marker}`);
  }
  // Tanto el camino feliz como cualquier error terminan en done(...).
  assert.ok(LIDER_CART_API_SCRIPT.includes('done({ ok: true'));
  assert.ok(LIDER_CART_API_SCRIPT.includes('.catch(error => done({ ok: false'));
  // El script no puede cerrar sobre este modulo: nada de imports ni de constantes externas.
  assert.ok(!LIDER_CART_API_SCRIPT.includes('import '));
});

test('Lider declares the API adapter only on the host that owns the cart', () => {
  const config = STORE_CONFIGS.Lider;
  assert.equal(config.cartApi, 'lider-orchestra');
  assert.equal(config.cartApiUrl, LIDER_CART_API_URL);
  assert.deepEqual(config.cartApiHosts, LIDER_CART_API_HOSTS);
  assert.deepEqual(LIDER_CART_API_HOSTS, ['super.lider.cl']);
  for (const [store, other] of Object.entries(STORE_CONFIGS)) {
    if (store !== 'Lider') assert.equal(other.cartApi, undefined, `${store} no tiene adaptador verificado`);
  }
});

test('session sanitizing keeps sku, offerId and salesUnit for the API path', () => {
  const result = sanitizeSessionRequest({
    store: 'Lider',
    items: [{
      id: 'a',
      name: 'Resma oficio',
      quantity: 2,
      productUrl: 'https://super.lider.cl/ip/libreria/resma/00000003448847',
      sku: '00000003448847',
      offerId: '6203',
      salesUnit: 'EACH',
    }],
  });
  assert.equal(result.items[0].sku, '00000003448847');
  assert.equal(result.items[0].offerId, '6203');
  assert.equal(result.items[0].salesUnit, 'EACH');
});
