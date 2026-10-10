import { describe, expect, it } from 'vitest';
import { committeeReviewDigest, committeeReviewSnapshot } from '@/lib/finance/committeeReviewDigest';
import type { ProrationResult } from '@/lib/finance/prorration';

const result: ProrationResult = {
    totalExpenses: 1000, totalCharged: 1000, fellBackToEqualSplit: false, warnings: [],
    units: [{ unitId: 'unit-a', label: 'A', sharePermille: 1000, total: 1000,
        items: [{ expenseId: 'expense-a', category: 'water', label: 'Agua', amount: 1000 }] }],
};

describe('committee billing review digest', () => {
    it('binds the decision to expenses, units, due date and quota', () => {
        const base = committeeReviewDigest('2026-10', '2026-11-05', null, result);
        expect(committeeReviewDigest('2026-10', '2026-11-06', null, result)).not.toBe(base);
        expect(committeeReviewDigest('2026-10', '2026-11-05', { amount: 1000, method: 'share' }, result)).not.toBe(base);
        expect(committeeReviewDigest('2026-10', '2026-11-05', null, {
            ...result, units: [{ ...result.units[0], items: [{ ...result.units[0].items[0], expenseId: 'expense-b' }] }],
        })).not.toBe(base);
        expect(committeeReviewDigest('2026-10', '2026-11-05', null, {
            ...result, units: [{ ...result.units[0], total: 999 }],
        })).not.toBe(base);
        expect(committeeReviewDigest('2026-10', '2026-11-05', null, result, [
            { id: 'source-a', label: 'Agua', category: 'water', amount: 1000, hasDocument: true, documentFingerprint: 'a' },
        ])).not.toBe(base);
    });

    it('ignores warning prose and retains the approved breakdown for the reviewer', () => {
        const withWarning = { ...result, warnings: ['Advertencia'] };
        expect(committeeReviewDigest('2026-10', '2026-11-05', null, withWarning))
            .toBe(committeeReviewDigest('2026-10', '2026-11-05', null, result));
        expect(committeeReviewSnapshot(withWarning).units[0].items[0].expenseId).toBe('expense-a');
    });
});
