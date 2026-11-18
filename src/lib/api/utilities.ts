import type { ResidentUtilityAccount, ResidentUtilityAccountInput } from '../types';

/**
 * Mis servicios: cuentas personales de luz, agua y gas del residente.
 * Privadas: el servidor solo devuelve las de quien consulta.
 */

async function readJson<T>(response: Response): Promise<T> {
    const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok || !data) throw new Error(data?.error || 'La solicitud no pudo completarse.');
    return data;
}

const BASE = '/api/resident/utility-accounts';

export const UtilityAccountsService = {
    async list(): Promise<ResidentUtilityAccount[]> {
        const data = await readJson<{ accounts: ResidentUtilityAccount[] }>(await fetch(BASE, { cache: 'no-store' }));
        return data.accounts;
    },

    async create(input: ResidentUtilityAccountInput): Promise<ResidentUtilityAccount> {
        const data = await readJson<{ account: ResidentUtilityAccount }>(await fetch(BASE, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
        }));
        return data.account;
    },

    async update(id: string, changes: Partial<ResidentUtilityAccountInput> & { paidPeriod?: string | null }): Promise<ResidentUtilityAccount> {
        const data = await readJson<{ account: ResidentUtilityAccount }>(await fetch(BASE, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...changes, id }),
        }));
        return data.account;
    },

    async remove(id: string): Promise<void> {
        await readJson<{ ok: true }>(await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
    },
};
