/**
 * reconciliationService.ts — Conciliación bancaria contra los pagos registrados.
 *
 * Trae los movimientos de la cartola y los pagos aún no conciliados, sugiere
 * emparejamientos con la lógica pura de reconciliation.ts, y permite confirmarlos
 * (o deshacerlos) uno a uno o en lote. Comparte BillingError con el resto del
 * módulo financiero.
 */

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { BankTransactionInput, DepositUnitCandidate, FinanceAllocationDebt, FinancePageLoader } from '@/lib/types';
import { planBankImport, type BankIdentityRow } from './bankImportIdentity';
import { BillingError, DATE_PATTERN } from './billingService';
import { deletePayment, recordPayment } from './collectionService';
import { suggestDeposits, suggestUnitMatches } from './depositMatch';
import { allocateUnitPayments, legacySettlements } from './paymentAllocation';
import { signedChargeAmount } from './adjustments';
import {
    summarize,
} from './reconciliation';

function unitLabel(row: { number?: unknown; tower?: unknown }) {
    const number = String(row.number ?? '');
    const tower = String(row.tower ?? '');
    return tower && tower !== 'A' ? `${tower}-${number}` : number;
}

async function readAll<T>(load: FinancePageLoader<T>) {
    const data: T[] = [];
    for (let offset = 0; ; offset += 500) {
        const page = await load(offset, offset + 499);
        if (page.error) throw page.error;
        data.push(...(page.data ?? []));
        if ((page.data?.length ?? 0) < 500) return { data, error: null };
    }
}

/** Movimientos de la cartola + pagos sin conciliar + sugerencias + resumen. */
export async function getReconciliation(communityId: string) {
    const admin = getSupabaseAdmin();

    const [txnResult, paymentsResult, unitsResult, expensesResult, chargesResult] = await Promise.all([
        readAll((start, end) => admin.from('bank_transactions')
            .select('id, txn_date, amount, description, reference, status, matched_payment_id, created_at')
            .eq('community_id', communityId)
            .order('id').range(start, end)),
        readAll((start, end) => admin.from('unit_payments')
            .select('id, unit_id, amount, paid_at, method, reference, expense_id, charge_id')
            .eq('community_id', communityId)
            .order('id').range(start, end)),
        readAll((start, end) => admin.from('units')
            .select('id, number, tower')
            .eq('community_id', communityId).order('id').range(start, end)),
        readAll((start, end) => admin.from('expenses')
            .select('id, unit_id, month, amount, status, due_date, created_at, payment_metadata')
            .eq('community_id', communityId).order('id').range(start, end)),
        readAll((start, end) => admin.from('unit_charges').select('id, unit_id, amount, kind, label, notes, due_date, created_at')
            .eq('community_id', communityId).neq('status', 'cancelled').order('id').range(start, end)),
    ]);
    if (txnResult.error) throw txnResult.error;
    if (paymentsResult.error) throw paymentsResult.error;
    if (unitsResult.error) throw unitsResult.error;
    if (expensesResult.error) throw expensesResult.error;
    if (chargesResult.error) throw chargesResult.error;

    const transactions = [...txnResult.data].sort((a, b) => String(b.txn_date).localeCompare(String(a.txn_date)) || String(a.id).localeCompare(String(b.id)));
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

    const units: DepositUnitCandidate[] = (unitsResult.data ?? []).map(unit => ({
        id: String(unit.id),
        number: String(unit.number ?? ''),
        tower: String(unit.tower ?? ''),
    }));
    const movements = transactions.filter(txn => txn.status === 'pending' && Number(txn.amount) > 0).map(txn => ({
        id: String(txn.id), amount: Math.round(Number(txn.amount)), date: String(txn.txn_date),
        description: String(txn.description || ''), reference: txn.reference ? String(txn.reference) : null,
    }));
    const suggestions = suggestUnitMatches(movements, unmatchedPayments, units);
    const openCharges = units.flatMap(unit => {
        const expenses = (expensesResult.data ?? []).filter(row => row.unit_id === unit.id);
        const charges = (chargesResult.data ?? []).filter(row => row.unit_id === unit.id);
        const payments = (paymentsResult.data ?? []).filter(row => row.unit_id === unit.id).map(row => ({
            amount: Number(row.amount), expenseId: row.expense_id, chargeId: row.charge_id,
        }));
        const debts: FinanceAllocationDebt[] = [
            ...expenses.map(row => ({ id: String(row.id), kind: 'expense' as const, amount: Number(row.amount), date: String(row.due_date || row.created_at) })),
            ...charges.map(row => ({ id: String(row.id), kind: 'charge' as const, amount: signedChargeAmount(row), date: String(row.due_date || row.created_at) })),
        ];
        const settlements = legacySettlements(expenses, debts, payments);
        const remaining = allocateUnitPayments(debts.map(debt => ({ ...debt, settledAmount: debt.kind === 'expense' ? settlements.get(debt.id) : 0 })), payments);
        return expenses.map(row => ({ id: String(row.id), unitId: unit.id, month: String(row.month), amount: remaining.get(`expense:${row.id}`) || 0 })).filter(row => row.amount > 0);
    });
    const depositSuggestions = suggestDeposits(movements, units, openCharges, unmatchedPayments,
        new Set(suggestions.map(item => item.transactionId)), new Set(suggestions.map(item => item.paymentId)));

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
        depositSuggestions,
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
    if (rows.length > 500) throw new BillingError('too_many_rows', 'La cartola supera 500 movimientos.');

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
            import_key: typeof row.importKey === 'string' && /^[a-f0-9]{64}$/.test(row.importKey) ? row.importKey : null,
            created_by: createdBy,
        };
    });

    // La clave del archivo hace idempotente una recarga. Las filas anteriores,
    // guardadas sin clave, se adoptan una vez. El índice viejo por referencia
    // ya no debe impedir que otra cartola traiga el mismo número de operación.
    const admin = getSupabaseAdmin();
    const dates = [...new Set(clean.map(row => row.txn_date))];
    const known: BankIdentityRow[] = [];
    for (let dateOffset = 0; dateOffset < dates.length; dateOffset += 40) {
        for (let page = 0; ; page += 1) {
            const existing = await admin.from('bank_transactions')
                .select('id, txn_date, amount, description, reference, import_key')
                .eq('community_id', communityId)
                .in('txn_date', dates.slice(dateOffset, dateOffset + 40))
                .order('id')
                .range(page * 1000, page * 1000 + 999);
            if (existing.error) throw existing.error;
            known.push(...(existing.data ?? []).map(row => ({
                id: String(row.id),
                txnDate: String(row.txn_date),
                amount: Math.round(Number(row.amount)),
                description: String(row.description ?? ''),
                reference: row.reference ? String(row.reference) : null,
                importKey: row.import_key ? String(row.import_key) : null,
            })));
            if ((existing.data?.length ?? 0) < 1000) break;
        }
    }
    const claimed = new Set<string>();
    let imported = 0;
    let skippedDuplicates = 0;
    const pending: typeof clean = [];
    for (const row of clean) {
        const plan = planBankImport({
            txnDate: row.txn_date, amount: row.amount, description: row.description,
            reference: row.reference, importKey: row.import_key,
        }, known, claimed);
        if (plan.kind === 'skip') { skippedDuplicates += 1; continue; }
        if (plan.kind === 'adopt') {
            claimed.add(plan.id);
            const adopted = await admin.from('bank_transactions')
                .update({ import_key: row.import_key })
                .eq('id', plan.id)
                .eq('community_id', communityId)
                .is('import_key', null)
                .select('id');
            if (adopted.error) {
                if (adopted.error.code === '23505') { skippedDuplicates += 1; continue; }
                throw adopted.error;
            }
            if ((adopted.data ?? []).length > 0) {
                const target = known.find(item => item.id === plan.id);
                if (target) target.importKey = row.import_key;
                skippedDuplicates += 1;
                continue;
            }
        }
        pending.push(row);
        known.push({
            id: `pending-${pending.length}`,
            txnDate: row.txn_date,
            amount: row.amount,
            description: row.description,
            reference: row.reference,
            importKey: row.import_key ?? 'pending-manual',
        });
    }
    for (let offset = 0; offset < pending.length; offset += 20) {
        const batch = pending.slice(offset, offset + 20);
        const inserted = await admin.from('bank_transactions').insert(batch);
        if (!inserted.error) { imported += batch.length; continue; }
        if (inserted.error.code !== '23505') throw inserted.error;
        const outcomes = await Promise.all(batch.map(row => admin.from('bank_transactions').insert(row)));
        for (const outcome of outcomes) {
            if (!outcome.error) imported += 1;
            else if (outcome.error.code === '23505') skippedDuplicates += 1;
            else throw outcome.error;
        }
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
            .select('id, amount')
            .eq('id', paymentId).eq('community_id', communityId).maybeSingle(),
    ]);
    if (txnResult.error) throw txnResult.error;
    if (paymentResult.error) throw paymentResult.error;
    if (!txnResult.data) throw new BillingError('txn_not_found', 'Movimiento no encontrado.', 404);
    if (!paymentResult.data) throw new BillingError('payment_not_found', 'Pago no encontrado.', 404);
    if (txnResult.data.status === 'matched') {
        throw new BillingError('already_matched', 'Ese movimiento ya estaba conciliado.', 409);
    }
    if (Number(txnResult.data.amount) <= 0) {
        throw new BillingError('not_an_inflow', 'Solo los ingresos se concilian contra pagos.', 400);
    }

    if (Math.round(Number(txnResult.data.amount)) !== Math.round(Number(paymentResult.data.amount))) {
        throw new BillingError('amount_mismatch', 'El monto del movimiento y del pago debe coincidir.', 409);
    }
    const { data: matched, error } = await admin
        .from('bank_transactions')
        .update({ status: 'matched', matched_payment_id: paymentId })
        .eq('id', transactionId)
        .eq('community_id', communityId)
        .eq('status', 'pending')
        .select('id');
    if (error) {
        // El índice único sobre matched_payment_id impide conciliar el mismo pago
        // con dos movimientos distintos.
        if ((error as { code?: string }).code === '23505') {
            throw new BillingError('payment_taken', 'Ese pago ya está conciliado con otro movimiento.', 409);
        }
        throw error;
    }
    if (!matched?.length) throw new BillingError('already_changed', 'El movimiento cambió. Actualiza la cartola.', 409);
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

/**
 * Registra el abono en la unidad que nombra la glosa y lo concilia.
 * El monto y el mes salen del movimiento y de la propuesta vigente, no del
 * cliente. Si el cruce con la cartola falla, el pago se revierte.
 */
export async function recordSuggestedDeposit(communityId: string, recordedBy: string | null, transactionId: string, expenseId?: string) {
    const snapshot = await getReconciliation(communityId);
    const suggestion = snapshot.depositSuggestions.find(item => item.transactionId === transactionId && item.kind === 'record');
    const txn = snapshot.transactions.find(item => item.id === transactionId);
    if (!suggestion || !txn || txn.status !== 'pending' || txn.amount <= 0) {
        throw new BillingError('no_suggestion', 'Ese abono ya no tiene una unidad propuesta. Revisa la glosa o elige el pago a mano.', 409);
    }

    const targetId = expenseId || suggestion.expenseId;
    if (suggestion.openCharges.length && !suggestion.openCharges.some(charge => charge.id === targetId)) {
        throw new BillingError('choose_period', 'Elige el mes al que corresponde este abono.', 409);
    }
    const payment = await recordPayment(communityId, recordedBy, {
        unitId: suggestion.unitId,
        amount: txn.amount,
        paidAt: txn.txnDate,
        method: 'transfer',
        reference: `cartola-${transactionId}`,
        notes: [txn.description, txn.reference].filter(Boolean).join(" · ") || null,
        expenseId: targetId,
    }, { notify: false });

    try {
        await matchTransaction(communityId, transactionId, String(payment.id));
    } catch (error) {
        await deletePayment(communityId, String(payment.id));
        throw error;
    }
    return {
        ok: true,
        paymentId: String(payment.id),
        unitLabel: suggestion.unitLabel,
        month: suggestion.openCharges.find(charge => charge.id === targetId)?.month ?? null,
    };
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
