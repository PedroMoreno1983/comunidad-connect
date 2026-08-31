/**
 * Enlaces que cargan el carro en la sesión del navegador de la tienda.
 *
 * Verificado el 2026-08-31 contra los hosts reales:
 *   Jumbo
 *     El storefront Next.js (CartFromUrl) lee `?sku=111151,6699&qty=2,1`
 *     en jumbo.cl, llama a su BFF y abre el mini carro. No usar el host
 *     VTEX: `{cuenta}.vtexcommercestable.com.br/checkout/cart/add` deja
 *     los productos en otra cookie y jumbo.cl queda vacío.
 *   Santa Isabel
 *     El storefront (`cl-sisa-web-front`) lee `?sku=&quantity=` en la home
 *     (`addProductsByUrl`). El parámetro de cantidad es `quantity`, no el
 *     `qty` de Jumbo. Resuelve cada SKU contra el PLP Cencosud
 *     (`fullText: "sku:3294"`) y hace PATCH al BFF `/cart/items`.
 *     No enviar `action=clean`: en el bundle vivo eso solo vacía el carro
 *     y no vuelve a agregar. Si `localStorage.seller` está vacío (primera
 *     visita), el PLP busca con `store:null` y no encuentra productos; con
 *     tienda ya elegida el mini carro sí se abre (probado con sku 3294 × 2).
 *   Irurzun
 *     GET irurzun.cl/cart/{variantId}:{qty} crea el carro Shopify.
 *     El `sku` del catálogo a veces es el EAN: hay que resolver el
 *     variant id antes de armar el enlace.
 *
 * Unimarc, Lider, Tottus y aCuenta no publican un alta por URL que deje
 * el carro en el sitio donde la persona compra. Unimarc consume una cookie
 * `addToCart` en `.unimarc.cl`; Lider muta Orchestra en `super.lider.cl`;
 * Tottus y aCuenta guardan el cartId en storage de su origen. Nada de eso
 * se puede fijar desde conviveconnect.com, y el host VTEX/myvtex deja un
 * carro fantasma.
 */

export interface CartUrlItem {
  sku: string;
  quantity: number;
  seller?: string;
}

export type DirectCartConfidence = 'verified';
export type StoreLoadability = 'direct' | 'manual';

interface StorefrontQueryCartConfig {
  base: string;
  /** Jumbo lee `qty`; Santa Isabel lee `quantity`. */
  quantityParam: 'qty' | 'quantity';
}

const STOREFRONT_QUERY_CART: Record<string, StorefrontQueryCartConfig> = {
  Jumbo: {
    base: 'https://www.jumbo.cl',
    quantityParam: 'qty',
  },
  'Santa Isabel': {
    base: 'https://www.santaisabel.cl',
    quantityParam: 'quantity',
  },
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
  return store in STOREFRONT_QUERY_CART || store in SHOPIFY_CART_HOSTS;
}

export function storeSupportsStorefrontQueryCart(store: string): boolean {
  return store in STOREFRONT_QUERY_CART;
}

export function storeSupportsVtexCart(store: string): boolean {
  // Solo Jumbo cotiza contra VTEX y luego abre jumbo.cl. Santa Isabel usa el
  // skuId del catálogo Cencosud; el orderForm VTEX no es el carro del shopper.
  return store === 'Jumbo';
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
  return [...Object.keys(STOREFRONT_QUERY_CART), ...Object.keys(SHOPIFY_CART_HOSTS)];
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

function buildStorefrontQueryCartUrl(config: StorefrontQueryCartConfig, items: CartUrlItem[]): string {
  const params = new URLSearchParams();
  params.set('sku', items.map(item => item.sku).join(','));
  params.set(config.quantityParam, items.map(item => String(item.quantity)).join(','));
  return `${config.base}/?${params.toString()}`;
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

  const storefront = STOREFRONT_QUERY_CART[store];
  if (storefront) return buildStorefrontQueryCartUrl(storefront, usable);

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
