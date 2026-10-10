import { createHash } from 'node:crypto';
import type { FinanceCommitteeReviewSnapshot } from '@/lib/types';
import type { ProrationResult } from './prorration';

export function sourceExpenseSnapshot(rows: Array<{
    id: unknown; label: unknown; category: unknown; amount: unknown;
    document_url?: unknown; document_sha256?: unknown;
}>): FinanceCommitteeReviewSnapshot['sourceExpenses'] {
    return rows.map(row => {
        const documentValue = String(row.document_sha256 || row.document_url || '');
        return { id: String(row.id), label: String(row.label), category: String(row.category), amount: Number(row.amount),
            hasDocument: Boolean(row.document_url),
            documentFingerprint: documentValue ? createHash('sha256').update(documentValue).digest('hex') : null };
    });
}

export function committeeReviewSnapshot(
    result: Pick<ProrationResult, 'totalExpenses' | 'totalCharged' | 'warnings' | 'units'>,
    sourceExpenses: FinanceCommitteeReviewSnapshot['sourceExpenses'] = [],
): FinanceCommitteeReviewSnapshot {
    return {
        totalExpenses: result.totalExpenses,
        totalCharged: result.totalCharged,
        unitCount: result.units.length,
        warnings: result.warnings,
        sourceExpenses: [...sourceExpenses].sort((a, b) => a.id.localeCompare(b.id)),
        units: [...result.units].sort((a, b) => a.unitId.localeCompare(b.unitId)).map(unit => ({
            unitId: unit.unitId,
            label: unit.label,
            sharePermille: unit.sharePermille,
            total: unit.total,
            items: [...unit.items].sort((a, b) => a.expenseId.localeCompare(b.expenseId) || a.label.localeCompare(b.label))
                .map(item => ({ expenseId: item.expenseId, category: item.category, label: item.label, amount: item.amount })),
        })),
    };
}

export function committeeReviewDigest(
    month: string,
    dueDate: string,
    quota: { amount: number; method: 'share' | 'equal' } | null,
    result: Pick<ProrationResult, 'totalExpenses' | 'totalCharged' | 'warnings' | 'units'>,
    sourceExpenses: FinanceCommitteeReviewSnapshot['sourceExpenses'] = [],
): string {
    const snapshot = committeeReviewSnapshot(result, sourceExpenses);
    const financialSnapshot = { totalExpenses: snapshot.totalExpenses, totalCharged: snapshot.totalCharged,
        unitCount: snapshot.unitCount, units: snapshot.units, sourceExpenses: snapshot.sourceExpenses };
    return createHash('sha256').update(JSON.stringify({ month, dueDate, quota, snapshot: financialSnapshot })).digest('hex');
}
