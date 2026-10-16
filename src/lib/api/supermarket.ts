import {
    SupermarketCartHandoff,
    SupermarketCartHandoffItem,
    SupermarketCatalogResponse,
    SupermarketListResolution,
    SavedShoppingList,
    SupermarketSearchResponse,
    SupermarketGroupComparison,
    SupermarketGroupCreateInput,
    SupermarketGroupOrder,
} from '../types';
import { readApi } from './_shared';

async function readJsonResponse<T>(response: Response): Promise<T> {
    const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok || !data) {
        throw new Error(data?.error || 'La solicitud no pudo completarse.');
    }
    return data;
}

export const SupermarketCartService = {
    async prepareHandoff(
        store: string,
        items: SupermarketCartHandoffItem[],
    ): Promise<SupermarketCartHandoff> {
        const response = await fetch('/api/supermarket/cart-handoff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ store, items }),
        });
        return readJsonResponse<SupermarketCartHandoff>(response);
    },
};

export const SupermarketCatalogService = {
    async extractList(file: File): Promise<string> {
        const form = new FormData();
        form.append('file', file);
        const response = await fetch('/api/supermarket/list-upload', { method: 'POST', body: form });
        const data = await readJsonResponse<{ list: string }>(response);
        return data.list;
    },
    async resolveList(store: string, list: string, signal?: AbortSignal): Promise<SupermarketListResolution[]> {
        const response = await fetch('/api/supermarket/catalog/resolve', {
            method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ store, list }),
        });
        const data = await readJsonResponse<{ resolved: SupermarketListResolution[] }>(response);
        return data.resolved;
    },
    async search(store: string, query: string, page: number, signal?: AbortSignal): Promise<SupermarketCatalogResponse> {
        const params = new URLSearchParams({ store, q: query, page: String(page) });
        const response = await fetch(`/api/supermarket/catalog?${params}`, { signal });
        return readJsonResponse<SupermarketCatalogResponse>(response);
    },
    async savedLists(): Promise<SavedShoppingList[]> {
        const data = await readApi<{ lists: SavedShoppingList[] }>('/api/supermarket/lists', 'No se pudieron leer tus listas.');
        return data.lists;
    },
    async saveList(input: { id?: string | null; body: string; store?: string | null }, keepalive = false): Promise<SavedShoppingList> {
        const data = await readApi<{ list: SavedShoppingList }>('/api/supermarket/lists', 'No se pudo guardar la lista.', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
            keepalive,
        });
        return data.list;
    },
    async deleteList(id: string): Promise<void> {
        await readApi<{ deleted: boolean }>(`/api/supermarket/lists?id=${encodeURIComponent(id)}`, 'No se pudo borrar la lista.', {
            method: 'DELETE',
        });
    },
    async compare(message: string, signal?: AbortSignal): Promise<SupermarketSearchResponse> {
        const response = await fetch('/api/supermarket', {
            method: 'POST',
            signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
        });
        return readJsonResponse<SupermarketSearchResponse>(response);
    },
};

export const SupermarketGroupService = {
    async list(): Promise<SupermarketGroupOrder[]> {
        const response = await fetch('/api/supermarket/group-orders', {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        });
        const data = await readJsonResponse<{ orders: SupermarketGroupOrder[] }>(response);
        return data.orders;
    },

    async create(input: SupermarketGroupCreateInput): Promise<SupermarketGroupOrder> {
        const response = await fetch('/api/supermarket/group-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', ...input }),
        });
        const data = await readJsonResponse<{ order: SupermarketGroupOrder }>(response);
        return data.order;
    },

    /** Registra que el organizador dio por recibido el pago de un vecino. */
    async settle(orderId: string, memberUserId: string, paid: boolean): Promise<SupermarketGroupOrder> {
        const response = await fetch('/api/supermarket/group-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'settle', orderId, memberUserId, paid }),
        });
        const data = await readJsonResponse<{ order: SupermarketGroupOrder }>(response);
        return data.order;
    },

    async join(orderId: string, shoppingList: string): Promise<SupermarketGroupOrder> {
        const response = await fetch('/api/supermarket/group-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'join', orderId, shoppingList }),
        });
        const data = await readJsonResponse<{ order: SupermarketGroupOrder }>(response);
        return data.order;
    },

    async compare(orderId: string): Promise<SupermarketGroupComparison[]> {
        const response = await fetch('/api/supermarket/group-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'compare', orderId }),
        });
        const data = await readJsonResponse<{ comparisons: SupermarketGroupComparison[] }>(response);
        return data.comparisons;
    },

    async lock(orderId: string): Promise<SupermarketGroupOrder> {
        const response = await fetch('/api/supermarket/group-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'lock', orderId }),
        });
        const data = await readJsonResponse<{ order: SupermarketGroupOrder }>(response);
        return data.order;
    },

    async review(orderId: string, approved: boolean, coordinatorId?: string, note?: string): Promise<SupermarketGroupOrder> {
        const response = await fetch('/api/supermarket/group-orders', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'review', orderId, approved, coordinatorId, note }),
        });
        const data = await readJsonResponse<{ order: SupermarketGroupOrder }>(response);
        return data.order;
    },
};

/* ── Estacionamientos ───────────────────────────────────────── */
