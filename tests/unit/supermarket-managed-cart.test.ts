import { describe, expect, it } from 'vitest';
import {
  buildManagedCartItemScript,
  managedCartItems,
} from '@/lib/supermarketManagedCart';
import type {
  SupermarketManagedCartItem,
  SupermarketManagedStoreConfig,
  SupermarketSearchCandidate,
} from '@/lib/types';

const candidate = (store: string, productUrl: string): SupermarketSearchCandidate => ({
  id: `${store}-1`,
  name: 'Arroz grado 2 1 kg',
  requestedTerm: 'arroz',
  requestedQuantity: 2,
  quantity: 2,
  packUnits: 1,
  suppliedQuantity: 2,
  price: 1_000,
  lineTotal: 2_000,
  store,
  productUrl,
});

describe('managed supermarket cart', () => {
  it.each([
    ['Jumbo', 'https://www.jumbo.cl/arroz/p'],
    ['Santa Isabel', 'https://www.santaisabel.cl/arroz/p'],
    ['Lider', 'https://super.lider.cl/ip/arroz/123'],
    ['Unimarc', 'https://www.unimarc.cl/product/arroz'],
    ['Tottus', 'https://www.tottus.cl/tottus-cl/product/arroz'],
    ['aCuenta', 'https://www.acuenta.cl/arroz/p'],
    ['Irurzun', 'https://irurzun.cl/products/arroz'],
  ])('accepts an exact HTTPS product page for %s', (store, productUrl) => {
    expect(managedCartItems(store, [candidate(store, productUrl)])).toHaveLength(1);
  });

  it('rejects a product URL outside the selected retailer', () => {
    expect(managedCartItems('Jumbo', [candidate('Jumbo', 'https://example.com/arroz')])).toEqual([]);
  });

  it('clamps quantities and never interpolates raw HTML from product data', () => {
    const config: SupermarketManagedStoreConfig = {
      hosts: ['irurzun.cl'],
      cartUrl: 'https://irurzun.cl/cart',
      addSelectors: ['button[name="add"]'],
      plusSelectors: ['button[name="plus"]'],
      quantitySelectors: ['input[name="quantity"]'],
      cartSelectors: ['button[aria-label="Carrito"]'],
    };
    const item: SupermarketManagedCartItem = {
      id: 'item-1',
      name: '</script><script>window.pwned=true</script>',
      requestedTerm: 'arroz',
      quantity: 1,
      productUrl: 'https://irurzun.cl/products/arroz',
    };
    const script = buildManagedCartItemScript(config, item, 1, 1);

    expect(script).not.toContain('</script>');
    expect(script).toContain('convive-managed-cart');
    expect(script).toContain('Agregado y verificado');
    expect(script).toContain('Producto no disponible');
    expect(script).toContain('elige un metodo de entrega');
    expect(script).toContain('__conviveManagedCartAttempt');
  });
});
