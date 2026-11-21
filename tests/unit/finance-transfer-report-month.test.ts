/**
 * 21-11-2026: en la prueba de punta a punta CoCo preguntó el mes de la
 * transferencia aunque la unidad tenía un solo cobro pendiente. Sin mes, se usa
 * ese cobro; con varios pendientes, todavía hay que elegir.
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { reportTransferForUnit } from '@/lib/finance/transferReport';

type Row = Record<string, unknown>;

function fakeAdmin(expenses: Row[]) {
    const inserted: Row[] = [];
    const from = (table: string) => {
        const filters: Array<(row: Row) => boolean> = [];
        let limit = Infinity;
        const rows = () => (table === 'expenses' ? expenses : table === 'profiles' ? [{ id: 'admin-1', community_id: 'c1', role: 'admin' }] : [{ id: 'u1', number: '101', tower: 'A' }])
            .filter(row => filters.every(test => test(row))).slice(0, limit);
        const q = {
            select: () => q,
            eq: (column: string, value: unknown) => { filters.push(row => row[column] === undefined || row[column] === value); return q; },
            in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return q; },
            limit: (n: number) => { limit = n; return q; },
            maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
            insert: async (value: Row[]) => { inserted.push(...value); return { error: null }; },
            then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows(), error: null }),
        };
        return q;
    };
    return { client: { from } as unknown as SupabaseClient, inserted };
}

const base = { communityId: 'c1', unitId: 'u1', amount: 60000, paidAt: '2026-11-21', reference: '123456' };

describe('aviso de transferencia sin mes', () => {
    it('con un solo cobro pendiente, usa ese mes', async () => {
        const { client, inserted } = fakeAdmin([{ id: 'e1', month: '2026-11', unit_id: 'u1', community_id: 'c1', status: 'pending' }]);
        const result = await reportTransferForUnit(client, base);
        expect(result).toMatchObject({ reported: true, month: '2026-11', amount: 60000 });
        expect(inserted).toHaveLength(1);
    });

    it('con dos pendientes, pide elegir el mes', async () => {
        const { client } = fakeAdmin([
            { id: 'e1', month: '2026-10', unit_id: 'u1', community_id: 'c1', status: 'overdue' },
            { id: 'e2', month: '2026-11', unit_id: 'u1', community_id: 'c1', status: 'pending' },
        ]);
        expect(await reportTransferForUnit(client, base)).toMatchObject({ error: 'Elige el mes al que corresponde la transferencia.' });
    });
});
