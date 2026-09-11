import type {
  LiderShoppableCartPayload,
  LiderShoppableCartProduct,
  SupermarketCartHandoff,
  SupermarketCartHandoffItem,
} from '@/lib/types';

export const LIDER_APP_CART_URL = 'https://super.lider.cl/cart';
export const LIDER_QR_URL_LENGTH = 1_800;

const LIDER_APP_URL_LENGTH = 7_500;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function asciiBase64(value: string): string {
  let output = '';
  for (let index = 0; index < value.length; index += 3) {
    const first = value.charCodeAt(index);
    const hasSecond = index + 1 < value.length;
    const hasThird = index + 2 < value.length;
    const second = hasSecond ? value.charCodeAt(index + 1) : 0;
    const third = hasThird ? value.charCodeAt(index + 2) : 0;
    const group = (first << 16) | (second << 8) | third;
    output += BASE64_ALPHABET[(group >> 18) & 63];
    output += BASE64_ALPHABET[(group >> 12) & 63];
    output += hasSecond ? BASE64_ALPHABET[(group >> 6) & 63] : '=';
    output += hasThird ? BASE64_ALPHABET[group & 63] : '=';
  }
  return output;
}

function cleanIdentifier(value: string | undefined, maxLength: number): string | null {
  const cleaned = value?.trim() ?? '';
  return cleaned && cleaned.length <= maxLength && /^[\x21-\x7e]+$/.test(cleaned)
    ? cleaned
    : null;
}

function cleanSalesUnit(value: string | undefined): string | null {
  const cleaned = value?.trim().toUpperCase() ?? '';
  return cleaned && cleaned.length <= 32 && /^[A-Z_]+$/.test(cleaned) ? cleaned : null;
}

function createRequestId(requestId?: string): string {
  const supplied = cleanIdentifier(requestId, 96);
  if (supplied) return supplied;
  const token = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `convive-${token}`;
}

function buildUrl(requestId: string, products: LiderShoppableCartProduct[]): string {
  const payload: LiderShoppableCartPayload = { rid: requestId, cd: products };
  const encoded = asciiBase64(JSON.stringify(payload));
  return `${LIDER_APP_CART_URL}?shoppableAdsCartValue=${encodeURIComponent(encoded)}`;
}

function qrSizedUrls(
  products: LiderShoppableCartProduct[],
  requestId: string,
): string[] | null {
  const urls: string[] = [];
  let current: LiderShoppableCartProduct[] = [];

  for (const product of products) {
    const stepRequestId = `${requestId}-${urls.length + 1}`;
    const candidate = buildUrl(stepRequestId, [...current, product]);
    if (candidate.length <= LIDER_QR_URL_LENGTH) {
      current.push(product);
      continue;
    }
    if (current.length === 0) return null;
    urls.push(buildUrl(stepRequestId, current));
    current = [product];
    if (buildUrl(`${requestId}-${urls.length + 1}`, current).length > LIDER_QR_URL_LENGTH) {
      return null;
    }
  }

  if (current.length > 0) {
    urls.push(buildUrl(`${requestId}-${urls.length + 1}`, current));
  }
  return urls;
}

/**
 * Construye el contrato que la app oficial de Lider llama
 * `shoppableAdsCartValue`. Nunca omite productos: si falta un identificador,
 * la entrega completa se marca como no disponible.
 */
export function prepareLiderAppCartHandoff(
  items: SupermarketCartHandoffItem[],
  requestId?: string,
): SupermarketCartHandoff {
  if (items.length === 0) {
    return {
      supported: false,
      store: 'Lider',
      mode: 'unavailable',
      plannedCount: 0,
      missingItems: [],
      reason: 'La canasta de Líder llegó vacía.',
    };
  }

  const missingItems: string[] = [];
  const products = items.flatMap(item => {
    const upc = cleanIdentifier(item.sku, 80);
    const offerId = cleanIdentifier(item.offerId, 160);
    if (!upc || !offerId) {
      missingItems.push(item.name);
      return [];
    }
    const quantity = Math.min(99, Math.max(1, Math.round(Number(item.quantity) || 1)));
    return [{
      upc,
      oid: offerId,
      q: String(quantity),
      qu: cleanSalesUnit(item.salesUnit),
    }];
  });

  if (missingItems.length > 0) {
    return {
      supported: false,
      store: 'Lider',
      mode: 'unavailable',
      plannedCount: 0,
      missingItems,
      reason: 'Líder necesita SKU y oferta para todos los productos. Actualiza la comparación antes de abrirla.',
    };
  }

  const rid = createRequestId(requestId);
  const cartUrls = qrSizedUrls(products, rid);
  if (!cartUrls) {
    return {
      supported: false,
      store: 'Lider',
      mode: 'unavailable',
      plannedCount: 0,
      missingItems: items.map(item => item.name),
      reason: 'La canasta no cabe completa en los enlaces oficiales de Líder.',
    };
  }

  const singleCartUrl = buildUrl(rid, products);
  return {
    supported: true,
    store: 'Lider',
    mode: 'official_app_link',
    cartUrl: singleCartUrl.length <= LIDER_APP_URL_LENGTH ? singleCartUrl : undefined,
    cartUrls,
    plannedCount: items.length,
    missingItems: [],
  };
}
