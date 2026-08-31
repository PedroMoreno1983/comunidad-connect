import 'server-only';

const PRODUCT_TIMEOUT_MS = 8_000;
const LOOKUP_CONCURRENCY = 6;

interface ShopifyVariant {
  id: number | string;
  sku?: string;
  barcode?: string;
  available?: boolean;
}

interface ShopifyProductPayload {
  variants?: ShopifyVariant[];
}

function asString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function productHandle(productUrl: string | undefined): string | null {
  if (!productUrl) return null;
  try {
    const path = new URL(productUrl).pathname.replace(/\/+$/, '');
    const match = path.match(/\/products\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Shopify necesita el variant id numérico. El catálogo a menudo guarda el
 * código de barras (EAN 780…) o el sku público; ambos se cruzan contra
 * `/products/{handle}.js`.
 */
function pickVariantId(product: ShopifyProductPayload, sku: string): string | null {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length === 0) return null;
  const wanted = sku.trim();
  const exact = variants.find(variant => (
    asString(variant.id) === wanted
    || asString(variant.sku) === wanted
    || asString(variant.barcode) === wanted
  ));
  const chosen = exact ?? variants.find(variant => variant.available !== false) ?? variants[0];
  const id = asString(chosen?.id);
  return id || null;
}

async function fetchProduct(handle: string): Promise<ShopifyProductPayload | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRODUCT_TIMEOUT_MS);
  try {
    const response = await fetch(`https://irurzun.cl/products/${encodeURIComponent(handle)}.js`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'es-CL,es;q=0.9',
      },
    });
    if (!response.ok) return null;
    const payload = await response.json() as unknown;
    return payload !== null && typeof payload === 'object' ? payload as ShopifyProductPayload : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveIrurzunVariantId(item: {
  sku?: string;
  productUrl?: string;
}): Promise<string | null> {
  const sku = asString(item.sku);
  const handle = productHandle(item.productUrl);
  if (handle) {
    const product = await fetchProduct(handle);
    if (product) return pickVariantId(product, sku);
  }
  // Variant id de Shopify: entero largo. Un EAN chileno (13 dígitos, 780…) no sirve.
  if (/^\d{13,16}$/.test(sku) && !sku.startsWith('780')) return sku;
  return null;
}

export async function resolveIrurzunCartItems(
  items: Array<{ sku?: string; productUrl?: string; quantity: number; name: string }>,
): Promise<Array<{ sku: string; quantity: number; name: string } | { missing: string }>> {
  const results: Array<{ sku: string; quantity: number; name: string } | { missing: string }> = [];
  for (let index = 0; index < items.length; index += LOOKUP_CONCURRENCY) {
    const chunk = items.slice(index, index + LOOKUP_CONCURRENCY);
    results.push(...await Promise.all(chunk.map(async item => {
      const variantId = await resolveIrurzunVariantId(item);
      return variantId
        ? { sku: variantId, quantity: item.quantity, name: item.name }
        : { missing: item.name };
    })));
  }
  return results;
}
