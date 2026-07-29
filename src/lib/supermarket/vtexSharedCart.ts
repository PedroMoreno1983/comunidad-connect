/**
 * Carro compartido de VTEX: se arma en el servidor y se entrega por enlace.
 *
 * Es el mecanismo bueno, y reemplaza al enlace `/checkout/cart/add` en las
 * cadenas donde ambos existen. La diferencia que importa: acá la tienda nos
 * RESPONDE qué quedó en el carro, con nombre, cantidad y precio. El enlace
 * directo solo permitía confiar en que el navegador hiciera lo correcto; un
 * 307 que conserva parámetros no prueba que el carro se cargó.
 *
 * Flujo:
 *   1. POST /api/checkout/pub/orderForm            -> crea un carro anónimo
 *   2. POST /api/checkout/pub/orderForm/{id}/items -> agrega todos los SKU
 *   3. La persona abre /checkout/?orderFormId={id} en el dominio público
 *
 * No hay problema de CORS porque los pasos 1 y 2 ocurren servidor a servidor;
 * el navegador solo navega a un enlace normal.
 *
 * Un detalle no obvio: la Checkout API NO vive en el dominio público de estas
 * tiendas (www.santaisabel.cl responde 405/404 porque son storefronts headless
 * detrás de nginx/Next.js). Vive en el host de la cuenta VTEX,
 * {cuenta}.vtexcommercestable.com.br. El carro creado ahí sí se abre después
 * en el dominio público, que es lo que la persona reconoce.
 *
 * Verificado contra las tiendas reales el 2026-07-29 con SKUs de nuestro
 * catálogo: Santa Isabel 3/3 productos ($8.200), Unimarc 3/3 ($13.665),
 * Jumbo 2/3 ($18.880, el tercero sin stock y la tienda lo informó).
 */

const VTEX_ACCOUNTS: Record<string, { account: string; publicOrigin: string }> = {
    'Santa Isabel': { account: 'santaisabel', publicOrigin: 'https://www.santaisabel.cl' },
    Unimarc: { account: 'unimarc', publicOrigin: 'https://www.unimarc.cl' },
    Jumbo: { account: 'jumbo', publicOrigin: 'https://www.jumbo.cl' },
};

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ITEMS = 200;

export interface SharedCartItem {
    sku: string;
    quantity: number;
    /** Nombre de nuestro catálogo, para poder nombrar lo que no entró. */
    name: string;
}

export interface SharedCartResult {
    ok: boolean;
    checkoutUrl?: string;
    /** Lo que la TIENDA confirmó que quedó en el carro, no lo que pedimos. */
    added: Array<{ name: string; quantity: number; price: number }>;
    /** Productos que la tienda rechazó, con el motivo que ella dio. */
    rejected: Array<{ name: string; reason: string }>;
    cartTotal: number;
    error?: string;
}

export function storeSupportsSharedCart(store: string): boolean {
    return Object.prototype.hasOwnProperty.call(VTEX_ACCOUNTS, store);
}

export function sharedCartStores(): string[] {
    return Object.keys(VTEX_ACCOUNTS);
}

async function vtexFetch(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
            headers: {
                // Sin User-Agent de navegador varias tiendas responden 403.
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                    + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...(init.headers || {}),
            },
        });
    } finally {
        clearTimeout(timer);
    }
}

interface VtexOrderFormItem {
    id?: string;
    name?: string;
    quantity?: number;
    sellingPrice?: number;
}

interface VtexOrderForm {
    orderFormId?: string;
    value?: number;
    items?: VtexOrderFormItem[];
    messages?: Array<{ text?: string; status?: string; fields?: { id?: string } }>;
}

/**
 * Arma el carro en la tienda y devuelve el enlace para abrirlo.
 *
 * Nunca informa como cargado un producto que la tienda no confirmó: el
 * resultado se construye leyendo `items` de la respuesta, no la lista que
 * enviamos. Un carro que se presenta completo pero llega incompleto hace que
 * la persona pague menos de lo que cree y descubra el faltante en la caja.
 */
export async function buildSharedCart(
    store: string,
    items: SharedCartItem[],
): Promise<SharedCartResult> {
    const config = VTEX_ACCOUNTS[store];
    const empty: SharedCartResult = { ok: false, added: [], rejected: [], cartTotal: 0 };
    if (!config) return { ...empty, error: `${store} no admite carro compartido.` };

    const usable = items
        .filter(item => item.sku && item.sku.trim())
        .slice(0, MAX_ITEMS)
        .map(item => ({
            sku: item.sku.trim(),
            quantity: Math.min(99, Math.max(1, Math.round(item.quantity) || 1)),
            name: item.name,
        }));
    if (usable.length === 0) {
        return { ...empty, error: 'Ninguno de los productos tiene código de la tienda.' };
    }

    const apiBase = `https://${config.account}.vtexcommercestable.com.br`;

    try {
        const createResponse = await vtexFetch(`${apiBase}/api/checkout/pub/orderForm`, { method: 'POST' });
        if (!createResponse.ok) {
            return { ...empty, error: `${store} no respondió al crear el carro (${createResponse.status}).` };
        }
        const created = await createResponse.json() as VtexOrderForm;
        const orderFormId = created.orderFormId;
        if (!orderFormId) return { ...empty, error: `${store} no entregó un identificador de carro.` };

        const addResponse = await vtexFetch(
            `${apiBase}/api/checkout/pub/orderForm/${orderFormId}/items`,
            {
                method: 'POST',
                body: JSON.stringify({
                    orderItems: usable.map(item => ({
                        id: item.sku,
                        quantity: item.quantity,
                        seller: '1',
                    })),
                }),
            },
        );
        if (!addResponse.ok) {
            return { ...empty, error: `${store} rechazó la carga de productos (${addResponse.status}).` };
        }

        const cart = await addResponse.json() as VtexOrderForm;
        const cartItems = cart.items ?? [];

        const added = cartItems.map(item => ({
            name: String(item.name || ''),
            quantity: Number(item.quantity || 0),
            // VTEX devuelve los precios en centavos.
            price: Math.round(Number(item.sellingPrice || 0) / 100),
        }));

        // Se cruza por SKU contra lo pedido: así el motivo que da la tienda
        // queda asociado al nombre que la persona reconoce de su lista.
        const landedSkus = new Set(cartItems.map(item => String(item.id || '')));
        const messageBySku = new Map<string, string>();
        for (const message of cart.messages ?? []) {
            const sku = message.fields?.id;
            if (sku && message.text) messageBySku.set(String(sku), String(message.text));
        }
        const rejected = usable
            .filter(item => !landedSkus.has(item.sku))
            .map(item => ({
                name: item.name,
                reason: messageBySku.get(item.sku) || 'La tienda no lo tiene disponible.',
            }));

        return {
            ok: added.length > 0,
            // El carro se abre en el dominio público, que es el que la persona
            // reconoce y donde tiene (o iniciará) su sesión.
            checkoutUrl: `${config.publicOrigin}/checkout/?orderFormId=${orderFormId}`,
            added,
            rejected,
            cartTotal: Math.round(Number(cart.value || 0) / 100),
        };
    } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError';
        return {
            ...empty,
            error: aborted
                ? `${store} tardó demasiado en responder.`
                : `No se pudo preparar el carro en ${store}.`,
        };
    }
}
