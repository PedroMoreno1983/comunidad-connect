import { describe, expect, it } from 'vitest';
import { allocateUnitPayments } from '@/lib/finance/paymentAllocation';
import { buildAccountStatement } from '@/lib/finance/ledger';
import type { FinanceAllocationDebt } from '@/lib/types';

const debts: FinanceAllocationDebt[] = [
    { id: 'may', kind: 'expense', amount: 100000, date: '2026-05-05' },
    { id: 'june', kind: 'expense', amount: 100000, date: '2026-06-05' },
];

describe('payments applied to the chosen period', () => {
    it('pays June while leaving May unpaid', () => {
        const result = allocateUnitPayments(debts, [{ amount: 100000, expenseId: 'june' }]);
        expect(result.get('expense:may')).toBe(100000);
        expect(result.get('expense:june')).toBe(0);
    });
    it('keeps a partial payment on the selected period', () => {
        const result = allocateUnitPayments(debts, [{ amount: 40000, expenseId: 'june' }]);
        expect(result.get('expense:may')).toBe(100000);
        expect(result.get('expense:june')).toBe(60000);
    });
    it('reserves explicit payments before allocating unassigned payments, regardless of input order', () => {
        for (const payments of [
            [{ amount: 100000 }, { amount: 60000, expenseId: 'june' }],
            [{ amount: 60000, expenseId: 'june' }, { amount: 100000 }],
        ]) {
            const result = allocateUnitPayments(debts, payments);
            expect(result.get('expense:may')).toBe(0);
            expect(result.get('expense:june')).toBe(40000);
        }
    });
    it('leaves an excess on the selected period as account credit instead of paying another month', () => {
        const result = allocateUnitPayments(debts, [{ amount: 120000, expenseId: 'june' }]);
        expect(result.get('expense:may')).toBe(100000);
        expect(result.get('expense:june')).toBe(0);
    });
    it('uses signed committee discounts as credit', () => {
        const result = allocateUnitPayments([...debts, { id: 'discount', kind: 'charge', amount: -20000, date: '2026-06-05' }], []);
        expect(result.get('expense:may')).toBe(80000);
        expect(result.get('expense:june')).toBe(100000);
    });
    it('rejects invalid or ambiguous targets', () => {
        expect(() => allocateUnitPayments(debts, [{ amount: 100, expenseId: 'foreign' }])).toThrow('destino');
        expect(() => allocateUnitPayments(debts, [{ amount: 100, expenseId: 'may', chargeId: 'other' }])).toThrow('dos destinos');
    });
    it('keeps the statement oldest overdue month consistent with the selected payment', () => {
        const statement = buildAccountStatement(debts.map(debt => ({
            id: debt.id, kind: 'gasto_comun', label: debt.id, amount: debt.amount,
            month: debt.id === 'may' ? '2026-05' : '2026-06', dueDate: debt.date, createdAt: debt.date,
        })), [{ id: 'payment', amount: 100000, expenseId: 'june', paidAt: '2026-06-10', method: 'transfer', reference: null, createdAt: '2026-06-10' }], '2026-07-01');
        expect(statement.balance).toBe(100000);
        expect(statement.overdueAmount).toBe(100000);
        expect(statement.oldestOverdueMonth).toBe('2026-05');
    });
});
