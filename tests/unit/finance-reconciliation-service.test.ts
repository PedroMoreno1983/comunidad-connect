import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, loseRace: false }));
const payment = vi.hoisted(() => ({ record: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/finance/collectionService', () => ({ recordPayment: payment.record, deletePayment: payment.remove }));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => ({ from: (table: string) => {
    const filters: Record<string, unknown> = {};
    let update: Record<string, unknown> | null = null;
    let range = [0, 999];
    const result = () => {
        const rows = (state.rows[table] || []).filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
        if (update && state.loseRace) return [];
        if (update) for (const row of rows) Object.assign(row, update);
        return rows.slice(range[0], range[1] + 1);
    };
    const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        neq: () => query,
        order: () => query,
        range: (start: number, end: number) => { range = [start, end]; return query; },
        update: (value: Record<string, unknown>) => { update = value; return query; },
        maybeSingle: async () => ({ data: result()[0] || null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: result(), error: null }).then(resolve),
    };
    return query;
} }) }));

import { getReconciliation, matchTransaction, recordSuggestedDeposit } from '@/lib/finance/reconciliationService';

describe('reconciliation persistence and allocation', () => {
    beforeEach(() => {
        state.loseRace = false;
        state.rows = {
            units: [{ id: 'unit', community_id: 'community', number: '1204', tower: 'A' }],
            expenses: [{ id: 'oct', unit_id: 'unit', community_id: 'community', month: '2026-10', amount: 2000, status: 'pending', due_date: '2026-11-05', created_at: '2026-10-01' }],
            unit_charges: [],
            unit_payments: [{ id: 'partial', community_id: 'community', unit_id: 'unit', amount: 500, expense_id: 'oct', paid_at: '2026-10-01' }],
            bank_transactions: [{ id: 'txn', community_id: 'community', amount: 1500, txn_date: '2026-10-05', description: 'QA DEPTO 1204', reference: 'QA-OP', status: 'pending' }],
        };
        payment.record.mockReset().mockImplementation(async (_community, _admin, input) => {
            state.rows.unit_payments.push({ id: 'new', community_id: 'community', unit_id: input.unitId, amount: input.amount });
            return { id: 'new' };
        });
        payment.remove.mockReset().mockResolvedValue({ ok: true });
    });
    it('uses the remaining balance rather than the original charge', async () => {
        const result = await getReconciliation('community');
        expect(result.depositSuggestions[0]).toMatchObject({ expenseId: 'oct', amountMatchesCharge: true, openCharges: [{ amount: 1500 }] });
    });
    it('records once with a stable transaction reference and no premature notice', async () => {
        await recordSuggestedDeposit('community', 'admin', 'txn');
        expect(payment.record).toHaveBeenCalledWith('community', 'admin', expect.objectContaining({ amount: 1500, expenseId: 'oct', reference: 'cartola-txn', notes: 'QA DEPTO 1204 · QA-OP' }), { notify: false });
        expect(state.rows.bank_transactions[0]).toMatchObject({ status: 'matched', matched_payment_id: 'new' });
        await expect(recordSuggestedDeposit('community', 'admin', 'txn')).rejects.toThrow('ya no tiene');
        expect(payment.record).toHaveBeenCalledTimes(1);
    });
    it('rejects a foreign month before registering money', async () => {
        await expect(recordSuggestedDeposit('community', 'admin', 'txn', 'foreign')).rejects.toThrow('Elige el mes');
        expect(payment.record).not.toHaveBeenCalled();
    });
    it('compensates only its new payment when the movement changes concurrently', async () => {
        state.loseRace = true;
        await expect(recordSuggestedDeposit('community', 'admin', 'txn')).rejects.toThrow('movimiento cambió');
        expect(payment.remove).toHaveBeenCalledWith('community', 'new');
        expect(state.rows.bank_transactions[0].status).toBe('pending');
    });
    it('rejects a manual match with a different amount', async () => {
        await expect(matchTransaction('community', 'txn', 'partial')).rejects.toThrow('monto');
    });
    it('reads beyond the default page before proposing a new payment', async () => {
        state.rows.unit_payments = Array.from({ length: 1100 }, (_, index) => ({ id: `p${index}`, community_id: 'community', unit_id: 'unit', amount: 1, expense_id: 'oct', paid_at: '2026-10-01' }));
        const result = await getReconciliation('community');
        expect(result.unmatchedPayments).toHaveLength(1100);
        expect(result.depositSuggestions[0].openCharges[0].amount).toBe(900);
    });
});
