/**
 * Enlaces que cargan productos en la sesión del navegador de la tienda.
 *
 * El detalle importante es el dominio: los storefronts públicos de Santa
 * Isabel y Unimarc no exponen `/checkout/cart/add`; el checkout real vive en
 * el host de la cuenta VTEX. Al navegar directamente a ese host, VTEX crea o
 * reutiliza la cookie `checkout.vtex.com` y agrega los SKU. Unimarc no soporta
 * la redireccion VTEX estandar a `/checkout/#/cart`: su storefront antiguo la
 * convierte en una busqueda de "carrito", por eso la UI completa el handoff
 * hacia su portada despues de cargar los productos.
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
 *
 * Jumbo va por su dominio público y NO por el host de cuenta. Verificado el
 * 2026-08-01 mirando dónde queda la cookie del carro:
 *   jumbo.vtexcommercestable.com.br -> 302 y
 *       Set-Cookie checkout.vtex.com ... domain=jumbo.vtexcommercestable.com.br
 *   www.jumbo.cl                    -> 307 a /?openLogin=1&callback=/checkout/cart/add?…
 * El host de cuenta deja el carro en un dominio donde la persona no tiene
 * sesión ni reconoce la marca; el dominio público le pide iniciar sesión y
 * recién ahí ejecuta el alta, dentro de su propia sesión. Santa Isabel (404) y
 * Unimarc (403) no exponen esa ruta en su dominio público, así que siguen por
 * el host de cuenta -- con la limitación descrita arriba.
 */

export interface CartUrlItem {
    sku: string;
    quantity: number;
}

export type DirectCartConfidence = 'verified' | 'offsite' | 'attempt';

/**
 * El carro se arma en el MISMO dominio donde la persona compra y tiene sesión.
 * "verified" describe el mecanismo, no cada producto: la tienda puede rechazar
 * stock y la persona siempre debe revisar el carro antes de continuar.
 */
const VERIFIED_DIRECT_CART_STORES: Record<string, string> = {
    // Dominio público: la cookie del carro queda en jumbo.cl, que es donde la
    // persona tiene su sesión. Ver la nota de cookies en la cabecera.
    Jumbo: 'https://www.jumbo.cl',
};

/**
 * El alta funciona, pero ocurre en el host de cuenta VTEX y no en el dominio de
 * la tienda: la cookie del carro queda en *.vtexcommercestable.com.br, un
 * dominio donde la persona no inició sesión y que no reconoce como la marca.
 * Su carro en santaisabel.cl / unimarc.cl sigue vacío.
 *
 * No es "verified": llamarlo así prometía que el carro aparecía donde la
 * persona iba a pagar, y no es lo que pasa. Tampoco es "manual", porque los
 * productos sí se cargan. Es su propio nivel, y la UI lo dice.
 */
const OFFSITE_DIRECT_CART_STORES: Record<string, string> = {
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
    ...OFFSITE_DIRECT_CART_STORES,
    ...ATTEMPT_DIRECT_CART_STORES,
};

/** Tope de productos por enlace: una URL enorme se corta en algunos navegadores. */
export const MAX_ITEMS_PER_URL = 50;

/** 'verified' | 'offsite' | 'attempt' | null. Nunca significa stock confirmado. */
export function directCartConfidence(store: string): DirectCartConfidence | null {
    if (Object.prototype.hasOwnProperty.call(VERIFIED_DIRECT_CART_STORES, store)) return 'verified';
    if (Object.prototype.hasOwnProperty.call(OFFSITE_DIRECT_CART_STORES, store)) return 'offsite';
    if (Object.prototype.hasOwnProperty.call(ATTEMPT_DIRECT_CART_STORES, store)) return 'attempt';
    return null;
}

export function storeSupportsDirectCart(store: string): boolean {
    return directCartConfidence(store) !== null;
}

export type StoreLoadability = 'direct' | 'offsite' | 'attempt' | 'manual';

/**
 * Cargabilidad del carro por tienda. Ninguno de estos niveles significa que
 * todos los SKU tengan stock: eso solo lo confirma la tienda al cargar.
 *   direct  -> se carga en el dominio donde la persona compra (Jumbo)
 *   offsite -> se carga, pero en el host de cuenta VTEX (Santa Isabel, Unimarc)
 *   attempt -> no podemos comprobar el resultado (Lider)
 *   manual  -> hay que agregar los productos a mano (aCuenta, Tottus)
 */
export function storeLoadability(store: string): StoreLoadability {
    const confidence = directCartConfidence(store);
    if (confidence === 'verified') return 'direct';
    if (confidence === 'offsite') return 'offsite';
    if (confidence === 'attempt') return 'attempt';
    return 'manual';
}

/** Menor = mejor de cargar. Ordena las alternativas de la comparación. */
export function loadabilityRank(store: string): number {
    const tier = storeLoadability(store);
    if (tier === 'direct') return 0;
    if (tier === 'offsite') return 1;
    if (tier === 'attempt') return 2;
    return 3;
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
    // Unimarc convierte /checkout/#/cart en una busqueda vacia. La UI abre este
    // endpoint sin redireccion y, una vez cargados los SKU, lleva la misma
    // pestana a la portada donde el contador del carro queda visible.
    params.append('redirect', store === 'Unimarc' ? 'false' : 'true');

    return `${base}/checkout/cart/add?${params.toString()}`;
}

/** Cuántos productos quedan fuera por no tener SKU o por el tope de la URL. */
export function countUnsupportedItems(items: CartUrlItem[]): number {
    const withSku = items.filter(item => item.sku && item.sku.trim()).length;
    const dropped = items.length - withSku;
    const overflow = Math.max(0, withSku - MAX_ITEMS_PER_URL);
    return dropped + overflow;
}
