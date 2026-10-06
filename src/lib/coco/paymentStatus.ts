/**
 * Resumen de gastos comunes para CoCo.
 *
 * Incluye todos los periodos pendientes. Cuando el caller entrega los saldos
 * de la cartola en outstandingAmount, descuenta los abonos del periodo elegido
 * y excluye los cobros totalmente cubiertos sin cambiar su importe original.
 *
 * get_payment_status debe devolver ese mismo recorte. Filtrar por el mes en
 * curso (el default anterior) dejaba fuera cuotas de meses previos — exactamente
 * lo que ve el residente en Inicio y Mis Gastos.
 */

export const UNPAID_EXPENSE_STATUSES = ['pending', 'overdue'] as const;

export type PaymentStatusExpenseRow = {
    amount?: number | string | null;
    outstandingAmount?: number;
    status?: string | null;
    due_date?: string | null;
    paid_at?: string | null;
    month?: string | null;
    items?: Array<{ label?: string | null; amount?: number | string | null }> | null;
};

export type PaymentStatusItem = {
    month: string;
    amount: number;
    status: string;
    due_date: string | null;
    paid_at: string | null;
    concept: string;
};

export type PaymentStatusSummary = {
    al_dia: boolean;
    pending_count: number;
    pending_amount: number;
    month_filter: string | null;
    outstanding: PaymentStatusItem[];
    latest_unpaid: PaymentStatusItem | null;
    resumen: string;
};

function amountOf(row: PaymentStatusExpenseRow) {
    return row.outstandingAmount ?? Number(row.amount || 0);
}

function isUnpaid(status: string | null | undefined) {
    return status === 'pending' || status === 'overdue';
}

function conceptOf(row: PaymentStatusExpenseRow, month: string) {
    const labels = (row.items || [])
        .map(item => (item.label || '').trim())
        .filter(Boolean);
    if (labels.length === 1) return labels[0];
    if (labels.length > 1) return labels.join(', ');
    return `Gasto común ${month}`;
}

export function toPaymentStatusItem(row: PaymentStatusExpenseRow): PaymentStatusItem {
    const month = row.month || '';
    return {
        month,
        amount: amountOf(row),
        status: row.status || 'pending',
        due_date: row.due_date || null,
        paid_at: row.paid_at || null,
        concept: conceptOf(row, month),
    };
}

export function summarizeResidentPaymentStatus(
    rows: PaymentStatusExpenseRow[],
    monthFilter: string | null = null,
): PaymentStatusSummary {
    const items = rows.map(toPaymentStatusItem);
    const outstanding = items
        .filter(item => isUnpaid(item.status) && item.amount > 0)
        .sort((a, b) => b.month.localeCompare(a.month) || String(b.due_date).localeCompare(String(a.due_date)));
    const pending_amount = outstanding.reduce((sum, item) => sum + item.amount, 0);
    const pending_count = outstanding.length;
    const latest_unpaid = outstanding[0] || null;
    const al_dia = pending_count === 0;

    let resumen: string;
    if (al_dia) {
        resumen = monthFilter
            ? `No hay cobros pendientes para ${monthFilter}.`
            : 'No hay cobros pendientes. El residente está al día.';
    } else if (pending_count === 1 && latest_unpaid) {
        resumen = `Tienes 1 pago pendiente por $${pending_amount.toLocaleString('es-CL')}: ${latest_unpaid.concept} (${latest_unpaid.month}${latest_unpaid.due_date ? `, vence ${latest_unpaid.due_date}` : ''}).`;
    } else {
        const detalle = outstanding
            .map(item => `${item.concept} ${item.month} $${item.amount.toLocaleString('es-CL')}`)
            .join('; ');
        resumen = `Tienes ${pending_count} pagos pendientes por $${pending_amount.toLocaleString('es-CL')}. ${detalle}.`;
    }

    return {
        al_dia,
        pending_count,
        pending_amount,
        month_filter: monthFilter,
        outstanding,
        latest_unpaid,
        resumen,
    };
}

/** Same allocation as the cartola, including charges and credit; no truncated totals. */
export function summarizeAccountPaymentStatus(
    statement: Pick<import('@/lib/types').UnitStatement, 'chargeBalances' | 'balance' | 'availableCredit'>,
    monthFilter: string | null = null,
) {
    const rows = statement.chargeBalances.filter(charge => !monthFilter || charge.month === monthFilter).map(charge => ({
        month: charge.month, amount: charge.amount, outstandingAmount: charge.outstandingAmount,
        status: charge.outstandingAmount > 0 ? 'pending' : 'paid', due_date: charge.dueDate,
        items: [{ label: charge.label, amount: charge.amount }],
    }));
    const summary = summarizeResidentPaymentStatus(rows, monthFilter);
    return { ...summary, account_balance: statement.balance, available_credit: statement.availableCredit,
        resumen: statement.availableCredit > 0
            ? `${summary.resumen} Saldo neto de la cuenta: $${statement.balance.toLocaleString('es-CL')}; crédito disponible sin imputar a otro periodo: $${statement.availableCredit.toLocaleString('es-CL')}.`
            : summary.resumen,
    };
}
