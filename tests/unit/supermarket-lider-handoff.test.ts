import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import {
  LIDER_QR_URL_LENGTH,
  prepareLiderAppCartHandoff,
} from '@/lib/supermarketLiderHandoff';
import type { LiderShoppableCartPayload, SupermarketCartHandoffItem } from '@/lib/types';

function decodeCartUrl(url: string): LiderShoppableCartPayload {
  const encoded = new URL(url).searchParams.get('shoppableAdsCartValue');
  if (!encoded) throw new Error('Missing shoppableAdsCartValue');
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as LiderShoppableCartPayload;
}

function liderItem(index: number): SupermarketCartHandoffItem {
  return {
    id: `item-${index}`,
    name: `Producto ${index}`,
    requestedTerm: `producto ${index}`,
    quantity: index % 3 + 1,
    sku: String(7_802_920_000_000 + index).padStart(14, '0'),
    offerId: String(510_000 + index),
    salesUnit: 'EACH',
  };
}

describe('official Lider app handoff', () => {
  it('encodes the exact shoppable cart contract and preserves leading zeroes', () => {
    const result = prepareLiderAppCartHandoff([{
      id: 'leche',
      name: 'Leche Semidescremada Natural Caja 1 l',
      requestedTerm: 'leche',
      quantity: 2,
      sku: '00780292000009',
      offerId: '5105',
      salesUnit: 'each',
    }], 'convive-qa');

    expect(result).toMatchObject({
      supported: true,
      mode: 'official_app_link',
      plannedCount: 1,
      missingItems: [],
    });
    expect(result.cartUrl).toBeDefined();
    expect(decodeCartUrl(result.cartUrl!)).toEqual({
      rid: 'convive-qa',
      cd: [{ upc: '00780292000009', oid: '5105', q: '2', qu: 'EACH' }],
    });
  });

  it('rejects the whole basket when one product lacks sku or offerId', () => {
    const complete = liderItem(1);
    const incomplete = { ...liderItem(2), offerId: undefined };
    const result = prepareLiderAppCartHandoff([complete, incomplete], 'convive-qa');

    expect(result).toMatchObject({
      supported: false,
      mode: 'unavailable',
      plannedCount: 0,
      missingItems: ['Producto 2'],
    });
    expect(result.cartUrl).toBeUndefined();
    expect(result.cartUrls).toBeUndefined();
  });

  it('splits a large QR transfer into scannable codes without omitting products', async () => {
    const items = Array.from({ length: 47 }, (_, index) => liderItem(index + 1));
    const result = prepareLiderAppCartHandoff(items, 'convive-47-products');

    expect(result.supported).toBe(true);
    expect(result.plannedCount).toBe(47);
    expect(result.cartUrls!.length).toBeGreaterThan(1);
    expect(result.cartUrls!.every(url => url.length <= LIDER_QR_URL_LENGTH)).toBe(true);

    const transferred = result.cartUrls!.flatMap(url => decodeCartUrl(url).cd);
    expect(transferred).toHaveLength(47);
    expect(transferred.map(product => product.upc)).toEqual(items.map(item => item.sku));
    const qrImages = await Promise.all(result.cartUrls!.map(url => QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
    })));
    expect(qrImages.every(image => image.startsWith('data:image/png;base64,'))).toBe(true);
  });
});
