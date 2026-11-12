import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { comparePersistedSupermarkets } from '@/lib/supermarketCatalog';
import { MAX_SHOPPING_LIST_CHARS, parseGroupShoppingList } from '@/lib/supermarketGroupDomain';
import { savedListKey } from '@/lib/supermarketSavedLists';
import type { SupermarketMeasurementUnit } from '@/lib/types';

/**
 * Compra individual de supermercado para CoCo: comparar la lista en todas las
 * tiendas con el mismo motor que el comparador de la app, y dejar el enlace que
 * abre esa lista lista para cargar el carro. El carro en sí lo abre la persona
 * con un clic: el navegador exige un gesto suyo para abrir la sesión de la tienda.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function supermarketListLink(listId: string, store?: string): string {
    const params = new URLSearchParams({ list: listId });
    if (store) params.set('store', store);
    return `/resident/supermercado?${params.toString()}`;
}

async function resolveList(admin: SupabaseClient, userId: string, input: { list_id?: unknown; body?: unknown }) {
    const listId = typeof input.list_id === 'string' && UUID.test(input.list_id) ? input.list_id : '';
    const body = typeof input.body === 'string' ? input.body.trim().slice(0, MAX_SHOPPING_LIST_CHARS) : '';
    if (listId) {
        const { data } = await admin.from('supermarket_saved_lists').select('id,title,body').eq('id', listId).eq('user_id', userId).maybeSingle();
        return data ? { id: String(data.id), title: String(data.title || ''), body: String(data.body || '') } : null;
    }
    if (body) {
        // Si ya la guardó, se usa esa para poder dar el enlace.
        const { data } = await admin.from('supermarket_saved_lists').select('id,title').eq('user_id', userId).eq('body_key', savedListKey(body)).maybeSingle();
        return { id: data ? String(data.id) : '', title: data ? String(data.title || '') : '', body };
    }
    const { data } = await admin.from('supermarket_saved_lists').select('id,title,body').eq('user_id', userId)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    return data ? { id: String(data.id), title: String(data.title || ''), body: String(data.body || '') } : null;
}

export async function compareShoppingListForUser(admin: SupabaseClient, userId: string, input: { list_id?: unknown; body?: unknown }) {
    const list = await resolveList(admin, userId, input);
    if (!list) return { error: 'No encontré una lista. Dime los productos o guárdala primero con save_shopping_list.' };
    const items = parseGroupShoppingList(list.body, true);
    if (!items.length) return { error: 'La lista no tiene productos reconocibles.' };

    const quantities: Record<string, number> = {};
    const units: Record<string, SupermarketMeasurementUnit | undefined> = {};
    for (const item of items) {
        quantities[item.term] = item.quantity;
        units[item.term] = item.unit;
    }
    const terms = items.map(item => item.term);
    const { comparisons } = await comparePersistedSupermarkets(terms, quantities, units);
    const ranked = comparisons.filter(basket => basket.coveredCount > 0);
    if (!ranked.length) return { error: 'No encontré precios vigentes para esos productos. Prueba con nombres más simples.' };
    const best = ranked[0];

    return {
        lista: list.title || `${items.length} productos`,
        productos_pedidos: items.length,
        mejor_opcion: {
            tienda: best.store,
            total: best.subtotal,
            completa: best.complete,
            faltan: best.missingTerms,
            pedido_minimo: best.minimumOrder ?? null,
            bajo_el_minimo: best.belowMinimum,
            productos: best.items.slice(0, 20).map(item => ({
                pedido: item.requestedTerm,
                producto: item.name,
                cantidad: item.quantity,
                total: item.lineTotal,
            })),
        },
        otras_tiendas: ranked.slice(1, 5).map(basket => ({
            tienda: basket.store,
            total: basket.subtotal,
            completa: basket.complete,
            faltan: basket.missingTerms.length,
        })),
        enlace: list.id ? supermarketListLink(list.id, best.store) : null,
        como_seguir: list.id
            ? 'Muestra el enlace como [Abrir carro en <tienda>](enlace): ahí la lista queda cargada y el botón "Abrir carro" la pasa a la tienda. El pago se hace en el sitio del supermercado.'
            : 'La lista no está guardada: ofrécele guardarla (save_shopping_list) para darle el enlace que abre el carro.',
        nota: 'Precios del catálogo de la plataforma; el total final lo confirma la tienda al abrir el carro.',
    };
}

/**
 * Lista guardada en los últimos minutos. Es la fuente principal para "llévame
 * ahí": al confirmar save_shopping_list, el historial guarda un resumen en vez
 * del resultado de la herramienta, así que el list_id no queda en la conversación.
 */
export async function recentSavedListId(admin: SupabaseClient, userId: string, minutes = 30): Promise<string | undefined> {
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    const { data } = await admin.from('supermarket_saved_lists').select('id')
        .eq('user_id', userId).gte('updated_at', since)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    return data?.id ? String(data.id) : undefined;
}

/**
 * Enlace completo a la última lista de la conversación, con la tienda si CoCo
 * la recomendó al comparar: "llévame ahí" abre el mismo carro que se mostró.
 */
export function latestShoppingListLink(conversation: Array<{ role: string; content: unknown }>, turns = 8): string | undefined {
    for (let index = conversation.length - 1, seen = 0; index >= 0 && seen < turns; index -= 1, seen += 1) {
        const raw = typeof conversation[index].content === 'string'
            ? conversation[index].content as string
            : JSON.stringify(conversation[index].content);
        const link = raw.match(/\/resident\/supermercado\?list=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:&store=([A-Za-z+%0-9]{2,30}))?/i);
        if (link) return supermarketListLink(link[1], link[2] ? decodeURIComponent(link[2].replace(/\+/g, ' ')) : undefined);
        const id = raw.match(/list_id\\?"\s*:\s*\\?"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        if (id) return supermarketListLink(id[1]);
    }
    return undefined;
}

/** Lista recién guardada o comparada en la conversación, para "llévame ahí". */
export function latestShoppingListId(conversation: Array<{ role: string; content: unknown }>, turns = 8): string | undefined {
    for (let index = conversation.length - 1, seen = 0; index >= 0 && seen < turns; index -= 1, seen += 1) {
        const raw = typeof conversation[index].content === 'string'
            ? conversation[index].content as string
            : JSON.stringify(conversation[index].content);
        const match = raw.match(/list_id\\?"\s*:\s*\\?"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
            || raw.match(/\/resident\/supermercado\?list=([0-9a-f-]{36})/i);
        if (match) return match[1];
    }
    return undefined;
}
