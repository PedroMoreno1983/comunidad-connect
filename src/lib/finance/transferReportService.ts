import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { TransferReceipt, TransferReport, TransferReportInput, TransferReportRow } from '@/lib/types';
import { BillingError, DATE_PATTERN } from './billingService';
import { todayInChile } from './chileDates';
import { reconcileUnitStatuses } from './collectionService';

const admin = () => getSupabaseAdmin();

export async function listTransferReports(communityId: string, unitId?: string, reportId?: string, pendingOnly = false): Promise<TransferReport[]> {
    const reports: TransferReportRow[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
        let query = admin().from('transfer_reports')
            .select('id, unit_id, expense_id, amount, paid_at, reference, status, created_at, reviewed_at, review_note')
            .eq('community_id', communityId).order('created_at', { ascending: false })
            .range(offset, offset + pageSize - 1);
        if (unitId) query = query.eq('unit_id', unitId);
        if (reportId) query = query.eq('id', reportId);
        if (pendingOnly) query = query.eq('status', 'pending');
        const { data, error } = await query;
        if (error) throw error;
        reports.push(...(data ?? []) as TransferReportRow[]);
        if (!data || data.length < pageSize || reportId) break;
    }
    if (!reports.length) return [];

    const expenseIds = [...new Set(reports.map(row => String(row.expense_id)))];
    const unitIds = [...new Set(reports.map(row => String(row.unit_id)))];
    const reportIds = reports.map(row => String(row.id));
    const [expensesResult, unitsResult, paymentsResult] = await Promise.all([
        admin().from('expenses').select('id, month').in('id', expenseIds).eq('community_id', communityId),
        admin().from('units').select('id, number, tower').in('id', unitIds).eq('community_id', communityId),
        admin().from('unit_payments').select('id, transfer_report_id').in('transfer_report_id', reportIds).eq('community_id', communityId),
    ]);
    if (expensesResult.error) throw expensesResult.error;
    if (unitsResult.error) throw unitsResult.error;
    if (paymentsResult.error) throw paymentsResult.error;
    const months = new Map((expensesResult.data ?? []).map(row => [String(row.id), String(row.month)]));
    const labels = new Map((unitsResult.data ?? []).map(row => [String(row.id),
        row.tower && row.tower !== 'A' ? `${row.tower}-${row.number}` : String(row.number)]));
    const paymentIds = new Map((paymentsResult.data ?? []).map(row => [String(row.transfer_report_id), String(row.id)]));

    return reports.map(row => ({
        id: String(row.id), unitId: String(row.unit_id), unitLabel: labels.get(String(row.unit_id)) || 'Unidad',
        expenseId: String(row.expense_id), month: months.get(String(row.expense_id)) || '',
        amount: Number(row.amount), paidAt: String(row.paid_at), reference: String(row.reference),
        status: row.status as TransferReport['status'], createdAt: String(row.created_at),
        reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
        reviewNote: row.review_note ? String(row.review_note) : null,
        paymentId: paymentIds.get(String(row.id)) || null,
    }));
}

export async function submitTransferReport(
    communityId: string, unitId: string, userId: string, input: TransferReportInput,
): Promise<TransferReport> {
    const amount = Math.round(Number(input.amount));
    const reference = String(input.reference || '').trim();
    if (!Number.isFinite(amount) || amount <= 0) throw new BillingError('bad_amount', 'Indica un monto mayor que cero.');
    if (!DATE_PATTERN.test(input.paidAt) || input.paidAt > todayInChile()) {
        throw new BillingError('bad_date', 'Indica la fecha real de la transferencia.');
    }
    if (reference.length < 4 || reference.length > 120) {
        throw new BillingError('bad_reference', 'Indica el número de operación de la transferencia (4 a 120 caracteres).');
    }
    const { data: charge, error: chargeError } = await admin().from('expenses')
        .select('id, amount, status').eq('id', input.expenseId).eq('unit_id', unitId)
        .eq('community_id', communityId).maybeSingle();
    if (chargeError) throw chargeError;
    if (!charge || !['pending', 'overdue'].includes(String(charge.status))) {
        throw new BillingError('charge_unavailable', 'Ese cobro ya no está pendiente en tu unidad.', 409);
    }
    if (amount > Number(charge.amount)) {
        throw new BillingError('amount_exceeds_charge', 'El monto informado supera el cobro elegido.', 409);
    }
    const { data: existingPayment, error: paymentError } = await admin().from('unit_payments').select('id')
        .eq('community_id', communityId).eq('unit_id', unitId).eq('reference', reference).limit(1).maybeSingle();
    if (paymentError) throw paymentError;
    if (existingPayment) throw new BillingError('reference_recorded', 'Esa operación ya figura como pago registrado.', 409);

    const { data, error } = await admin().from('transfer_reports').insert({
        community_id: communityId, unit_id: unitId, expense_id: input.expenseId,
        reported_by: userId, amount, paid_at: input.paidAt, reference,
    }).select('id').single();
    if (error) {
        if (error.code === '23505') throw new BillingError('duplicate_reference', 'Esa operación ya fue informada.', 409);
        throw error;
    }
    const { data: managers } = await admin().from('profiles').select('id')
        .eq('community_id', communityId).eq('role', 'admin');
    if (managers?.length) {
        await admin().from('notifications').insert(managers.map(manager => ({
            user_id: manager.id, community_id: communityId, type: 'info',
            category: 'finance_payment', title: 'Transferencia por revisar',
            body: `Una unidad informó una transferencia de $${amount.toLocaleString('es-CL')}. Verifica el abono antes de confirmarlo.`,
            link: '/admin/finanzas/cobranza',
        }))).then(() => undefined, () => undefined);
    }
    const reports = await listTransferReports(communityId, unitId, String(data.id));
    return reports[0];
}

export async function reviewTransferReport(
    communityId: string, adminId: string, reportId: string,
    action: 'confirm' | 'reject', note: string,
): Promise<TransferReport> {
    const { data: report, error } = await admin().from('transfer_reports')
        .select('id, unit_id, reported_by, status').eq('id', reportId).eq('community_id', communityId).maybeSingle();
    if (error) throw error;
    if (!report) throw new BillingError('report_not_found', 'Aviso de transferencia no encontrado.', 404);
    if (report.status !== 'pending') throw new BillingError('already_reviewed', 'Este aviso ya fue revisado.', 409);

    if (action === 'reject') {
        if (note.trim().length < 5) throw new BillingError('missing_reason', 'Explica por qué no se confirmó la transferencia.');
        const { data: updated, error: updateError } = await admin().from('transfer_reports')
            .update({ status: 'rejected', reviewed_by: adminId, reviewed_at: new Date().toISOString(), review_note: note.trim().slice(0, 500) })
            .eq('id', reportId).eq('community_id', communityId).eq('status', 'pending').select('id').maybeSingle();
        if (updateError) throw updateError;
        if (!updated) throw new BillingError('already_reviewed', 'Este aviso ya fue revisado.', 409);
    } else {
        const { error: confirmError } = await admin().rpc('confirm_transfer_report', {
            p_report_id: reportId, p_admin_id: adminId, p_note: note.trim().slice(0, 500) || null,
        });
        if (confirmError) {
            if (confirmError.code === '23505') throw new BillingError('duplicate_payment', 'Ya existe un pago con ese número de operación.', 409);
            throw new BillingError('confirmation_failed', 'No se pudo confirmar el pago. Revisa el cobro y el monto antes de intentarlo nuevamente.', 409);
        }
        await reconcileUnitStatuses(communityId, String(report.unit_id));
    }
    await admin().from('notifications').insert({
        user_id: report.reported_by, community_id: communityId,
        type: action === 'confirm' ? 'success' : 'warning', category: 'finance_payment',
        title: action === 'confirm' ? 'Transferencia confirmada' : 'Transferencia no confirmada',
        body: action === 'confirm'
            ? 'La administración confirmó tu transferencia y actualizó tu cuenta.'
            : 'La administración revisó tu transferencia. Consulta el motivo en tus gastos comunes.',
        link: '/expenses',
    }).then(() => undefined, () => undefined);
    const reports = await listTransferReports(communityId, undefined, reportId);
    return reports[0];
}

export async function getTransferReceipt(
    communityId: string, unitId: string | null, reportId: string,
): Promise<TransferReceipt> {
    const { data: report, error } = await admin().from('transfer_reports')
        .select('id, unit_id, expense_id, amount, paid_at, reference, status, reviewed_at')
        .eq('id', reportId).eq('community_id', communityId).maybeSingle();
    if (error) throw error;
    if (!report || (unitId && String(report.unit_id) !== unitId)) {
        throw new BillingError('receipt_unavailable', 'Comprobante no disponible para tu unidad.', 403);
    }
    if (report.status !== 'confirmed') throw new BillingError('not_confirmed', 'La transferencia aún no está confirmada.', 409);
    const [paymentResult, chargeResult, unitResult] = await Promise.all([
        admin().from('unit_payments').select('id').eq('transfer_report_id', reportId).eq('community_id', communityId).maybeSingle(),
        admin().from('expenses').select('month').eq('id', report.expense_id).eq('community_id', communityId).maybeSingle(),
        admin().from('units').select('number, tower').eq('id', report.unit_id).eq('community_id', communityId).maybeSingle(),
    ]);
    if (paymentResult.error || chargeResult.error || unitResult.error) {
        throw paymentResult.error || chargeResult.error || unitResult.error;
    }
    if (!paymentResult.data || !chargeResult.data || !unitResult.data) {
        throw new BillingError('receipt_incomplete', 'No se encontró el pago confirmado para este comprobante.', 404);
    }
    const unit = unitResult.data;
    return {
        reportId, paymentId: String(paymentResult.data.id),
        unitLabel: unit.tower && unit.tower !== 'A' ? `${unit.tower}-${unit.number}` : String(unit.number),
        month: String(chargeResult.data.month), amount: Number(report.amount),
        paidAt: String(report.paid_at), reference: String(report.reference),
        reviewedAt: String(report.reviewed_at),
    };
}
