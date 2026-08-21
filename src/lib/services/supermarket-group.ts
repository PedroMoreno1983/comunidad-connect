/**
 * SupermarketGroupService: compras grupales de supermercado del condominio.
 *
 * Extraído de `src/lib/api.ts`, que reexporta este servicio para no romper
 * a quienes lo importan desde `@/lib/api`. Ver docs/deuda-arquitectonica.md.
 */

import type {
    SupermarketGroupComparison,
    SupermarketGroupCreateInput,
    SupermarketGroupOrder,
} from '../types';

async function readJsonResponse<T>(response: Response): Promise<T> {
    const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok || !data) {
        throw new Error(data?.error || 'La solicitud no pudo completarse.');
    }
    return data;
}

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
};
