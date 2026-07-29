/**
 * reconciliationService.ts — Conciliación bancaria contra los pagos registrados.
 *
 * Trae los movimientos de la cartola y los pagos aún no conciliados, sugiere
 * emparejamientos con la lógica pura de reconciliation.ts, y permite confirmarlos
 * (o deshacerlos) uno a uno o en lote. Comparte BillingError con el resto del
 * módulo financiero.
 */

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { BillingError, DATE_PATTERN } from './billingService';
import {
    suggestMatches,
    summarize,
    type BankMovement,
    type RecordedPayment,
} from './reconciliation';

export interface BankTransactionInput {
    txnDate: string;
    amount: number;
    description?: string | null;
    reference?: string | null;
}

function unitLabel(row: { number?: unknown; tower?: unknown }) {
    const number = String(row.number ?? '');
    const tower = String(row.tower ?? '');
    return tower && tower !== 'A' ? `${tower}-${number}` : number;
}

/** Movimientos de la cartola + pagos sin conciliar + sugerencias + resumen. */
export async function getReconciliation(communityId: string) {
    const admin = getSupabaseAdmin();

    const [txnResult, paymentsResult, unitsResult] = await Promise.all([
        admin.from('bank_transactions')
            .select('id, txn_date, amount, description, reference, status, matched_payment_id, created_at')
            .eq('community_id', communityId)
            .order('txn_date', { ascending: false }),
        admin.from('unit_payments')
            .select('id, unit_id, amount, paid_at, method, reference')
            .eq('community_id', communityId)
            .order('paid_at', { ascending: false }),
        admin.from('units')
            .select('id, number, tower')
            .eq('community_id', communityId),
    ]);
    if (txnResult.error) throw txnResult.error;
    if (paymentsResult.error) throw paymentsResult.error;
    if (unitsResult.error) throw unitsResult.error;

    const transactions = txnResult.data ?? [];
    const unitById = new Map((unitsResult.data ?? []).map(u => [String(u.id), unitLabel(u)]));

    // Pagos ya conciliados con algún movimiento: no se ofrecen de nuevo.
    const matchedPaymentIds = new Set(
        transactions
            .filter(t => t.matched_payment_id)
            .map(t => String(t.matched_payment_id)),
    );

    const allPayments = (paymentsResult.data ?? []).map(p => ({
        id: String(p.id),
        unitId: String(p.unit_id),
        unitLabel: unitById.get(String(p.unit_id)) || '—',
        amount: Math.round(Number(p.amount || 0)),
        paidAt: String(p.paid_at),
        method: String(p.method),
        reference: p.reference ? String(p.reference) : null,
        matched: matchedPaymentIds.has(String(p.id)),
    }));

    const unmatchedPayments = allPayments.filter(p => !p.matched);

    // Sugerencias solo entre movimientos pendientes de ingreso y pagos libres.
    const pendingInflows: BankMovement[] = transactions
        .filter(t => t.status === 'pending' && Number(t.amount) > 0)
        .map(t => ({ id: String(t.id), amount: Number(t.amount), date: String(t.txn_date), reference: t.reference }));
    const freePayments: RecordedPayment[] = unmatchedPayments
        .map(p => ({ id: p.id, amount: p.amount, paidAt: p.paidAt, reference: p.reference }));

    const suggestions = suggestMatches(pendingInflows, freePayments);

    return {
        transactions: transactions.map(t => ({
            id: String(t.id),
            txnDate: String(t.txn_date),
            amount: Math.round(Number(t.amount || 0)),
            description: String(t.description || ''),
            reference: t.reference ? String(t.reference) : null,
            status: String(t.status),
            matchedPaymentId: t.matched_payment_id ? String(t.matched_payment_id) : null,
        })),
        unmatchedPayments,
        suggestions,
        summary: summarize(transactions.map(t => ({ amount: Number(t.amount || 0), status: String(t.status) }))),
    };
}

/** Importa (o agrega a mano) movimientos de la cartola. Ignora duplicados. */
export async function importBankTransactions(
    communityId: string,
    createdBy: string | null,
    rows: BankTransactionInput[],
) {
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new BillingError('no_rows', 'No hay movimientos para importar.');
    }

    const clean = rows.map((row, index) => {
        const txnDate = String(row.txnDate || '').trim();
        const amount = Math.round(Number(row.amount));
        if (!DATE_PATTERN.test(txnDate)) {
            throw new BillingError('bad_date', `Fila ${index + 1}: la fecha debe ir en formato AAAA-MM-DD.`);
        }
        if (!Number.isFinite(amount) || amount === 0) {
            throw new BillingError('bad_amount', `Fila ${index + 1}: el monto no puede ser cero.`);
        }
        return {
            community_id: communityId,
            txn_date: txnDate,
            amount,
            description: (row.description ? String(row.description).trim().slice(0, 300) : '') || '',
            reference: (row.reference ? String(row.reference).trim().slice(0, 120) : null) || null,
            created_by: createdBy,
        };
    });

    // Se inserta fila por fila y se saltan los duplicados por el código 23505:
    // el índice único de dedup es PARCIAL (solo cuando hay referencia), y Postgres
    // no acepta ON CONFLICT contra un índice parcial sin repetir su predicado, así
    // que un upsert con onConflict de columnas fallaba. Una cartola trae decenas
    // de filas, no miles, así que el costo es despreciable.
    const admin = getSupabaseAdmin();
    let imported = 0;
    let skippedDuplicates = 0;
    for (const row of clean) {
        const { error } = await admin.from('bank_transactions').insert(row);
        if (error) {
            if ((error as { code?: string }).code === '23505') { skippedDuplicates += 1; continue; }
            throw error;
        }
        imported += 1;
    }
    return { imported, skippedDuplicates };
}

/** Confirma que un movimiento del banco corresponde a un pago registrado. */
export async function matchTransaction(communityId: string, transactionId: string, paymentId: string) {
    const admin = getSupabaseAdmin();

    const [txnResult, paymentResult] = await Promise.all([
        admin.from('bank_transactions')
            .select('id, amount, status')
            .eq('id', transactionId).eq('community_id', communityId).maybeSingle(),
        admin.from('unit_payments')
            .select('id')
            .eq('id', paymentId).eq('community_id', communityId).maybeSingle(),
    ]);
    if (!txnResult.data) throw new BillingError('txn_not_found', 'Movimiento no encontrado.', 404);
    if (!paymentResult.data) throw new BillingError('payment_not_found', 'Pago no encontrado.', 404);
    if (txnResult.data.status === 'matched') {
        throw new BillingError('already_matched', 'Ese movimiento ya estaba conciliado.', 409);
    }
    if (Number(txnResult.data.amount) <= 0) {
        throw new BillingError('not_an_inflow', 'Solo los ingresos se concilian contra pagos.', 400);
    }

    const { error } = await admin
        .from('bank_transactions')
        .update({ status: 'matched', matched_payment_id: paymentId })
        .eq('id', transactionId)
        .eq('community_id', communityId);
    if (error) {
        // El índice único sobre matched_payment_id impide conciliar el mismo pago
        // con dos movimientos distintos.
        if ((error as { code?: string }).code === '23505') {
            throw new BillingError('payment_taken', 'Ese pago ya está conciliado con otro movimiento.', 409);
        }
        throw error;
    }
    return { ok: true };
}

/** Deshace una conciliación: el movimiento vuelve a quedar pendiente. */
export async function unmatchTransaction(communityId: string, transactionId: string) {
    const { error } = await getSupabaseAdmin()
        .from('bank_transactions')
        .update({ status: 'pending', matched_payment_id: null })
        .eq('id', transactionId)
        .eq('community_id', communityId);
    if (error) throw error;
    return { ok: true };
}

/** Marca un movimiento como ignorado (o lo devuelve a pendiente). */
export async function setTransactionIgnored(communityId: string, transactionId: string, ignored: boolean) {
    const admin = getSupabaseAdmin();
    const { data: txn } = await admin
        .from('bank_transactions')
        .select('status')
        .eq('id', transactionId).eq('community_id', communityId).maybeSingle();
    if (!txn) throw new BillingError('txn_not_found', 'Movimiento no encontrado.', 404);
    if (txn.status === 'matched') {
        throw new BillingError('is_matched', 'Ese movimiento está conciliado. Deshaz la conciliación primero.', 409);
    }
    const { error } = await admin
        .from('bank_transactions')
        .update({ status: ignored ? 'ignored' : 'pending', matched_payment_id: null })
        .eq('id', transactionId)
        .eq('community_id', communityId);
    if (error) throw error;
    return { ok: true };
}

/** Aplica todas las sugerencias inequívocas de una sola vez. */
export async function autoReconcile(communityId: string) {
    const { suggestions } = await getReconciliation(communityId);
    let applied = 0;
    for (const suggestion of suggestions) {
        try {
            await matchTransaction(communityId, suggestion.transactionId, suggestion.paymentId);
            applied += 1;
        } catch (error) {
            // Una carrera puede haber tomado el pago; se omite y sigue con el resto.
            if (error instanceof BillingError) continue;
            throw error;
        }
    }
    return { applied, suggested: suggestions.length };
}

/** Elimina un movimiento de la cartola (no un pago). */
export async function deleteBankTransaction(communityId: string, transactionId: string) {
    const { error } = await getSupabaseAdmin()
        .from('bank_transactions')
        .delete()
        .eq('id', transactionId)
        .eq('community_id', communityId);
    if (error) throw error;
    return { ok: true };
}
