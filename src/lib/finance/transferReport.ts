import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * El residente informa una transferencia y el mes al que corresponde.
 *
 * No registra el pago: avisa a la administración, y el saldo cambia solo cuando
 * ella verifica el comprobante y lo registra en cobranza. Lo usan la pantalla
 * (/api/finance/transfer-report) y CoCo (report_transfer), así que las dos
 * vías validan y avisan igual.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export type TransferReportInput = {
    communityId: string;
    unitId: string;
    amount: unknown;
    paidAt: unknown;
    reference: unknown;
    /** La pantalla elige el cobro por id. */
    expenseId?: unknown;
    /** CoCo lo identifica por mes (YYYY-MM): hay un solo cobro por unidad y mes. */
    month?: unknown;
};

export type TransferReportResult =
    | { reported: true; notified: number; month: string; amount: number }
    | { error: string; status: 400 | 404 };

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function reportTransferForUnit(admin: SupabaseClient, input: TransferReportInput): Promise<TransferReportResult> {
    const amount = Math.round(Number(input.amount));
    const paidAt = cleanText(input.paidAt, 10);
    const reference = cleanText(input.reference, 120);
    const expenseId = cleanText(input.expenseId, 60);
    const month = cleanText(input.month, 7);

    if (!Number.isFinite(amount) || amount <= 0) return { error: 'El monto debe ser mayor que cero.', status: 400 };
    if (!DATE_PATTERN.test(paidAt)) return { error: 'Indica la fecha de la transferencia.', status: 400 };
    if (reference.length < 4) return { error: 'Indica el número de comprobante.', status: 400 };
    if (!expenseId && !MONTH_PATTERN.test(month)) {
        return { error: 'Elige el mes al que corresponde la transferencia.', status: 400 };
    }

    let query = admin.from('expenses')
        .select('id, month, unit_id')
        .eq('community_id', input.communityId)
        .eq('unit_id', input.unitId);
    query = expenseId ? query.eq('id', expenseId) : query.eq('month', month);
    const { data: expense, error: expenseError } = await query.maybeSingle();
    if (expenseError) throw expenseError;
    if (!expense) {
        return {
            error: expenseId ? 'Ese cobro no pertenece a tu unidad.' : `Tu unidad no tiene un gasto común emitido para ${month}.`,
            status: 404,
        };
    }

    const { data: unit } = await admin.from('units').select('number, tower').eq('id', input.unitId).maybeSingle();
    const unitLabel = [unit?.tower, unit?.number].filter(Boolean).join(' ') || 'tu unidad';
    const { data: admins, error: adminError } = await admin.from('profiles')
        .select('id')
        .eq('community_id', input.communityId)
        .eq('role', 'admin');
    if (adminError) throw adminError;

    const bodyText = `${unitLabel} informa una transferencia de $${amount.toLocaleString('es-CL')} del ${paidAt}, comprobante ${reference}, para el gasto común ${expense.month}. Verifica el comprobante y regístralo en cobranza imputado a ese mes. El saldo no cambia hasta ese registro.`;
    const recipients = (admins ?? []).map(row => ({
        user_id: String(row.id),
        type: 'info',
        category: 'finance_transfer_report',
        title: 'Transferencia informada',
        body: bodyText,
        link: '/admin/finanzas/cobranza',
        community_id: input.communityId,
    }));
    if (recipients.length > 0) {
        const { error: notifyError } = await admin.from('notifications').insert(recipients);
        if (notifyError) throw notifyError;
    }

    return { reported: true, notified: recipients.length, month: String(expense.month), amount };
}
