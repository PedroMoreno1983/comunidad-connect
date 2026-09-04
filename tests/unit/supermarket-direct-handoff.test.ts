import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareDirectCartHandoff } from '@/lib/supermarketDirectHandoff';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('direct supermarket cart handoff', () => {
  it('builds an official VTEX checkout link with live SKU and seller', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{
      productName: 'Arroz Pregraneado 1 kg',
      items: [{
        itemId: '111151',
        nameComplete: 'Arroz Pregraneado 1 kg',
        sellers: [{
          sellerId: '1',
          commertialOffer: { AvailableQuantity: 50, Price: 2_150 },
        }],
      }],
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const result = await prepareDirectCartHandoff('Jumbo', [{
      id: 'arroz-1',
      name: 'Arroz Pregraneado 1 kg',
      requestedTerm: 'arroz',
      quantity: 2,
      sku: '111151',
      productUrl: 'https://www.jumbo.cl/arroz-pregraneado/p',
    }]);

    expect(result.supported).toBe(true);
    expect(result.plannedCount).toBe(1);
    expect(result.cartUrl).toContain('jumbo.vtexcommercestable.com.br/checkout/cart/add?');
    expect(result.cartUrl).toContain('sku=111151');
    expect(result.cartUrl).toContain('qty=2');
    expect(result.missingItems).toEqual([]);
  });

  it('resolves the Shopify variant instead of using a barcode as cart id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      variants: [{ id: 48_766_781_227_265, sku: '7801234567890', available: true }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const result = await prepareDirectCartHandoff('Irurzun', [{
      id: 'fideos-1',
      name: 'Fideos Sopa Misol',
      requestedTerm: 'fideos',
      quantity: 3,
      sku: '7801234567890',
      productUrl: 'https://irurzun.cl/products/fideos-sopa-carne-misol-12x65g',
    }]);

    expect(result.cartUrl).toBe('https://irurzun.cl/cart/48766781227265:3');
    expect(result.plannedCount).toBe(1);
  });

  it('reports stores without an official direct checkout link', async () => {
    const result = await prepareDirectCartHandoff('Tottus', [{
      id: 'item-1',
      name: 'Arroz',
      requestedTerm: 'arroz',
      quantity: 1,
    }]);

    expect(result).toMatchObject({ supported: false, mode: 'unavailable', store: 'Tottus' });
  });
});
