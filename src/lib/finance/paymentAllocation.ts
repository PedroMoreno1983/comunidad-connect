import type { FinanceAllocationDebt, FinancePaymentTarget } from '@/lib/types';

/** Explicit payment targets are reserved before allocating unassigned credits. */
export function allocateUnitPayments(debts: FinanceAllocationDebt[], payments: (FinancePaymentTarget & { amount: number })[]) {
    const sorted = [...debts].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const outstanding = new Map(sorted.map(debt => [`${debt.kind}:${debt.id}`, Math.max(0, Math.round(debt.amount))]));
    let credit = debts.reduce((sum, debt) => sum + Math.max(0, -Math.round(debt.amount)), 0);
    for (const payment of payments) {
        if (!Number.isFinite(payment.amount) || payment.amount < 0) throw new Error('Monto de pago invalido.');
        if (payment.expenseId && payment.chargeId) throw new Error('El pago tiene dos destinos.');
        const key = payment.expenseId ? `expense:${payment.expenseId}` : payment.chargeId ? `charge:${payment.chargeId}` : null;
        if (!key) { credit += Math.round(payment.amount); continue; }
        const balance = outstanding.get(key);
        if (balance === undefined) throw new Error('El destino del pago no pertenece al estado de cuenta.');
        // Excess on a chosen period stays as credit, not assigned to another month.
        outstanding.set(key, Math.max(0, balance - Math.round(payment.amount)));
    }
    for (const debt of sorted) {
        const key = `${debt.kind}:${debt.id}`;
        const balance = outstanding.get(key)!;
        const applied = Math.min(credit, balance);
        outstanding.set(key, balance - applied);
        credit -= applied;
    }
    return outstanding;
}
