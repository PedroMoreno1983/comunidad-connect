/**
 * billingService.ts — Lógica de negocio del gasto común (egresos + prorrateo + emisión).
 *
 * Fuente única de verdad del DINERO: tanto los endpoints de administración
 * (/api/admin/community-expenses y /api/admin/billing) como las herramientas de
 * CoCo (lib/coco/tools.ts) llaman aquí, para no duplicar el cálculo ni los
 * guardas de seguridad en dos lugares.
 *
 * Las funciones lanzan BillingError para fallas esperadas (mes ya emitido, sin
 * egresos, descuadre, etc.); cada caller lo traduce a su transporte (HTTP o
 * texto de tool). Errores inesperados se propagan tal cual.
 */

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import {
    prorateExpenses,
    type ProrationExpense,
    type ProrationUnit,
    type ProrationResult,
} from './prorration';

export class BillingError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status = 400) {
        super(message);
        this.name = 'BillingError';
        this.code = code;
        this.status = status;
    }
}

export const EXPENSE_CATEGORIES = new Set(['water', 'electricity', 'salaries', 'maintenance', 'security', 'other']);
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface CommunityExpenseInput {
    month: string;
    label: string;
    amount: number;
    category?: string;
    prorateMethod?: 'share' | 'equal';
    provider?: string | null;
    notes?: string | null;
}

export interface BillingPreview {
    month: string;
    expenseCount: number;
    unitCount: number;
    totalExpenses: number;
    totalCharged: number;
    fellBackToEqualSplit: boolean;
    warnings: string[];
    units: ProrationResult['units'];
    issuedRun: IssuedRunSummary | null;
}

export interface IssuedRunSummary {
    id: string;
    month: string;
    status: string;
    total_amount: number;
    units_count: number;
    due_date: string;
    issued_at: string;
}

export interface BillingIssueResult {
    runId: string;
    month: string;
    issuedUnits: number;
    skippedUnits: string[];
    totalCharged: number;
    notified: number;
    fellBackToEqualSplit: boolean;
    warnings: string[];
}

/** Lanza BillingError 409 si el mes ya tiene una emisión vigente. */
async function assertNotIssued(communityId: string, month: string): Promise<void> {
    const { data } = await getSupabaseAdmin()
        .from('billing_runs')
        .select('id')
        .eq('community_id', communityId)
        .eq('month', month)
        .eq('status', 'issued')
        .maybeSingle();
    if (data) {
        throw new BillingError(
            'already_issued',
            `El gasto común de ${month} ya fue emitido. Anula la emisión antes de modificar los egresos.`,
            409,
        );
    }
}

/** Carga egresos + unidades del mes y los normaliza para el motor de prorrateo. */
async function loadProrationInputs(communityId: string, month: string) {
    const admin = getSupabaseAdmin();
    const [expensesResult, unitsResult] = await Promise.all([
        admin
            .from('community_expenses')
            .select('id, category, label, amount, prorate_method')
            .eq('community_id', communityId)
            .eq('month', month),
        admin
            .from('units')
            .select('id, number, tower, share_permille, owner_id')
            .eq('community_id', communityId)
            .order('number', { ascending: true }),
    ]);
    if (expensesResult.error) throw expensesResult.error;
    if (unitsResult.error) throw unitsResult.error;

    const expenses: ProrationExpense[] = (expensesResult.data ?? []).map(row => ({
        id: String(row.id),
        category: String(row.category || 'other'),
        label: String(row.label || 'Egreso'),
        amount: Number(row.amount || 0),
        prorateMethod: row.prorate_method === 'equal' ? 'equal' : 'share',
    }));

    const unitRows = unitsResult.data ?? [];
    const units: ProrationUnit[] = unitRows.map(row => ({
        id: String(row.id),
        label: row.tower && row.tower !== 'A' ? `${row.tower}-${row.number}` : String(row.number),
        sharePermille: row.share_permille === null || row.share_permille === undefined
            ? null
            : Number(row.share_permille),
    }));

    return { expenses, units, unitRows };
}

/** Egresos cargados del mes + total + si ya fue emitido. */
export async function listCommunityExpenses(communityId: string, month: string) {
    if (!MONTH_PATTERN.test(month)) {
        throw new BillingError('bad_month', 'Indica el mes en formato AAAA-MM.');
    }
    const admin = getSupabaseAdmin();
    const [expensesResult, runResult] = await Promise.all([
        admin
            .from('community_expenses')
            .select('id, month, category, label, amount, provider, notes, prorate_method, created_at')
            .eq('community_id', communityId)
            .eq('month', month)
            .order('created_at', { ascending: true }),
        admin
            .from('billing_runs')
            .select('id, month, status, total_amount, units_count, due_date, issued_at')
            .eq('community_id', communityId)
            .eq('month', month)
            .eq('status', 'issued')
            .maybeSingle(),
    ]);
    if (expensesResult.error) throw expensesResult.error;

    const expenses = expensesResult.data ?? [];
    return {
        month,
        expenses,
        total: expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0),
        issuedRun: (runResult.data ?? null) as IssuedRunSummary | null,
    };
}

/** Registra un egreso del edificio para un mes. Bloquea si el mes ya se emitió. */
export async function addCommunityExpense(
    communityId: string,
    createdBy: string | null,
    input: CommunityExpenseInput,
) {
    const month = String(input.month || '').trim();
    const label = String(input.label || '').trim().slice(0, 160);
    const category = String(input.category || 'other').trim() || 'other';
    const prorateMethod = input.prorateMethod === 'equal' ? 'equal' : 'share';
    const amount = Math.round(Number(input.amount));

    if (!MONTH_PATTERN.test(month)) throw new BillingError('bad_month', 'Indica el mes en formato AAAA-MM.');
    if (!label) throw new BillingError('bad_label', 'Escribe una descripción del egreso.');
    if (!EXPENSE_CATEGORIES.has(category)) throw new BillingError('bad_category', 'Categoría no válida.');
    if (!Number.isFinite(amount) || amount <= 0) throw new BillingError('bad_amount', 'El monto debe ser mayor que cero.');

    await assertNotIssued(communityId, month);

    const { data, error } = await getSupabaseAdmin()
        .from('community_expenses')
        .insert({
            community_id: communityId,
            month,
            category,
            label,
            amount,
            provider: (input.provider ? String(input.provider).trim().slice(0, 160) : null) || null,
            notes: (input.notes ? String(input.notes).trim().slice(0, 500) : null) || null,
            prorate_method: prorateMethod,
            created_by: createdBy,
        })
        .select('id, month, category, label, amount, provider, notes, prorate_method, created_at')
        .single();
    if (error) throw error;
    return data;
}

/** Elimina un egreso del mes, salvo que el mes ya esté emitido. */
export async function deleteCommunityExpense(communityId: string, expenseId: string) {
    const admin = getSupabaseAdmin();
    const { data: expense } = await admin
        .from('community_expenses')
        .select('id, month')
        .eq('id', expenseId)
        .eq('community_id', communityId)
        .maybeSingle();
    if (!expense) throw new BillingError('not_found', 'Egreso no encontrado.', 404);

    await assertNotIssued(communityId, expense.month);

    const { error } = await admin
        .from('community_expenses')
        .delete()
        .eq('id', expenseId)
        .eq('community_id', communityId);
    if (error) throw error;
    return { ok: true };
}

/** Previsualiza el reparto del gasto común del mes sin emitir nada. */
export async function previewBilling(communityId: string, month: string): Promise<BillingPreview> {
    if (!MONTH_PATTERN.test(month)) throw new BillingError('bad_month', 'Indica el mes en formato AAAA-MM.');

    const { expenses, units } = await loadProrationInputs(communityId, month);
    const result = prorateExpenses(expenses, units);

    const { data: issuedRun } = await getSupabaseAdmin()
        .from('billing_runs')
        .select('id, month, status, total_amount, units_count, due_date, issued_at')
        .eq('community_id', communityId)
        .eq('month', month)
        .eq('status', 'issued')
        .maybeSingle();

    return {
        month,
        expenseCount: expenses.length,
        unitCount: units.length,
        totalExpenses: result.totalExpenses,
        totalCharged: result.totalCharged,
        fellBackToEqualSplit: result.fellBackToEqualSplit,
        warnings: result.warnings,
        units: result.units,
        issuedRun: (issuedRun ?? null) as IssuedRunSummary | null,
    };
}

/**
 * Emite el gasto común del mes: crea el cobro de cada unidad con su desglose.
 * Nunca emite si el reparto no cuadra con el total de egresos.
 */
export async function issueBilling(
    communityId: string,
    issuedBy: string | null,
    month: string,
    dueDate: string,
): Promise<BillingIssueResult> {
    if (!MONTH_PATTERN.test(month)) throw new BillingError('bad_month', 'Indica el mes en formato AAAA-MM.');
    if (!DATE_PATTERN.test(dueDate)) throw new BillingError('bad_due_date', 'Indica la fecha de vencimiento en formato AAAA-MM-DD.');

    const admin = getSupabaseAdmin();

    await assertNotIssued(communityId, month);

    const { expenses, units, unitRows } = await loadProrationInputs(communityId, month);
    if (expenses.length === 0) throw new BillingError('no_expenses', 'No hay egresos cargados para ese mes.');
    if (units.length === 0) throw new BillingError('no_units', 'La comunidad no tiene unidades registradas.');

    const result = prorateExpenses(expenses, units);

    // Nunca emitir si el reparto no cuadra con el total de egresos: sería cobrar
    // de más o de menos sin poder explicar la diferencia.
    if (result.totalCharged !== result.totalExpenses) {
        throw new BillingError(
            'mismatch',
            'El prorrateo no cuadró con el total de egresos. No se emitió nada.',
            500,
        );
    }

    // Un cobro preexistente para esa unidad y mes (por ejemplo creado a mano
    // desde el Agent Center) se respeta: se omite y se informa, sin duplicar.
    const { data: existing } = await admin
        .from('expenses')
        .select('unit_id')
        .eq('community_id', communityId)
        .eq('month', month);
    const alreadyCharged = new Set((existing ?? []).map(row => String(row.unit_id)));

    const pending = result.units.filter(unit => unit.total > 0 && !alreadyCharged.has(unit.unitId));
    const skipped = result.units.filter(unit => alreadyCharged.has(unit.unitId));

    if (pending.length === 0) {
        throw new BillingError('all_charged', 'Todas las unidades ya tienen un cobro registrado para ese mes.', 409);
    }

    const { data: run, error: runError } = await admin
        .from('billing_runs')
        .insert({
            community_id: communityId,
            month,
            status: 'issued',
            total_amount: pending.reduce((sum, unit) => sum + unit.total, 0),
            units_count: pending.length,
            due_date: dueDate,
            fallback_equal_split: result.fellBackToEqualSplit,
            issued_by: issuedBy,
        })
        .select('id')
        .single();
    if (runError) throw runError;

    const { data: inserted, error: insertError } = await admin
        .from('expenses')
        .insert(pending.map(unit => ({
            unit_id: unit.unitId,
            community_id: communityId,
            month,
            amount: unit.total,
            status: 'pending',
            due_date: dueDate,
            billing_run_id: run.id,
        })))
        .select('id, unit_id');
    if (insertError) {
        // Sin la corrida huérfana el mes queda bloqueado para reintentar.
        await admin.from('billing_runs').delete().eq('id', run.id);
        throw insertError;
    }

    const expenseIdByUnit = new Map((inserted ?? []).map(row => [String(row.unit_id), String(row.id)]));
    const items = pending.flatMap(unit => {
        const expenseId = expenseIdByUnit.get(unit.unitId);
        if (!expenseId) return [];
        return unit.items.map(item => ({
            expense_id: expenseId,
            category: item.category,
            label: item.label,
            amount: item.amount,
        }));
    });
    if (items.length > 0) {
        // El desglose es informativo: si falla, el cobro sigue siendo válido.
        const { error: itemsError } = await admin.from('expense_items').insert(items);
        if (itemsError) console.warn('[billingService] expense_items insert failed:', itemsError);
    }

    const notifications = pending.flatMap(unit => {
        const ownerId = unitRows.find(row => String(row.id) === unit.unitId)?.owner_id;
        if (!ownerId) return [];
        return [{
            user_id: String(ownerId),
            type: 'warning',
            category: 'finance_charge',
            title: 'Nuevo gasto común disponible',
            body: `Tu gasto común de ${month} es $${unit.total.toLocaleString('es-CL')}, con vencimiento ${dueDate}.`,
            link: '/resident/finances',
            community_id: communityId,
        }];
    });
    if (notifications.length > 0) {
        await admin.from('notifications').insert(notifications).then(
            () => undefined,
            () => undefined,
        );
    }

    return {
        runId: run.id,
        month,
        issuedUnits: pending.length,
        skippedUnits: skipped.map(unit => unit.label),
        totalCharged: pending.reduce((sum, unit) => sum + unit.total, 0),
        notified: notifications.length,
        fellBackToEqualSplit: result.fellBackToEqualSplit,
        warnings: result.warnings,
    };
}

/** Anula una emisión, borrando los cobros generados salvo los ya pagados. */
export async function cancelBilling(communityId: string, runId: string) {
    const admin = getSupabaseAdmin();
    const { data: run } = await admin
        .from('billing_runs')
        .select('id, month, status')
        .eq('id', runId)
        .eq('community_id', communityId)
        .maybeSingle();
    if (!run) throw new BillingError('not_found', 'Emisión no encontrada.', 404);
    if (run.status !== 'issued') throw new BillingError('not_issued', 'Esa emisión ya estaba anulada.', 409);

    // Un cobro ya pagado no se puede borrar sin descuadrar la caja.
    const { data: paid } = await admin
        .from('expenses')
        .select('id')
        .eq('billing_run_id', runId)
        .eq('status', 'paid');
    if ((paid?.length ?? 0) > 0) {
        throw new BillingError(
            'has_paid',
            `No se puede anular: ${paid!.length} unidad(es) ya pagaron este gasto común. Corrige esos cobros individualmente.`,
            409,
        );
    }

    const { error: deleteError } = await admin.from('expenses').delete().eq('billing_run_id', runId);
    if (deleteError) throw deleteError;

    const { error: updateError } = await admin.from('billing_runs').update({ status: 'cancelled' }).eq('id', runId);
    if (updateError) throw updateError;

    return { ok: true, month: run.month };
}
