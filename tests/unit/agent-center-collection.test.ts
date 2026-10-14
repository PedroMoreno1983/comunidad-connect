import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    tables: {} as Record<string, Record<string, unknown>[]>,
    serverLimit: 73,
    failAfter: Infinity,
    expenseReads: 0,
    upserts: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({ from: (table: string) => {
        const filters: ((row: Record<string, unknown>) => boolean)[] = [];
        let limit = Infinity;
        let head = false;
        const query = {
            select: (_columns: string, options?: { head?: boolean }) => { head = !!options?.head; return query; },
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
            in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
            gt: (key: string, value: string) => { filters.push(row => String(row[key]) > value); return query; },
            order: () => query,
            limit: (value: number) => { limit = value; return query; },
            upsert: (rows: Record<string, unknown>[], options: { ignoreDuplicates?: boolean }) => {
                expect(options.ignoreDuplicates).toBe(true);
                state.upserts.push(...rows);
                for (const row of rows) {
                    const target = state.tables[table] ||= [];
                    if (!target.some(existing => existing.id === row.id)) target.push({ ...row, read: false });
                }
                return Promise.resolve({ error: null });
            },
            then: (resolve: (result: unknown) => unknown) => {
                if (table === 'expenses' && ++state.expenseReads > state.failAfter) return Promise.resolve({ data: null, error: new Error('read failed') }).then(resolve);
                const rows = (state.tables[table] || []).filter(row => filters.every(filter => filter(row)))
                    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
                return Promise.resolve({ data: head ? null : rows.slice(0, Math.min(limit, table === 'expenses' ? state.serverLimit : Infinity)), count: rows.length, error: null }).then(resolve);
            },
        };
        return query;
    } }),
}));

import { readCollectionExpenses, resolveCollectionRecipients, storeCollectionNotifications, verifyCollectionNotifications } from '@/lib/agent-center/collection';

const community = 'community-a';
const unitId = '00000000-0000-0000-0000-000000000001';
const resident = '00000000-0000-0000-0000-000000000002';
const outsider = '00000000-0000-0000-0000-000000000003';
const today = '2026-10-10';
function seedExpenses(count: number) {
    state.tables.expenses = Array.from({ length: count }, (_, index) => ({
        id: String(index).padStart(8, '0'), community_id: community, unit_id: unitId,
        month: '2026-10', amount: 100000, status: 'pending', due_date: '2026-10-01',
    }));
}

describe('collection scope and notification integrity', () => {
    beforeEach(() => {
        state.tables = {
            units: [{ id: unitId, community_id: community, number: '101', resident_profile_id: resident, owner_id: outsider }],
            profiles: [{ id: resident, community_id: community }, { id: outsider, community_id: 'community-b' }],
        };
        state.expenseReads = 0;
        state.failAfter = Infinity;
        state.upserts = [];
    });

    it('reviews more than 1000 debts, even with a lower server row limit', async () => {
        seedExpenses(1005);
        state.tables.expenses.push({ ...state.tables.expenses[0], id: 'foreign', community_id: 'community-b' });
        const expenses = await readCollectionExpenses(community);
        expect(expenses).toHaveLength(1005);
        const plan = await resolveCollectionRecipients(community, expenses, today);
        // Un aviso por unidad, no uno por cobro.
        expect(plan.notifications).toHaveLength(1);
        expect(plan.recipientCount).toBe(1);
        const ids = await storeCollectionNotifications(plan);
        expect(await verifyCollectionNotifications(community, ids)).toBe(1);
    });

    it('does not return a partial scope when a later page fails', async () => {
        seedExpenses(200);
        state.failAfter = 1;
        await expect(readCollectionExpenses(community)).rejects.toThrow('read failed');
        expect(state.upserts).toHaveLength(0);
    });

    it('keeps unresolved and cross-community links pending rather than sending to an outsider', async () => {
        seedExpenses(2);
        state.tables.profiles = [{ id: outsider, community_id: 'community-b' }];
        state.tables.expenses[1].unit_id = 'legacy unit number';
        const plan = await resolveCollectionRecipients(community, await readCollectionExpenses(community), today);
        expect(plan.notifications).toHaveLength(0);
        expect(plan.missingRecipients).toHaveLength(2);
        expect(plan.missingRecipients.map(row => row.expenseId)).toEqual(['00000000', '00000001']);
    });

    it('retries without duplicating or resetting a read notification and avoids nominal debt claims', async () => {
        seedExpenses(1);
        const plan = await resolveCollectionRecipients(community, await readCollectionExpenses(community), today);
        expect(plan.notifications[0].body).not.toContain('100.000');
        expect(plan.notifications[0].body).toContain('abonos');
        await storeCollectionNotifications(plan);
        state.tables.notifications[0].read = true;
        await storeCollectionNotifications(plan);
        expect(state.tables.notifications).toHaveLength(1);
        expect(state.tables.notifications[0].read).toBe(true);
    });

    it('does not count another community notification as verified', async () => {
        state.tables.notifications = [{ id: 'notification', community_id: 'community-b' }];
        await expect(verifyCollectionNotifications(community, ['notification'])).rejects.toThrow('verificar');
    });

    it('alerts only local administrators about unresolved recipients without claiming resident delivery', async () => {
        seedExpenses(1);
        state.tables.units[0].resident_profile_id = null;
        state.tables.units[0].owner_id = null;
        state.tables.profiles.push({ id: 'admin-a', community_id: community, role: 'admin' },
            { id: 'admin-b', community_id: 'community-b', role: 'admin' });
        const plan = await resolveCollectionRecipients(community, await readCollectionExpenses(community), today);
        expect(plan.notifications).toHaveLength(0);
        expect(plan.recipientCount).toBe(0);
        expect(plan.adminNotifications?.map(row => row.user_id)).toEqual(['admin-a']);
        const ids = await storeCollectionNotifications(plan);
        expect(await verifyCollectionNotifications(community, ids)).toBe(1);
        state.tables.notifications[0].read = true;
        await storeCollectionNotifications(plan);
        expect(state.tables.notifications).toHaveLength(1);
        expect(state.tables.notifications[0].read).toBe(true);
    });

    it('includes pending unit charges but not committee discounts or other communities', async () => {
        seedExpenses(0);
        state.tables.unit_charges = [
            { id: 'c1', community_id: community, unit_id: unitId, month: '2026-10', amount: 5000, status: 'pending', due_date: '2026-10-05', label: 'Estacionamiento', notes: null },
            { id: 'c2', community_id: community, unit_id: unitId, month: '2026-10', amount: 2000, status: 'pending', due_date: null, label: 'Descuento de comite', notes: null },
            { id: 'c3', community_id: community, unit_id: unitId, month: '2026-10', amount: 9000, status: 'paid', due_date: null, label: 'Multa', notes: null },
            { id: 'c4', community_id: 'community-b', unit_id: unitId, month: '2026-10', amount: 9000, status: 'pending', due_date: null, label: 'Multa', notes: null },
        ];
        const debts = await readCollectionExpenses(community);
        expect(debts.map(row => [row.id, row.source])).toEqual([['c1', 'charge']]);
        const plan = await resolveCollectionRecipients(community, debts, today);
        expect(plan.notifications).toHaveLength(1);
    });

    it('escalates by the oldest overdue debt of each unit', async () => {
        seedExpenses(2);
        state.tables.expenses[0].due_date = '2026-09-20';
        let plan = await resolveCollectionRecipients(community, await readCollectionExpenses(community), today);
        expect(plan.notifications[0].title).toBe('¿Te podemos ayudar con tu cuenta?');
        expect(plan.agreementCandidates).toHaveLength(0);
        state.tables.expenses[0].due_date = '2026-09-01';
        state.tables.profiles.push({ id: 'admin-a', community_id: community, role: 'admin' });
        plan = await resolveCollectionRecipients(community, await readCollectionExpenses(community), today);
        expect(plan.notifications[0].title).toBe('Busquemos juntos una solución');
        expect(plan.notifications[0].body).toContain('convenio');
        expect(plan.notifications[0].body).not.toMatch(/moros|deudor|corte|judicial/i);
        expect(plan.agreementCandidates).toEqual([{ unitId, unitLabel: '101', daysOverdue: 39 }]);
        expect(plan.adminNotifications?.map(row => [row.user_id, row.link])).toEqual([['admin-a', '/admin/finanzas/convenios']]);
        expect(plan.notifications[0].body).not.toContain('100.000');
    });

    it('a new stage creates a new notice, the same stage does not', async () => {
        seedExpenses(1);
        const first = await resolveCollectionRecipients(community, await readCollectionExpenses(community), today);
        const again = await resolveCollectionRecipients(community, await readCollectionExpenses(community), today);
        const later = await resolveCollectionRecipients(community, await readCollectionExpenses(community), '2026-10-20');
        expect(again.notifications[0].id).toBe(first.notifications[0].id);
        expect(later.notifications[0].id).not.toBe(first.notifications[0].id);
    });

    it('does not chase units with an active payment agreement', async () => {
        seedExpenses(1);
        state.tables.payment_agreements = [{ id: 'a1', community_id: community, unit_id: unitId, status: 'active' }];
        const plan = await resolveCollectionRecipients(community, await readCollectionExpenses(community), today);
        expect(plan.notifications).toHaveLength(0);
        expect(plan.skippedWithAgreement).toBe(1);
    });
});
