/**
 * Enlaces que cargan el carro en la sesión del navegador de la tienda.
 *
 * Verificado el 2026-08-31 contra los hosts reales:
 *   Jumbo
 *     El storefront Next.js (CartFromUrl) lee `?sku=111151,6699&qty=2,1`
 *     en jumbo.cl, llama a su BFF y abre el mini carro. No usar el host
 *     VTEX: `{cuenta}.vtexcommercestable.com.br/checkout/cart/add` deja
 *     los productos en otra cookie y jumbo.cl queda vacío.
 *   Irurzun
 *     GET irurzun.cl/cart/{variantId}:{qty} crea el carro Shopify.
 *     El `sku` del catálogo a veces es el EAN: hay que resolver el
 *     variant id antes de armar el enlace.
 *
 * Santa Isabel, Unimarc, Lider, Tottus y aCuenta no publican un alta por
 * URL que deje el carro en el sitio donde la persona compra.
 */

export interface CartUrlItem {
  sku: string;
  quantity: number;
  seller?: string;
}

export type DirectCartConfidence = 'verified';
export type StoreLoadability = 'direct' | 'manual';

const STOREFRONT_QUERY_CART_HOSTS: Record<string, string> = {
  Jumbo: 'https://www.jumbo.cl',
};

const SHOPIFY_CART_HOSTS: Record<string, string> = {
  Irurzun: 'https://irurzun.cl',
};

/** Tope de productos por enlace: una URL enorme se corta en algunos navegadores. */
export const MAX_ITEMS_PER_URL = 50;

export function directCartConfidence(store: string): DirectCartConfidence | null {
  return storeSupportsDirectCart(store) ? 'verified' : null;
}

export function storeSupportsDirectCart(store: string): boolean {
  return store in STOREFRONT_QUERY_CART_HOSTS || store in SHOPIFY_CART_HOSTS;
}

export function storeSupportsStorefrontQueryCart(store: string): boolean {
  return store in STOREFRONT_QUERY_CART_HOSTS;
}

export function storeSupportsVtexCart(store: string): boolean {
  // Jumbo sigue resolviendo SKU contra VTEX, pero el alta va al storefront.
  return storeSupportsStorefrontQueryCart(store);
}

export function storeSupportsShopifyCart(store: string): boolean {
  return store in SHOPIFY_CART_HOSTS;
}

export function storeLoadability(store: string): StoreLoadability {
  return storeSupportsDirectCart(store) ? 'direct' : 'manual';
}

/** Menor = mejor de cargar. Para desempatar el orden a precios parecidos. */
export function loadabilityRank(store: string): number {
  return storeLoadability(store) === 'direct' ? 0 : 1;
}

export function supportedDirectCartStores(): string[] {
  return [...Object.keys(STOREFRONT_QUERY_CART_HOSTS), ...Object.keys(SHOPIFY_CART_HOSTS)];
}

function usableItems(items: CartUrlItem[]): CartUrlItem[] {
  return items
    .filter(item => item.sku && item.sku.trim())
    .slice(0, MAX_ITEMS_PER_URL)
    .map(item => ({
      sku: item.sku.trim(),
      quantity: Math.min(99, Math.max(1, Math.round(item.quantity) || 1)),
      seller: item.seller?.trim() || undefined,
    }));
}

function buildStorefrontQueryCartUrl(base: string, items: CartUrlItem[]): string {
  // CartFromUrl en jumbo.cl hace sku.split(',') y qty.split(',').
  const params = new URLSearchParams();
  params.set('sku', items.map(item => item.sku).join(','));
  params.set('qty', items.map(item => String(item.quantity)).join(','));
  return `${base}/?${params.toString()}`;
}

function buildShopifyCartUrl(base: string, items: CartUrlItem[]): string {
  const permalink = items.map(item => `${encodeURIComponent(item.sku)}:${item.quantity}`).join(',');
  return `${base}/cart/${permalink}`;
}

/**
 * Arma el enlace que carga el carro dentro de la sesión de la tienda.
 * Devuelve null cuando la cadena no lo soporta o ningún producto trae SKU.
 */
export function buildDirectCartUrl(store: string, items: CartUrlItem[]): string | null {
  const usable = usableItems(items);
  if (usable.length === 0) return null;

  const storefrontHost = STOREFRONT_QUERY_CART_HOSTS[store];
  if (storefrontHost) return buildStorefrontQueryCartUrl(storefrontHost, usable);

  const shopifyHost = SHOPIFY_CART_HOSTS[store];
  if (shopifyHost) return buildShopifyCartUrl(shopifyHost, usable);

  return null;
}

/** Cuántos productos quedan fuera por no tener SKU o por el tope de la URL. */
export function countUnsupportedItems(items: CartUrlItem[]): number {
  const withSku = items.filter(item => item.sku && item.sku.trim()).length;
  const dropped = items.length - withSku;
  const overflow = Math.max(0, withSku - MAX_ITEMS_PER_URL);
  return dropped + overflow;
}
