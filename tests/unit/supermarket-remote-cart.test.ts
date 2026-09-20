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

  it('uses the verified remote browser for Lider instead of an unverified app link', async () => {
    vi.stubEnv('SUPERMARKET_CART_WORKER_URL', 'https://worker.example/cart');
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://worker.example/cart/v1/sessions');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer user-jwt');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        store: 'Lider',
        items: [{ productUrl: 'https://super.lider.cl/ip/leche/123' }],
      });
      return new Response(JSON.stringify({
        sessionId: 'lider-session',
        viewerUrl: 'https://worker.example/cart/session/lider-session',
        expiresAt: '2026-09-20T23:59:00.000Z',
        plannedCount: 1,
        missingItems: [],
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await prepareRemoteCartHandoff('Lider', [{
      id: 'leche',
      name: 'Leche 1 L',
      requestedTerm: 'leche',
      quantity: 1,
      sku: '00780292000009',
      offerId: '5105',
      salesUnit: 'EACH',
      productUrl: 'https://super.lider.cl/ip/leche/123',
    }], 'user-jwt');

    expect(result).toMatchObject({
      supported: true,
      mode: 'remote_browser',
      plannedCount: 1,
      missingItems: [],
      sessionId: 'lider-session',
      sessionUrl: 'https://worker.example/cart/session/lider-session',
    });
    expect(result.cartUrl).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports the worker failure instead of restoring the broken Lider QR', async () => {
    vi.stubEnv('SUPERMARKET_CART_WORKER_URL', 'https://worker.example/cart');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: 'El navegador seguro no está disponible en este momento.',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await prepareRemoteCartHandoff('Lider', [{
      id: 'leche',
      name: 'Leche 1 L',
      requestedTerm: 'leche',
      quantity: 1,
      sku: '00780292000009',
      productUrl: 'https://super.lider.cl/ip/leche/123',
    }], 'user-jwt');

    expect(result).toMatchObject({
      supported: false,
      mode: 'unavailable',
      plannedCount: 0,
      reason: 'El navegador seguro no está disponible en este momento.',
    });
    expect(result.cartUrl).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
