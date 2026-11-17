import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { BillingError, deleteCommunityExpense, listCommunityExpenses } from '@/lib/finance/billingService';
import { addUnitCharge, cancelUnitCharge, deletePayment, getUnitStatement } from '@/lib/finance/collectionService';

/**
 * Correcciones financieras de la administración por CoCo: ver la cuenta de una
 * unidad, agregar o anular un cargo, anular un pago registrado por error, y
 * ver o borrar un gasto de la comunidad mal ingresado.
 *
 * No hay lógica de dinero aquí: todo pasa por las mismas funciones que
 * /admin/finanzas (collectionService, billingService), con sus reglas (p. ej.
 * no se borra un gasto de un mes ya emitido). CoCo solo resuelve la unidad por
 * su número y traduce los errores.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
type Row = Record<string, unknown>;

function billingMessage(error: unknown, fallback: string) {
    return error instanceof BillingError ? error.message : fallback;
}

async function resolveUnit(admin: SupabaseClient, communityId: string, input: Record<string, unknown>) {
    const number = text(input.unit_number, 20);
    if (!number) return { error: 'Dime el número de departamento.' } as const;
    let query = admin.from('units').select('id, number, tower').eq('community_id', communityId).eq('number', number).limit(3);
    const tower = text(input.tower, 10);
    if (tower) query = query.eq('tower', tower);
    const { data, error } = await query;
    if (error) return { error: 'No pude buscar el departamento.' } as const;
    const units = (data ?? []) as Row[];
    if (!units.length) return { error: `No encontré el departamento ${number} en tu comunidad.` } as const;
    if (units.length > 1) return { error: `Hay más de un ${number} (distintas torres). Dime la torre.` } as const;
    return { unitId: String(units[0].id), label: [units[0].tower, units[0].number].filter(Boolean).join(' ') } as const;
}

export async function getUnitAccount(admin: SupabaseClient, communityId: string, input: Record<string, unknown>) {
    const unit = await resolveUnit(admin, communityId, input);
    if ('error' in unit) return unit;
    const statement = await getUnitStatement(communityId, unit.unitId);
    const recent = statement.entries.slice(-30);
    return {
        unidad: unit.label,
        saldo: statement.balance,
        vencido: statement.overdueAmount,
        cargos: recent.filter(e => e.kind !== 'payment').map(e => ({
            charge_id: e.id, tipo: e.kind, detalle: e.label, monto: e.amount, mes: e.month,
            // Solo los cargos extra se anulan con cancel_unit_charge: el gasto
            // común emitido se corrige anulando la emisión, y los históricos no.
            anulable: e.kind !== 'gasto_comun' && !e.id.startsWith('historical:'),
        })),
        pagos: recent.filter(e => e.kind === 'payment').map(e => ({ payment_id: e.id, monto: -e.amount, fecha: e.date, detalle: e.label, referencia: e.reference })),
    };
}

export async function addChargeForAdmin(admin: SupabaseClient, communityId: string, adminId: string, input: Record<string, unknown>) {
    const unit = await resolveUnit(admin, communityId, input);
    if ('error' in unit) return unit;
    try {
        await addUnitCharge(communityId, adminId, {
            unitId: unit.unitId,
            month: text(input.month, 7),
            kind: text(input.kind, 20) || 'other',
            label: text(input.label, 160),
            amount: Number(input.amount),
            dueDate: text(input.due_date, 10) || null,
            notes: text(input.notes, 500) || null,
        });
        return { success: true, message: `Cargué "${text(input.label, 160)}" por $${Number(input.amount).toLocaleString('es-CL')} a ${unit.label}. Aparece en su cuenta.` };
    } catch (error) {
        return { error: billingMessage(error, 'No se pudo registrar el cargo.') };
    }
}

export async function cancelChargeForAdmin(communityId: string, input: Record<string, unknown>) {
    const chargeId = text(input.charge_id, 36);
    if (!UUID.test(chargeId)) return { error: 'Necesito el charge_id que devuelve get_unit_account.' };
    try {
        await cancelUnitCharge(communityId, chargeId);
        return { success: true, message: 'Cargo anulado. Deja de sumar a la deuda de la unidad.' };
    } catch (error) {
        return { error: billingMessage(error, 'No se pudo anular el cargo.') };
    }
}

export async function deletePaymentForAdmin(communityId: string, input: Record<string, unknown>) {
    const paymentId = text(input.payment_id, 36);
    if (!UUID.test(paymentId)) return { error: 'Necesito el payment_id que devuelve get_unit_account.' };
    try {
        await deletePayment(communityId, paymentId);
        return { success: true, message: 'Pago anulado. La deuda de la unidad se recalculó.' };
    } catch (error) {
        return { error: billingMessage(error, 'No se pudo anular el pago.') };
    }
}

export async function listExpensesForAdmin(communityId: string, input: Record<string, unknown>) {
    try {
        const result = await listCommunityExpenses(communityId, text(input.month, 7));
        const expenses = (result.expenses ?? []) as Row[];
        return {
            mes: text(input.month, 7),
            // Con el mes emitido, los gastos ya no se borran (billingService lo impide).
            emitido: Boolean(result.issuedRun),
            gastos: expenses.map(e => ({ expense_id: e.id, detalle: e.label, categoria: e.category, monto: e.amount, proveedor: e.provider })),
        };
    } catch (error) {
        return { error: billingMessage(error, 'No pude cargar los gastos.') };
    }
}

export async function deleteExpenseForAdmin(communityId: string, input: Record<string, unknown>) {
    const expenseId = text(input.expense_id, 36);
    if (!UUID.test(expenseId)) return { error: 'Necesito el expense_id que devuelve list_community_expenses.' };
    try {
        await deleteCommunityExpense(communityId, expenseId);
        return { success: true, message: 'Gasto borrado del mes.' };
    } catch (error) {
        return { error: billingMessage(error, 'No se pudo borrar el gasto.') };
    }
}
