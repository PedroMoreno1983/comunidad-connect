/**
 * Enlaces que dejan el carro cargado en la tienda, sin instalar nada.
 *
 * VTEX (la plataforma de varias cadenas chilenas) expone
 * `/checkout/cart/add?sku=…&qty=…&seller=…`, que agrega productos al carro con
 * un GET. Si la persona no tiene sesión, la tienda la manda a iniciarla y
 * conserva la orden en su `callback`: al entrar, el carro ya quedó armado.
 *
 * Verificado contra los sitios reales el 2026-07-29:
 *   Jumbo  -> 307 con callback que preserva los 3 SKU de la prueba
 *   Lider  -> 307
 *   Santa Isabel, aCuenta -> 404 (no exponen la ruta)
 *   Unimarc (403) y Tottus (526) bloquearon la comprobación desde servidor,
 *   así que se tratan como no soportadas hasta poder verificarlas en un
 *   navegador real.
 *
 * Para las cadenas sin soporte queda el camino anterior (el cargador), que sí
 * pide un gesto extra. No se inventa un enlace que no funciona: prometer un
 * carro cargado y que llegue vacío es peor que decir la verdad.
 */

export interface CartUrlItem {
    sku: string;
    quantity: number;
}

/** Cadenas donde el enlace directo está verificado. */
const DIRECT_CART_STORES: Record<string, string> = {
    Jumbo: 'https://www.jumbo.cl',
    Lider: 'https://www.lider.cl',
};

/** Tope de productos por enlace: una URL enorme se corta en algunos navegadores. */
const MAX_ITEMS_PER_URL = 50;

export function storeSupportsDirectCart(store: string): boolean {
    return Object.prototype.hasOwnProperty.call(DIRECT_CART_STORES, store);
}

export function supportedDirectCartStores(): string[] {
    return Object.keys(DIRECT_CART_STORES);
}

/**
 * Arma el enlace que carga el carro. Devuelve null cuando la cadena no lo
 * soporta o cuando ningún producto trae SKU, para que el caller ofrezca el
 * camino alternativo en vez de un enlace roto.
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
    // sc=1 es el canal de venta por defecto; sin él algunas tiendas ignoran el add.
    params.append('sc', '1');

    return `${base}/checkout/cart/add?${params.toString()}`;
}

/** Cuántos productos quedarían fuera del enlace por no tener SKU o por el tope. */
export function countUnsupportedItems(items: CartUrlItem[]): number {
    const withSku = items.filter(item => item.sku && item.sku.trim()).length;
    const dropped = items.length - withSku;
    const overflow = Math.max(0, withSku - MAX_ITEMS_PER_URL);
    return dropped + overflow;
}
