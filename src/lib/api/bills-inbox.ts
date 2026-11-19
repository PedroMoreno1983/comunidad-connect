import type { InboundBillDocument, InboundBillRegisterInput } from '../types';

/** Boletas de luz, agua y gas que llegan solas por correo a la comunidad. */

async function readJson<T>(response: Response): Promise<T> {
    const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok || !data) throw new Error(data?.error || 'La solicitud no pudo completarse.');
    return data;
}

const BASE = '/api/admin/bills-inbox';

export const BillsInboxService = {
    async list(): Promise<{ address: string | null; items: InboundBillDocument[] }> {
        return readJson(await fetch(BASE, { cache: 'no-store' }));
    },

    async register(id: string, input: InboundBillRegisterInput): Promise<void> {
        await readJson(await fetch(BASE, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, id, action: 'register' }),
        }));
    },

    async discard(id: string): Promise<void> {
        await readJson(await fetch(BASE, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'discard' }),
        }));
    },
};
