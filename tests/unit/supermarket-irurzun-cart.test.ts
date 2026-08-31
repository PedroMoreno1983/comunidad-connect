import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { resolveIrurzunVariantId } from '@/lib/supermarket/irurzunCart';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('resolveIrurzunVariantId', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps a barcode stored as sku to the Shopify variant id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      variants: [
        { id: 48766781554945, sku: '7804676740276', barcode: '7804676740276', available: true },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveIrurzunVariantId({
      sku: '7804676740276',
      productUrl: 'https://irurzun.cl/products/atun-al-aceite-misol-140g',
    })).resolves.toBe('48766781554945');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/products/atun-al-aceite-misol-140g.js');
  });

  it('does not treat a Chilean EAN as a variant id when the product page is missing', async () => {
    await expect(resolveIrurzunVariantId({ sku: '7804676740276' })).resolves.toBeNull();
  });

  it('keeps an already-resolved Shopify variant id', async () => {
    await expect(resolveIrurzunVariantId({ sku: '48766781554945' })).resolves.toBe('48766781554945');
  });
});
