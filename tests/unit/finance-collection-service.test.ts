import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    rows: {} as Record<string, Record<string, unknown>[]>,
    updates: [] as { table: string; filters: Record<string, unknown>; value: Record<string, unknown> }[],
    inserts: [] as Record<string, unknown>[],
    failUpdates: false,
}));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => ({ from: (table: string) => {
    const filters: Record<string, unknown> = {};
    let value: Record<string, unknown> | undefined;
    const query = {
        select: () => query,
        eq: (key: string, match: unknown) => { filters[key] = match; return query; },
        neq: () => query,
        update: (payload: Record<string, unknown>) => { value = payload; return query; },
        insert: (payload: Record<string, unknown>) => { state.inserts.push(payload); return query; },
        maybeSingle: async () => ({ data: (state.rows[table] || []).find(row => Object.entries(filters).every(([key, match]) => row[key] === match)) || null, error: null }),
        then: (resolve: (result: unknown) => unknown) => {
            if (value) {
                state.updates.push({ table, filters, value });
                return Promise.resolve({ error: state.failUpdates ? new Error('update failed') : null }).then(resolve);
            }
            return Promise.resolve({ data: (state.rows[table] || []).filter(row => Object.entries(filters).every(([key, match]) => row[key] === match)), error: null }).then(resolve);
        },
    };
    return query;
} }) }));

import { getUnitStatement, recordPayment, reconcileUnitStatuses } from '@/lib/finance/collectionService';

describe('persisted payment allocation integration', () => {
    beforeEach(() => {
        state.rows = {
            units: [{ id: 'unit', community_id: 'community', number: '101', owner_id: null }],
            expenses: [
                { id: 'may', community_id: 'community', unit_id: 'unit', amount: 100000, status: 'overdue', month: '2026-05', due_date: '2026-05-05', created_at: '2026-05-01' },
                { id: 'june', community_id: 'community', unit_id: 'unit', amount: 100000, status: 'overdue', month: '2026-06', due_date: '2026-06-05', created_at: '2026-06-01' },
            ],
            unit_charges: [],
            unit_payments: [{ id: 'payment', community_id: 'community', unit_id: 'unit', amount: 100000, expense_id: 'june', charge_id: null, paid_at: '2026-06-10', method: 'transfer', created_at: '2026-06-10' }],
        };
        state.updates = [];
        state.inserts = [];
        state.failUpdates = false;
    });

    it('marks only the chosen month paid and scopes the update to the unit and community', async () => {
        await reconcileUnitStatuses('community', 'unit');
        expect(state.updates).toHaveLength(1);
        expect(state.updates[0]).toMatchObject({ table: 'expenses', filters: { id: 'june', community_id: 'community', unit_id: 'unit' }, value: { status: 'paid' } });
    });
    it('keeps the chosen partial payment pending and the older period overdue', async () => {
        state.rows.unit_payments[0].amount = 40000;
        await reconcileUnitStatuses('community', 'unit');
        expect(state.updates).toHaveLength(0);
        const statement = await getUnitStatement('community', 'unit');
        expect(statement.balance).toBe(160000);
        expect(statement.oldestOverdueMonth).toBe('2026-05');
    });
    it('retains the destination in the account statement', async () => {
        const statement = await getUnitStatement('community', 'unit');
        expect(statement.balance).toBe(100000);
        expect(statement.oldestOverdueMonth).toBe('2026-05');
    });
    it('propagates persistence failures rather than reporting success', async () => {
        state.failUpdates = true;
        await expect(reconcileUnitStatuses('community', 'unit')).rejects.toThrow('update failed');
    });
    it('rejects a payment targeting a different unit before inserting', async () => {
        state.rows.expenses[1].unit_id = 'other-unit';
        await expect(recordPayment('community', 'admin', {
            unitId: 'unit', expenseId: 'june', amount: 100000, paidAt: '2026-06-10', method: 'transfer',
        })).rejects.toThrow('no pertenece');
        expect(state.inserts).toHaveLength(0);
    });
    it('rejects a payment targeting another community before inserting', async () => {
        state.rows.expenses[1].community_id = 'other-community';
        await expect(recordPayment('community', 'admin', {
            unitId: 'unit', expenseId: 'june', amount: 100000, paidAt: '2026-06-10', method: 'transfer',
        })).rejects.toThrow('no pertenece');
        expect(state.inserts).toHaveLength(0);
    });
});
