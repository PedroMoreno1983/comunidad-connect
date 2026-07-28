/**
 * collectionService.ts — Recaudación: cargos individuales, pagos y estado de cuenta.
 *
 * Complementa a billingService (que emite el gasto común del mes) con la otra
 * mitad del ciclo del dinero: cobrar cosas puntuales (multas, extras), registrar
 * lo que efectivamente entró, y responder "¿cuánto debe esta unidad?" con una
 * cartola que arrastra saldo.
 *
 * Comparte BillingError con billingService para que los callers (endpoints HTTP
 * y tools de CoCo) traduzcan los errores esperados de una sola forma.
 */

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { BillingError, MONTH_PATTERN, DATE_PATTERN } from './billingService';
import {
    buildAccountStatement,
    calculateLateInterest,
    monthsBetween,
    type AccountStatement,
    type LedgerCharge,
    type LedgerPayment,
} from './ledger';

export const CHARGE_KINDS = new Set(['fine', 'interest', 'extraordinary', 'service', 'other']);
export const PAYMENT_METHODS = new Set(['transfer', 'cash', 'check', 'card', 'online', 'other']);

const CHARGE_KIND_LABELS: Record<string, string> = {
    fine: 'Multa',
    interest: 'Interés por mora',
    extraordinary: 'Cargo extraordinario',
    service: 'Servicio',
    other: 'Otro cargo',
};

export interface UnitChargeInput {
    unitId: string;
    month: string;
    kind: string;
    label: string;
    amount: number;
    dueDate?: string | null;
    notes?: string | null;
}

export interface UnitPaymentInput {
    unitId: string;
    amount: number;
    paidAt: string;
    method: string;
    reference?: string | null;
    notes?: string | null;
}

async function assertUnitBelongsToCommunity(communityId: string, unitId: string) {
    const { data } = await getSupabaseAdmin()
        .from('units')
        .select('id, number, tower, owner_id')
        .eq('id', unitId)
        .eq('community_id', communityId)
        .maybeSingle();
    if (!data) {
        throw new BillingError('unit_not_found', 'Esa unidad no existe en tu comunidad.', 404);
    }
    return data;
}

function unitLabel(row: { number?: unknown; tower?: unknown }) {
    const number = String(row.number ?? '');
    const tower = String(row.tower ?? '');
    return tower && tower !== 'A' ? `${tower}-${number}` : number;
}

/** Crea un cargo puntual (multa, extra) sobre una unidad. */
export async function addUnitCharge(
    communityId: string,
    createdBy: string | null,
    input: UnitChargeInput,
) {
    if (!MONTH_PATTERN.test(input.month)) {
        throw new BillingError('bad_month', 'Indica el mes en formato AAAA-MM.');
    }
    if (!CHARGE_KINDS.has(input.kind)) {
        throw new BillingError('bad_kind', 'Tipo de cargo no válido.');
    }
    if (!input.label.trim()) {
        throw new BillingError('bad_label', 'Escribe una descripción del cargo.');
    }
    const amount = Math.round(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new BillingError('bad_amount', 'El monto debe ser mayor que cero.');
    }
    if (input.dueDate && !DATE_PATTERN.test(input.dueDate)) {
        throw new BillingError('bad_due_date', 'La fecha de vencimiento debe ir en formato AAAA-MM-DD.');
    }

    const unit = await assertUnitBelongsToCommunity(communityId, input.unitId);
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
        .from('unit_charges')
        .insert({
            community_id: communityId,
            unit_id: input.unitId,
            month: input.month,
            kind: input.kind,
            label: input.label.trim(),
            amount,
            due_date: input.dueDate || null,
            notes: input.notes || null,
            created_by: createdBy,
        })
        .select('id, unit_id, month, kind, label, amount, status, due_date, created_at')
        .single();
    if (error) throw error;

    if (unit.owner_id) {
        // Informativo: si la notificación falla, el cargo sigue siendo válido.
        await admin.from('notifications').insert({
            user_id: String(unit.owner_id),
            type: 'warning',
            category: 'finance_charge',
            title: `${CHARGE_KIND_LABELS[input.kind] || 'Nuevo cargo'} en tu unidad`,
            body: `Se registró "${input.label.trim()}" por $${amount.toLocaleString('es-CL')} en tu unidad ${unitLabel(unit)}.`,
            link: '/resident/finances',
            community_id: communityId,
        }).then(() => undefined, () => undefined);
    }

    return data;
}

/** Anula un cargo. No se borra: queda trazado como 'cancelled'. */
export async function cancelUnitCharge(communityId: string, chargeId: string) {
    const admin = getSupabaseAdmin();
    const { data: charge } = await admin
        .from('unit_charges')
        .select('id, status')
        .eq('id', chargeId)
        .eq('community_id', communityId)
        .maybeSingle();
    if (!charge) throw new BillingError('charge_not_found', 'Cargo no encontrado.', 404);
    if (charge.status === 'paid') {
        throw new BillingError('charge_paid', 'Ese cargo ya fue pagado. No se puede anular sin descuadrar la caja.', 409);
    }

    const { error } = await admin
        .from('unit_charges')
        .update({ status: 'cancelled' })
        .eq('id', chargeId)
        .eq('community_id', communityId);
    if (error) throw error;
    return { ok: true };
}

/** Registra un pago recibido. Soporta pagos parciales y sin imputar. */
export async function recordPayment(
    communityId: string,
    recordedBy: string | null,
    input: UnitPaymentInput,
) {
    const amount = Math.round(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new BillingError('bad_amount', 'El monto del pago debe ser mayor que cero.');
    }
    if (!DATE_PATTERN.test(input.paidAt)) {
        throw new BillingError('bad_date', 'Indica la fecha de pago en formato AAAA-MM-DD.');
    }
    if (!PAYMENT_METHODS.has(input.method)) {
        throw new BillingError('bad_method', 'Medio de pago no válido.');
    }

    const unit = await assertUnitBelongsToCommunity(communityId, input.unitId);
    const admin = getSupabaseAdmin();
    const reference = input.reference?.trim() || null;

    const { data, error } = await admin
        .from('unit_payments')
        .insert({
            community_id: communityId,
            unit_id: input.unitId,
            amount,
            paid_at: input.paidAt,
            method: input.method,
            reference,
            notes: input.notes || null,
            recorded_by: recordedBy,
        })
        .select('id, unit_id, amount, paid_at, method, reference, created_at')
        .single();
    if (error) {
        // 23505 = unique_violation: el índice parcial sobre (comunidad, unidad,
        // referencia) impide registrar dos veces la misma transferencia.
        if ((error as { code?: string }).code === '23505') {
            throw new BillingError(
                'duplicate_reference',
                `Ya existe un pago registrado con la referencia "${reference}" para esa unidad.`,
                409,
            );
        }
        throw error;
    }

    // Con el pago nuevo el saldo puede haber quedado en cero: en ese caso se
    // marcan como pagadas las cuotas y cargos pendientes de la unidad, para que
    // la vista de morosidad no siga mostrándola en rojo.
    await reconcileUnitStatuses(communityId, input.unitId);

    if (unit.owner_id) {
        await admin.from('notifications').insert({
            user_id: String(unit.owner_id),
            type: 'success',
            category: 'finance_payment',
            title: 'Pago registrado',
            body: `La administración registró tu pago de $${amount.toLocaleString('es-CL')} con fecha ${input.paidAt}.`,
            link: '/resident/finances',
            community_id: communityId,
        }).then(() => undefined, () => undefined);
    }

    return data;
}

export async function deletePayment(communityId: string, paymentId: string) {
    const admin = getSupabaseAdmin();
    const { data: existing } = await admin
        .from('unit_payments')
        .select('id, unit_id')
        .eq('id', paymentId)
        .eq('community_id', communityId)
        .maybeSingle();
    if (!existing) throw new BillingError('payment_not_found', 'Pago no encontrado.', 404);

    const { error } = await admin
        .from('unit_payments')
        .delete()
        .eq('id', paymentId)
        .eq('community_id', communityId);
    if (error) throw error;

    await reconcileUnitStatuses(communityId, String(existing.unit_id));
    return { ok: true };
}

/**
 * Ajusta el status de cuotas y cargos según lo efectivamente pagado.
 *
 * Los pagos se imputan a la deuda más antigua primero, que es el criterio
 * habitual en copropiedad y el que menos perjudica al residente (deja de estar
 * moroso por lo más viejo, que es lo que devenga interés).
 */
export async function reconcileUnitStatuses(communityId: string, unitId: string) {
    const admin = getSupabaseAdmin();
    const [expensesResult, chargesResult, paymentsResult] = await Promise.all([
        admin.from('expenses')
            .select('id, month, amount, status, due_date, created_at')
            .eq('community_id', communityId).eq('unit_id', unitId),
        admin.from('unit_charges')
            .select('id, month, amount, status, due_date, created_at')
            .eq('community_id', communityId).eq('unit_id', unitId).neq('status', 'cancelled'),
        admin.from('unit_payments')
            .select('amount')
            .eq('community_id', communityId).eq('unit_id', unitId),
    ]);
    if (expensesResult.error) throw expensesResult.error;
    if (chargesResult.error) throw chargesResult.error;
    if (paymentsResult.error) throw paymentsResult.error;

    const totalPaid = (paymentsResult.data ?? [])
        .reduce((sum, row) => sum + Math.round(Number(row.amount || 0)), 0);

    const debts = [
        ...(expensesResult.data ?? []).map(row => ({
            table: 'expenses' as const,
            id: String(row.id),
            amount: Math.round(Number(row.amount || 0)),
            status: String(row.status),
            sortKey: String(row.due_date || row.created_at || ''),
        })),
        ...(chargesResult.data ?? []).map(row => ({
            table: 'unit_charges' as const,
            id: String(row.id),
            amount: Math.round(Number(row.amount || 0)),
            status: String(row.status),
            sortKey: String(row.due_date || row.created_at || ''),
        })),
    ].sort((left, right) => left.sortKey.localeCompare(right.sortKey));

    let remaining = totalPaid;
    const today = new Date().toISOString().slice(0, 10);

    for (const debt of debts) {
        const covered = remaining >= debt.amount;
        remaining = Math.max(0, remaining - debt.amount);

        if (debt.table === 'expenses') {
            // 'overdue' se conserva como señal de mora para la vista de cobranza:
            // una cuota impaga y vencida no es lo mismo que una simplemente pendiente.
            const next = covered
                ? 'paid'
                : (debts.find(d => d.id === debt.id)!.sortKey || today) < today ? 'overdue' : 'pending';
            if (next !== debt.status) {
                await admin.from('expenses')
                    .update({ status: next, paid_at: covered ? new Date().toISOString() : null })
                    .eq('id', debt.id);
            }
        } else {
            const next = covered ? 'paid' : 'pending';
            if (next !== debt.status) {
                await admin.from('unit_charges').update({ status: next }).eq('id', debt.id);
            }
        }
    }
}

/** Estado de cuenta de una unidad: cargos, pagos y saldo arrastrado. */
export async function getUnitStatement(
    communityId: string,
    unitId: string,
): Promise<AccountStatement & { unitLabel: string }> {
    const unit = await assertUnitBelongsToCommunity(communityId, unitId);
    const admin = getSupabaseAdmin();

    const [expensesResult, chargesResult, paymentsResult] = await Promise.all([
        admin.from('expenses')
            .select('id, month, amount, due_date, created_at')
            .eq('community_id', communityId).eq('unit_id', unitId),
        admin.from('unit_charges')
            .select('id, month, kind, label, amount, due_date, created_at')
            .eq('community_id', communityId).eq('unit_id', unitId).neq('status', 'cancelled'),
        admin.from('unit_payments')
            .select('id, amount, paid_at, method, reference, created_at')
            .eq('community_id', communityId).eq('unit_id', unitId),
    ]);
    if (expensesResult.error) throw expensesResult.error;
    if (chargesResult.error) throw chargesResult.error;
    if (paymentsResult.error) throw paymentsResult.error;

    const charges: LedgerCharge[] = [
        ...(expensesResult.data ?? []).map(row => ({
            id: String(row.id),
            kind: 'gasto_comun' as const,
            label: `Gasto común ${row.month}`,
            amount: Number(row.amount || 0),
            month: String(row.month),
            dueDate: row.due_date ? String(row.due_date) : null,
            createdAt: String(row.created_at),
        })),
        ...(chargesResult.data ?? []).map(row => ({
            id: String(row.id),
            kind: String(row.kind) as LedgerCharge['kind'],
            label: String(row.label),
            amount: Number(row.amount || 0),
            month: String(row.month),
            dueDate: row.due_date ? String(row.due_date) : null,
            createdAt: String(row.created_at),
        })),
    ];

    const payments: LedgerPayment[] = (paymentsResult.data ?? []).map(row => ({
        id: String(row.id),
        amount: Number(row.amount || 0),
        paidAt: String(row.paid_at),
        method: String(row.method),
        reference: row.reference ? String(row.reference) : null,
        createdAt: String(row.created_at),
    }));

    return { ...buildAccountStatement(charges, payments), unitLabel: unitLabel(unit) };
}

/** Resumen de saldos de todas las unidades: la vista de cobranza del admin. */
export async function getCommunityBalances(communityId: string) {
    const admin = getSupabaseAdmin();
    const { data: units, error } = await admin
        .from('units')
        .select('id, number, tower, owner_id')
        .eq('community_id', communityId)
        .order('number', { ascending: true });
    if (error) throw error;

    const balances = await Promise.all((units ?? []).map(async unit => {
        const statement = await getUnitStatement(communityId, String(unit.id));
        return {
            unitId: String(unit.id),
            label: unitLabel(unit),
            hasOwner: Boolean(unit.owner_id),
            balance: statement.balance,
            overdueAmount: statement.overdueAmount,
            oldestOverdueMonth: statement.oldestOverdueMonth,
            totalCharged: statement.totalCharged,
            totalPaid: statement.totalPaid,
        };
    }));

    return {
        units: balances,
        totalDebt: balances.reduce((sum, unit) => sum + Math.max(0, unit.balance), 0),
        totalOverdue: balances.reduce((sum, unit) => sum + unit.overdueAmount, 0),
        unitsWithDebt: balances.filter(unit => unit.balance > 0).length,
        unitsOverdue: balances.filter(unit => unit.overdueAmount > 0).length,
    };
}

/**
 * Genera los cargos de interés por mora del periodo indicado.
 *
 * Requiere que la comunidad tenga tasa configurada: sin decisión explícita del
 * administrador no se le cobra interés a nadie. Idempotente por el índice único
 * (source_expense_id, month), así reintentar no apila intereses.
 */
export async function applyLateInterest(
    communityId: string,
    createdBy: string | null,
    month: string,
) {
    if (!MONTH_PATTERN.test(month)) {
        throw new BillingError('bad_month', 'Indica el mes en formato AAAA-MM.');
    }

    const admin = getSupabaseAdmin();
    const { data: community } = await admin
        .from('communities')
        .select('late_interest_monthly_rate')
        .eq('id', communityId)
        .maybeSingle();

    const rate = Number(community?.late_interest_monthly_rate || 0);
    if (rate <= 0) {
        throw new BillingError(
            'no_interest_rate',
            'Tu comunidad no tiene configurada una tasa de interés por mora, así que no se aplicó ningún cargo.',
        );
    }

    const { data: overdue, error } = await admin
        .from('expenses')
        .select('id, unit_id, month, amount, status')
        .eq('community_id', communityId)
        .neq('status', 'paid')
        .lt('month', month);
    if (error) throw error;

    const applied: Array<{ unitId: string; expenseId: string; amount: number; monthsLate: number }> = [];

    for (const expense of overdue ?? []) {
        const monthsLate = monthsBetween(String(expense.month), month);
        const interest = calculateLateInterest(Number(expense.amount || 0), rate, monthsLate);
        if (interest <= 0) continue;

        const { error: insertError } = await admin.from('unit_charges').insert({
            community_id: communityId,
            unit_id: expense.unit_id,
            month,
            kind: 'interest',
            label: `Interés por mora ${expense.month} (${monthsLate} ${monthsLate === 1 ? 'mes' : 'meses'} al ${rate}%)`,
            amount: interest,
            source_expense_id: expense.id,
            created_by: createdBy,
        });

        // 23505 = ya existía el interés de esa cuota para este mes. Es el
        // comportamiento idempotente esperado, no un error.
        if (insertError && (insertError as { code?: string }).code !== '23505') throw insertError;
        if (!insertError) {
            applied.push({
                unitId: String(expense.unit_id),
                expenseId: String(expense.id),
                amount: interest,
                monthsLate,
            });
        }
    }

    return {
        month,
        rate,
        chargesCreated: applied.length,
        totalInterest: applied.reduce((sum, item) => sum + item.amount, 0),
    };
}
