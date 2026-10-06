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
        const plan = await resolveCollectionRecipients(community, expenses);
        expect(plan.notifications).toHaveLength(1005);
        expect(plan.recipientCount).toBe(1);
        const ids = await storeCollectionNotifications(plan);
        expect(await verifyCollectionNotifications(community, ids)).toBe(1005);
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
        const plan = await resolveCollectionRecipients(community, await readCollectionExpenses(community));
        expect(plan.notifications).toHaveLength(0);
        expect(plan.missingRecipients).toHaveLength(2);
        expect(plan.missingRecipients.map(row => row.expenseId)).toEqual(['00000000', '00000001']);
    });

    it('retries without duplicating or resetting a read notification and avoids nominal debt claims', async () => {
        seedExpenses(1);
        const plan = await resolveCollectionRecipients(community, await readCollectionExpenses(community));
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
        const plan = await resolveCollectionRecipients(community, await readCollectionExpenses(community));
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
});
