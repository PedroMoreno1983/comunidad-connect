/**
 * Enlaces que cargan productos en la sesión del navegador de la tienda.
 *
 * El detalle importante es el dominio: los storefronts públicos de Santa
 * Isabel y Unimarc no exponen `/checkout/cart/add`; el checkout real vive en
 * el host de la cuenta VTEX. Al navegar directamente a ese host, VTEX crea o
 * reutiliza la cookie `checkout.vtex.com`, agrega los SKU y redirige a
 * `/checkout/#/cart`.
 *
 * Probado el 2026-07-31 contra los hosts reales y carros identificables:
 *   Santa Isabel -> 2 SKU, cantidades 1 y 2, quedaron en el mismo orderForm.
 *   Unimarc      -> 2 SKU, cantidades 1 y 2, quedaron en el mismo orderForm.
 *   Jumbo        -> la ruta de sesión funciona; la tienda rechazó los SKU de
 *                   prueba como no disponibles, por lo que la UI nunca afirma
 *                   que un producto quedó cargado sin revisión del comprador.
 *
 * Nunca se entrega un orderForm creado por el servidor mediante
 * una URL de checkout con `orderFormId`: ese ID no transfiere la cookie ni la
 * propiedad del carro a otra sesión del navegador y puede abrir un 404 o un
 * carro distinto.
 */

export interface CartUrlItem {
    sku: string;
    quantity: number;
}

export type DirectCartConfidence = 'verified' | 'attempt';

/**
 * La ruta de alta y su redirección al checkout fueron verificadas. "verified"
 * describe el mecanismo, no cada producto: la tienda puede rechazar stock y la
 * persona siempre debe revisar el carro antes de continuar.
 */
const VERIFIED_DIRECT_CART_STORES: Record<string, string> = {
    Jumbo: 'https://jumbo.vtexcommercestable.com.br',
    'Santa Isabel': 'https://santaisabel.vtexcommercestable.com.br',
    Unimarc: 'https://unimarc.vtexcommercestable.com.br',
};

/**
 * Lider conserva un enlace de intento: su WAF impide comprobar el resultado
 * desde Convive. El callback de login mantiene los parámetros, pero la UI lo
 * presenta expresamente como pendiente de revisión.
 */
const ATTEMPT_DIRECT_CART_STORES: Record<string, string> = {
    Lider: 'https://www.lider.cl',
};

const DIRECT_CART_STORES: Record<string, string> = {
    ...VERIFIED_DIRECT_CART_STORES,
    ...ATTEMPT_DIRECT_CART_STORES,
};

/** Tope de productos por enlace: una URL enorme se corta en algunos navegadores. */
export const MAX_ITEMS_PER_URL = 50;

/** 'verified' | 'attempt' | null. La UI nunca confunde esto con stock confirmado. */
export function directCartConfidence(store: string): DirectCartConfidence | null {
    if (Object.prototype.hasOwnProperty.call(VERIFIED_DIRECT_CART_STORES, store)) return 'verified';
    if (Object.prototype.hasOwnProperty.call(ATTEMPT_DIRECT_CART_STORES, store)) return 'attempt';
    return null;
}

export function storeSupportsDirectCart(store: string): boolean {
    return directCartConfidence(store) !== null;
}

export type StoreLoadability = 'direct' | 'attempt' | 'manual';

/**
 * Cargabilidad del carro por tienda, para ordenar alternativas con precios
 * parecidos. "direct" significa que existe un cargador de sesión; no significa
 * que todos los SKU tengan stock.
 */
export function storeLoadability(store: string): StoreLoadability {
    const confidence = directCartConfidence(store);
    if (confidence === 'verified') return 'direct';
    if (confidence === 'attempt') return 'attempt';
    return 'manual';
}

/** Menor = mejor de cargar. Para desempatar el orden a precios parecidos. */
export function loadabilityRank(store: string): number {
    const tier = storeLoadability(store);
    return tier === 'direct' ? 0 : tier === 'attempt' ? 1 : 2;
}

export function supportedDirectCartStores(): string[] {
    return Object.keys(DIRECT_CART_STORES);
}

/**
 * Arma el enlace que carga el carro dentro de la sesión de la tienda.
 * Devuelve null cuando la cadena no lo soporta o ningún producto trae SKU.
 */
export function buildDirectCartUrl(store: string, items: CartUrlItem[]): string | null {
    const base = DIRECT_CART_STORES[store];
    if (!base) return null;

    const usable = items
        .filter(item => item.sku && item.sku.trim())
        .slice(0, MAX_ITEMS_PER_URL)
        .map(item => ({
            sku: item.sku.trim(),
            quantity: Math.min(99, Math.max(1, Math.round(item.quantity) || 1)),
        }));
    if (usable.length === 0) return null;

    // VTEX lee los parámetros repetidos en paralelo: el n-ésimo sku va con la
    // n-ésima qty. Por eso se emiten agrupados por tipo y no intercalados.
    const params = new URLSearchParams();
    usable.forEach(item => params.append('sku', item.sku));
    usable.forEach(item => params.append('qty', String(item.quantity)));
    usable.forEach(() => params.append('seller', '1'));
    params.append('sc', '1');
    // Sin esta redirección, el endpoint responde vacío y la persona no llega al carro.
    params.append('redirect', 'true');

    return `${base}/checkout/cart/add?${params.toString()}`;
}

/** Cuántos productos quedan fuera por no tener SKU o por el tope de la URL. */
export function countUnsupportedItems(items: CartUrlItem[]): number {
    const withSku = items.filter(item => item.sku && item.sku.trim()).length;
    const dropped = items.length - withSku;
    const overflow = Math.max(0, withSku - MAX_ITEMS_PER_URL);
    return dropped + overflow;
}
