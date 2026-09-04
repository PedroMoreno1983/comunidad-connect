import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareRemoteCartHandoff } from '@/lib/supermarketRemoteCart';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('remote supermarket cart handoff', () => {
  it('creates an authenticated remote session and returns its short-lived viewer', async () => {
    vi.stubEnv('SUPERMARKET_CART_WORKER_URL', 'https://worker.example/cart');
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
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
      expect(url).toBe('https://worker.example/cart/v1/sessions');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer user-jwt');
      const body = JSON.parse(String(init?.body)) as { directCartUrl?: string };
      expect(body.directCartUrl).toContain('/checkout/cart/add?');
      return new Response(JSON.stringify({
        sessionId: 'session-1',
        viewerUrl: 'https://worker.example/cart/session/session-1?token=short-lived',
        expiresAt: '2026-09-02T20:00:00.000Z',
        plannedCount: 1,
        missingItems: [],
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
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
      mode: 'remote_browser',
      sessionId: 'session-1',
      plannedCount: 1,
      missingItems: [],
    });
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

  it('reports the remote service failure for a store without a direct route', async () => {
    vi.stubEnv('SUPERMARKET_CART_WORKER_URL', 'https://worker.example/cart');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'Los tres navegadores están ocupados. Intenta nuevamente en unos minutos.',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } })));

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
      reason: 'Los tres navegadores están ocupados. Intenta nuevamente en unos minutos.',
    });
  });
});
