/**
 * Enlaces que dejan el carro cargado en la tienda, sin instalar nada.
 *
 * VTEX (la plataforma de varias cadenas chilenas) expone
 * `/checkout/cart/add?sku=…&qty=…&seller=…`, que agrega productos al carro con
 * un GET. Si la persona no tiene sesión, la tienda la manda a iniciarla y
 * conserva la orden en su `callback`: al entrar, el carro ya quedó armado.
 *
 * Verificado contra los sitios reales el 2026-07-29, trazando el redirect completo:
 *   Jumbo        -> 307 a /?openLogin=1&callback=/checkout/cart/add?... : el login
 *                   PRESERVA la orden de agregar. Funciona de verdad.
 *   Lider        -> 307 a /blocked?url=... : su WAF manda el request a una página
 *                   de bloqueo. NO es un login. Puede pasar para un navegador real
 *                   (con cookies/JS), pero desde servidor se bloquea: sin garantía.
 *   Unimarc      -> 403 hasta en la homepage: WAF bloquea todo lo automatizado.
 *                   VTEX como Jumbo, así que podría funcionar para un usuario real,
 *                   pero no se puede verificar: sin garantía.
 *   Santa Isabel -> homepage 200 pero /checkout/cart/add da 404: ruta deshabilitada.
 *                   Un navegador real también recibe 404. No sirve.
 *   aCuenta      -> 404 en la misma ruta. No sirve.
 *   Tottus       -> vive en tottus.falabella.com (plataforma Falabella, no VTEX).
 *
 * Por eso hay dos niveles: VERIFICADO (Jumbo) y "intentar" (Lider, Unimarc), este
 * último con aviso explícito de que puede fallar. Para las cadenas sin soporte
 * queda el cargador. No se promete un carro cargado que pueda llegar vacío.
 */

import { storeSupportsSharedCart } from './vtexSharedCart';

export interface CartUrlItem {
    sku: string;
    quantity: number;
}

export type DirectCartConfidence = 'verified' | 'attempt';

/** Jumbo: enlace directo verificado de punta a punta. */
const VERIFIED_DIRECT_CART_STORES: Record<string, string> = {
    Jumbo: 'https://www.jumbo.cl',
};

/**
 * Lider: solo enlace directo. Su WAF bloquea las llamadas desde servidor, pero
 * eso NO invalida el mecanismo: una navegación del navegador del usuario no
 * está sujeta al mismo bloqueo que un fetch desde Vercel. Por eso Convive arma
 * la URL y no intenta abrirla ni validarla antes: sería pedirle permiso a un
 * portero que solo nos rechaza a nosotros.
 *
 * La contrapartida es que después tampoco podemos leer el carro de Lider desde
 * nuestro dominio, así que el resultado se declara "pendiente de que lo
 * revises", no "verificado". Unimarc salió de acá: ahora arma el carro por la
 * Checkout API y la tienda confirma lo que quedó (ver vtexSharedCart.ts).
 */
const ATTEMPT_DIRECT_CART_STORES: Record<string, string> = {
    Lider: 'https://www.lider.cl',
};

const DIRECT_CART_STORES: Record<string, string> = {
    ...VERIFIED_DIRECT_CART_STORES,
    ...ATTEMPT_DIRECT_CART_STORES,
};

/** Tope de productos por enlace: una URL enorme se corta en algunos navegadores. */
const MAX_ITEMS_PER_URL = 50;

/** 'verified' | 'attempt' | null. La UI usa esto para avisar cuando no es seguro. */
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
 * Cargabilidad del carro por tienda, para que la UI la muestre y el orden la
 * considere cuando los precios son parecidos:
 *   'direct'  -> carga sola y confirmada: carro compartido (Jumbo, Santa Isabel,
 *                Unimarc) o enlace directo verificado
 *   'attempt' -> enlace que la tienda puede bloquear; no podemos confirmarlo (Lider)
 *   'manual'  -> requiere un paso extra (marcador) o gestión comercial
 *
 * Tiene que mirar AMBOS mecanismos. Mirando solo el enlace directo, Santa Isabel
 * y Unimarc caían en 'manual' -- el peor nivel -- cuando son de las que mejor
 * funcionan: la UI las etiquetaba "requiere un paso extra" y el desempate les
 * cargaba una penalización de precio, pudiendo recomendar una tienda más cara.
 */
export function storeLoadability(store: string): StoreLoadability {
    // El carro compartido es el mecanismo más fuerte: la tienda confirma qué
    // quedó adentro, así que manda sobre lo que diga el enlace directo.
    if (storeSupportsSharedCart(store)) return 'direct';
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
