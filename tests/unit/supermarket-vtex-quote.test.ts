import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { quoteVtexBasket } from '@/lib/supermarket/vtexQuote';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function papaProduct() {
  return [{
    productName: 'Papas Soufle Malla 2 kg',
    items: [{
      itemId: '15476',
      nameComplete: 'Papas Soufle Malla 2 kg',
      sellers: [{
        commertialOffer: {
          Price: 2790,
          ListPrice: 2790,
          AvailableQuantity: 40,
        },
      }],
    }],
  }];
}

describe('quoteVtexBasket', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces a stale catalog SKU and price with the retailer checkout values', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(papaProduct()))
      .mockResolvedValueOnce(jsonResponse({
        items: [{
          requestIndex: 0,
          id: '15476',
          quantity: 1,
          availability: 'available',
          sellingPrice: 279000,
          priceDefinition: { total: 279000 },
        }],
        messages: [],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const quote = await quoteVtexBasket('Santa Isabel', [{
      id: 'catalog-row',
      requestedTerm: 'papas',
      name: 'Papas Soufle Malla 2 kg',
      productUrl: 'https://www.santaisabel.cl/papas-soufle-jumbo-malla-2-kg/p',
      quantity: 1,
      catalogLineTotal: 2090,
    }]);

    expect(quote).toMatchObject({
      catalogSubtotal: 2090,
      subtotal: 2790,
      missingTerms: [],
    });
    expect(quote.items[0]).toMatchObject({
      requestedTerm: 'papas',
      name: 'Papas Soufle Malla 2 kg',
      sku: '15476',
      price: 2790,
      lineTotal: 2790,
    });
    expect(fetchMock.mock.calls[2]?.[0]).toContain('/api/checkout/pub/orderForms/simulation');
  });

  it('never accepts a different product returned for the stale SKU or URL', async () => {
    const wine = [{
      productName: 'Vino Santa Rita Cabernet Sauvignon 750 cc',
      items: [{
        itemId: '5874',
        nameComplete: 'Vino Santa Rita Cabernet Sauvignon 750 cc',
        sellers: [{
          commertialOffer: { Price: 8990, ListPrice: 12950, AvailableQuantity: 10 },
        }],
      }],
    }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(wine))
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const quote = await quoteVtexBasket('Santa Isabel', [{
      id: 'catalog-row',
      requestedTerm: 'papas',
      name: 'Papas Soufle Malla 2 kg',
      productUrl: 'https://www.santaisabel.cl/papas-soufle-jumbo-malla-2-kg/p',
      quantity: 1,
      catalogLineTotal: 2090,
    }]);

    expect(quote.items).toEqual([]);
    expect(quote.subtotal).toBe(0);
    expect(quote.missingTerms).toEqual(['papas']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.runIf(process.env.LIVE_VTEX_QUOTE === '1')(
    'validates the reported potato against the live Santa Isabel checkout',
    async () => {
      vi.unstubAllGlobals();
      const quote = await quoteVtexBasket('Santa Isabel', [
        {
          id: 'carne', requestedTerm: 'carne',
          name: 'Carne Molida Chilenaza Congelada 125 g',
          productUrl: 'https://www.santaisabel.cl/molida-chilenaza-cong-125-gr/p',
          quantity: 1, catalogLineTotal: 790,
        },
        {
          id: 'longaniza', requestedTerm: 'longanizas',
          name: 'Longaniza Angus La Preferida 500 g',
          productUrl: 'https://www.santaisabel.cl/longaniza-angus-la-preferida-500-g-4-unidades/p',
          quantity: 1, catalogLineTotal: 4990,
        },
        {
          id: 'cebolla', requestedTerm: 'cebollas', name: 'Cebolla Malla 1 kg',
          productUrl: 'https://www.santaisabel.cl/cebolla-feria-jumbo-malla-1-kg-8-unidad-aprox/p',
          quantity: 1, catalogLineTotal: 1790,
        },
        {
          id: 'papa', requestedTerm: 'papas', name: 'Papas Soufle Malla 2 kg',
          productUrl: 'https://www.santaisabel.cl/papas-soufle-jumbo-malla-2-kg/p',
          quantity: 1, catalogLineTotal: 2090,
        },
        {
          id: 'tomate', requestedTerm: 'tomates', name: 'Tomate Cherry Clamshell 500 g',
          productUrl: 'https://www.santaisabel.cl/tomate-cherry-clamshell-500-g-1261608/p',
          quantity: 1, catalogLineTotal: 3250,
        },
        {
          id: 'bebida', requestedTerm: 'bebidas', name: 'Bebida Lactea Yogu Yogu Chirimoya 200 ml',
          productUrl: 'https://www.santaisabel.cl/yoghurt-liquido-yogu-yogu-caja-200-cc-chirimoya/p',
          quantity: 1, catalogLineTotal: 630,
        },
      ]);

      expect(quote.missingTerms).toEqual([]);
      expect(quote.items).toHaveLength(6);
      const potato = quote.items.find(item => item.requestedTerm === 'papas');
      expect(potato?.sku).toBe('15476');
      expect(potato?.name.toLowerCase()).toContain('papa');
      expect(quote.items.every(item => !item.name.toLowerCase().includes('vino'))).toBe(true);
      expect(quote.subtotal).toBeGreaterThan(0);
    },
  );
});
