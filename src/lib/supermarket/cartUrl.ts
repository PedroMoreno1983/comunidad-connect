/**
 * Enlaces que cargan el carro en la sesión del navegador de la tienda.
 *
 * Verificado el 2026-08-31 contra los hosts reales:
 *   Jumbo / Santa Isabel / Unimarc
 *     GET {cuenta}.vtexcommercestable.com.br/checkout/cart/add?sku&qty&seller&sc=1
 *     responde 302 a /checkout/#/cart y el orderForm queda con esos SKU.
 *     Los storefronts de marca (jumbo.cl, santaisabel.cl, unimarc.cl) ya no
 *     exponen esta ruta: hay que abrir el host de la cuenta VTEX.
 *   Irurzun
 *     GET irurzun.cl/cart/{variantId}:{qty},{variantId}:{qty} crea el carro
 *     Shopify y redirige al checkout. El `sku` del catálogo a veces es el
 *     código de barras: hay que resolver el variant id antes de armar el enlace.
 *
 * Lider, Tottus y aCuenta no publican un alta por URL que podamos comprobar.
 * Un orderForm creado en el servidor no transfiere la cookie `checkout.vtex.com`
 * al navegador de la persona: por eso el handoff es siempre una navegación
 * del comprador, nunca un POST nuestro.
 */

export interface CartUrlItem {
  sku: string;
  quantity: number;
}

export type DirectCartConfidence = 'verified';
export type StoreLoadability = 'direct' | 'manual';

const VTEX_ACCOUNT_HOSTS: Record<string, string> = {
  Jumbo: 'https://jumbo.vtexcommercestable.com.br',
  'Santa Isabel': 'https://santaisabel.vtexcommercestable.com.br',
  Unimarc: 'https://unimarc.vtexcommercestable.com.br',
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
  return store in VTEX_ACCOUNT_HOSTS || store in SHOPIFY_CART_HOSTS;
}

export function storeSupportsVtexCart(store: string): boolean {
  return store in VTEX_ACCOUNT_HOSTS;
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
  return [...Object.keys(VTEX_ACCOUNT_HOSTS), ...Object.keys(SHOPIFY_CART_HOSTS)];
}

function usableItems(items: CartUrlItem[]): CartUrlItem[] {
  return items
    .filter(item => item.sku && item.sku.trim())
    .slice(0, MAX_ITEMS_PER_URL)
    .map(item => ({
      sku: item.sku.trim(),
      quantity: Math.min(99, Math.max(1, Math.round(item.quantity) || 1)),
    }));
}

function buildVtexCartUrl(base: string, items: CartUrlItem[]): string {
  // VTEX lee los parámetros repetidos en paralelo: el n-ésimo sku va con la
  // n-ésima qty. Por eso se emiten agrupados por tipo y no intercalados.
  const params = new URLSearchParams();
  items.forEach(item => params.append('sku', item.sku));
  items.forEach(item => params.append('qty', String(item.quantity)));
  items.forEach(() => params.append('seller', '1'));
  params.append('sc', '1');
  params.append('redirect', 'true');
  return `${base}/checkout/cart/add?${params.toString()}`;
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

  const vtexHost = VTEX_ACCOUNT_HOSTS[store];
  if (vtexHost) return buildVtexCartUrl(vtexHost, usable);

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
