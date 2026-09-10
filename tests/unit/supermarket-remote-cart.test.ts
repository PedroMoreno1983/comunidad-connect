import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareRemoteCartHandoff } from '@/lib/supermarketRemoteCart';

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('remote supermarket cart handoff', () => {
  it('uses the direct retailer cart without creating a remote browser session', async () => {
    vi.stubEnv('SUPERMARKET_CART_WORKER_URL', 'https://worker.example/cart');
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('vtexcommercestable.com.br/api/catalog_system')) {
        return new Response(JSON.stringify([{
          productName: 'Arroz 1 kg',
          items: [{
            itemId: 'sku-1',
            nameComplete: 'Arroz 1 kg',
            sellers: [{
              sellerId: '1',
              commertialOffer: { AvailableQuantity: 10, Price: 1_500 },
            }],
          }],
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unexpected remote request: ${url}`);
    }));

    const result = await prepareRemoteCartHandoff('Jumbo', [{
      id: 'arroz',
      name: 'Arroz 1 kg',
      requestedTerm: 'arroz',
      quantity: 1,
      sku: 'sku-1',
      productUrl: 'https://www.jumbo.cl/arroz/p',
    }], 'user-jwt');

    expect(result).toMatchObject({
      supported: true,
      mode: 'direct_url',
      plannedCount: 1,
      missingItems: [],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.cartUrl).toContain('/checkout/cart/add?');
  });

  it('keeps the official direct checkout as an outage fallback', async () => {
    vi.stubEnv('SUPERMARKET_CART_WORKER_URL', 'https://worker.example/cart');
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('.js')) {
        return new Response(JSON.stringify({
          variants: [{ id: 1234, sku: '7800000000001', available: true }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error('worker offline');
    }));

    const result = await prepareRemoteCartHandoff('Irurzun', [{
      id: 'fideos',
      name: 'Fideos 400 g',
      requestedTerm: 'fideos',
      quantity: 2,
      sku: '7800000000001',
      productUrl: 'https://irurzun.cl/products/fideos-400g',
    }], 'user-jwt');

    expect(result).toMatchObject({ supported: true, mode: 'direct_url', plannedCount: 1 });
    expect(result.cartUrl).toBe('https://irurzun.cl/cart/1234:2');
  });

  it('does not claim a Lider handoff when the cart cannot cross browser sessions', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await prepareRemoteCartHandoff('Lider', [{
      id: 'leche',
      name: 'Leche 1 L',
      requestedTerm: 'leche',
      quantity: 1,
      productUrl: 'https://super.lider.cl/ip/leche/123',
    }], 'user-jwt');

    expect(result).toMatchObject({
      supported: false,
      mode: 'unavailable',
      plannedCount: 0,
      missingItems: ['Leche 1 L'],
      reason: 'Líder no permite transferir un carro verificable entre sesiones sin una integración oficial.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a remote worker failure for a store without a direct cart', async () => {
    vi.stubEnv('SUPERMARKET_CART_WORKER_URL', 'https://worker.example/cart');
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://worker.example/cart/v1/sessions');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer user-jwt');
      return new Response(JSON.stringify({
        error: 'Los navegadores están ocupados. Intenta nuevamente en unos minutos.',
      }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }));

    const result = await prepareRemoteCartHandoff('aCuenta', [{
      id: 'leche',
      name: 'Leche 1 L',
      requestedTerm: 'leche',
      quantity: 1,
      productUrl: 'https://www.acuenta.cl/product/leche',
    }], 'user-jwt');

    expect(result).toMatchObject({
      supported: false,
      mode: 'unavailable',
      reason: 'Los navegadores están ocupados. Intenta nuevamente en unos minutos.',
    });
  });
});
