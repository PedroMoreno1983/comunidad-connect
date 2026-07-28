/**
 * reportingService.ts — Fondo de reserva y rendición de cuentas mensual.
 *
 * Cierra el ciclo contable básico: qué entró, qué salió, cuánto se debe y cómo
 * se movió el fondo de reserva. No es contabilidad de doble entrada (eso es un
 * proyecto aparte), pero es lo que un comité necesita leer y firmar cada mes.
 */

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { BillingError, MONTH_PATTERN } from './billingService';

export interface ReserveFundState {
    balance: number;
    totalContributions: number;
    totalWithdrawals: number;
    ratePercent: number;
    movements: Array<{
        id: string;
        kind: 'contribution' | 'withdrawal';
        amount: number;
        month: string;
        label: string;
        createdAt: string;
    }>;
}

export async function getReserveFund(communityId: string): Promise<ReserveFundState> {
    const admin = getSupabaseAdmin();
    const [movementsResult, communityResult] = await Promise.all([
        admin.from('reserve_fund_movements')
            .select('id, kind, amount, month, label, created_at')
            .eq('community_id', communityId)
            .order('created_at', { ascending: false })
            .limit(200),
        admin.from('communities').select('reserve_fund_rate').eq('id', communityId).maybeSingle(),
    ]);
    if (movementsResult.error) throw movementsResult.error;

    const movements = (movementsResult.data ?? []).map(row => ({
        id: String(row.id),
        kind: row.kind as 'contribution' | 'withdrawal',
        amount: Math.round(Number(row.amount || 0)),
        month: String(row.month),
        label: String(row.label),
        createdAt: String(row.created_at),
    }));

    const totalContributions = movements
        .filter(m => m.kind === 'contribution')
        .reduce((sum, m) => sum + m.amount, 0);
    const totalWithdrawals = movements
        .filter(m => m.kind === 'withdrawal')
        .reduce((sum, m) => sum + m.amount, 0);

    return {
        balance: totalContributions - totalWithdrawals,
        totalContributions,
        totalWithdrawals,
        ratePercent: Number(communityResult.data?.reserve_fund_rate || 0),
        movements,
    };
}

/** Registra un movimiento manual del fondo (aporte extraordinario o uso). */
export async function addReserveFundMovement(
    communityId: string,
    createdBy: string | null,
    input: { kind: 'contribution' | 'withdrawal'; amount: number; month: string; label: string; notes?: string | null },
) {
    if (!MONTH_PATTERN.test(input.month)) {
        throw new BillingError('bad_month', 'Indica el mes en formato AAAA-MM.');
    }
    if (input.kind !== 'contribution' && input.kind !== 'withdrawal') {
        throw new BillingError('bad_kind', 'El movimiento debe ser un aporte o un retiro.');
    }
    if (!input.label.trim()) {
        throw new BillingError('bad_label', 'Describe el movimiento del fondo.');
    }
    const amount = Math.round(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new BillingError('bad_amount', 'El monto debe ser mayor que cero.');
    }

    // Un retiro que deja el fondo en negativo casi siempre es un error de
    // digitación; y un fondo negativo no existe en la práctica.
    if (input.kind === 'withdrawal') {
        const fund = await getReserveFund(communityId);
        if (amount > fund.balance) {
            throw new BillingError(
                'insufficient_fund',
                `El fondo de reserva tiene $${fund.balance.toLocaleString('es-CL')}. No puedes retirar más que eso.`,
            );
        }
    }

    const { data, error } = await getSupabaseAdmin()
        .from('reserve_fund_movements')
        .insert({
            community_id: communityId,
            kind: input.kind,
            amount,
            month: input.month,
            label: input.label.trim(),
            notes: input.notes || null,
            created_by: createdBy,
        })
        .select('id, kind, amount, month, label, created_at')
        .single();
    if (error) throw error;
    return data;
}

export interface BudgetComparison {
    year: number;
    lines: Array<{
        category: string;
        categoryLabel: string;
        annualBudget: number;
        /** Presupuesto proporcional a los meses ya transcurridos del año. */
        expectedToDate: number;
        actualToDate: number;
        variance: number;
        variancePercent: number;
    }>;
    totals: { annualBudget: number; expectedToDate: number; actualToDate: number; variance: number };
    monthsElapsed: number;
}

/**
 * Presupuestado vs real del año.
 *
 * Compara contra el presupuesto proporcional a los meses transcurridos, no
 * contra el anual completo: en marzo haber gastado el 20% del presupuesto de
 * luz no es una desviación, es ir bien. Comparar contra el total anual haría
 * que todo pareciera "bajo presupuesto" hasta diciembre.
 */
export async function getBudgetComparison(communityId: string, year: number): Promise<BudgetComparison> {
    const admin = getSupabaseAdmin();
    const [budgetResult, expensesResult] = await Promise.all([
        admin.from('annual_budgets')
            .select('category, annual_amount')
            .eq('community_id', communityId).eq('year', year),
        admin.from('community_expenses')
            .select('category, amount, month')
            .eq('community_id', communityId)
            .gte('month', `${year}-01`).lte('month', `${year}-12`),
    ]);
    if (budgetResult.error) throw budgetResult.error;
    if (expensesResult.error) throw expensesResult.error;

    const now = new Date();
    const monthsElapsed = now.getFullYear() > year
        ? 12
        : now.getFullYear() < year ? 0 : now.getMonth() + 1;

    const actualByCategory = new Map<string, number>();
    for (const row of expensesResult.data ?? []) {
        const key = String(row.category || 'other');
        actualByCategory.set(key, (actualByCategory.get(key) || 0) + Math.round(Number(row.amount || 0)));
    }

    const budgetByCategory = new Map<string, number>();
    for (const row of budgetResult.data ?? []) {
        budgetByCategory.set(String(row.category), Math.round(Number(row.annual_amount || 0)));
    }

    // Se listan todas las categorías que tengan presupuesto O gasto real: un
    // gasto sin presupuesto es justamente lo que el comité quiere ver.
    const categories = new Set([...budgetByCategory.keys(), ...actualByCategory.keys()]);

    const lines = [...categories].map(category => {
        const annualBudget = budgetByCategory.get(category) || 0;
        const actualToDate = actualByCategory.get(category) || 0;
        const expectedToDate = Math.round((annualBudget / 12) * monthsElapsed);
        const variance = actualToDate - expectedToDate;
        return {
            category,
            categoryLabel: CATEGORY_LABELS[category] || category,
            annualBudget,
            expectedToDate,
            actualToDate,
            variance,
            variancePercent: expectedToDate > 0 ? Math.round((variance / expectedToDate) * 100) : 0,
        };
    }).sort((a, b) => b.actualToDate - a.actualToDate);

    const totals = lines.reduce((acc, line) => ({
        annualBudget: acc.annualBudget + line.annualBudget,
        expectedToDate: acc.expectedToDate + line.expectedToDate,
        actualToDate: acc.actualToDate + line.actualToDate,
        variance: acc.variance + line.variance,
    }), { annualBudget: 0, expectedToDate: 0, actualToDate: 0, variance: 0 });

    return { year, lines, totals, monthsElapsed };
}

/** Crea o actualiza la línea de presupuesto de una categoría. */
export async function setBudgetLine(
    communityId: string,
    createdBy: string | null,
    input: { year: number; category: string; annualAmount: number },
) {
    if (!Number.isInteger(input.year) || input.year < 2020 || input.year > 2100) {
        throw new BillingError('bad_year', 'Indica un año válido.');
    }
    if (!CATEGORY_LABELS[input.category]) {
        throw new BillingError('bad_category', 'Categoría no válida.');
    }
    const annualAmount = Math.round(Number(input.annualAmount));
    if (!Number.isFinite(annualAmount) || annualAmount < 0) {
        throw new BillingError('bad_amount', 'El monto no puede ser negativo.');
    }

    const { data, error } = await getSupabaseAdmin()
        .from('annual_budgets')
        .upsert({
            community_id: communityId,
            year: input.year,
            category: input.category,
            annual_amount: annualAmount,
            created_by: createdBy,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'community_id,year,category' })
        .select('id, year, category, annual_amount')
        .single();
    if (error) throw error;
    return data;
}

export interface MonthlyReport {
    month: string;
    /** Egresos del edificio cargados para el mes. */
    expenses: { total: number; byCategory: Array<{ category: string; total: number }> };
    /** Cobros emitidos y cargos individuales del mes. */
    charged: { gastoComun: number; otherCharges: number; total: number };
    /** Pagos efectivamente recibidos dentro del mes. */
    collected: { total: number; byMethod: Array<{ method: string; total: number }> };
    /** Diferencia entre lo cobrado y lo recaudado en el periodo. */
    collectionRate: number;
    reserveFund: { contributions: number; withdrawals: number; balance: number };
    result: number;
}

const CATEGORY_LABELS: Record<string, string> = {
    water: 'Agua',
    electricity: 'Electricidad',
    salaries: 'Remuneraciones',
    maintenance: 'Mantención',
    security: 'Seguridad',
    other: 'Otros',
};

const METHOD_LABELS: Record<string, string> = {
    transfer: 'Transferencia',
    cash: 'Efectivo',
    check: 'Cheque',
    card: 'Tarjeta',
    online: 'En línea',
    other: 'Otro',
};

/** Rendición de cuentas del mes: ingresos vs egresos para el comité. */
export async function getMonthlyReport(communityId: string, month: string): Promise<MonthlyReport> {
    if (!MONTH_PATTERN.test(month)) {
        throw new BillingError('bad_month', 'Indica el mes en formato AAAA-MM.');
    }

    const admin = getSupabaseAdmin();
    // Los pagos se filtran por fecha real de pago dentro del mes, no por el
    // periodo al que se imputan: la rendición responde "cuánta plata entró en
    // julio", que es lo que el comité cuadra contra la cartola del banco.
    const monthStart = `${month}-01`;
    const [year, mon] = month.split('-').map(Number);
    const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`;

    const [expensesResult, billedResult, chargesResult, paymentsResult, fundResult] = await Promise.all([
        admin.from('community_expenses')
            .select('category, amount').eq('community_id', communityId).eq('month', month),
        admin.from('expenses')
            .select('amount').eq('community_id', communityId).eq('month', month),
        admin.from('unit_charges')
            .select('amount').eq('community_id', communityId).eq('month', month).neq('status', 'cancelled'),
        admin.from('unit_payments')
            .select('amount, method').eq('community_id', communityId)
            .gte('paid_at', monthStart).lt('paid_at', nextMonth),
        admin.from('reserve_fund_movements')
            .select('kind, amount').eq('community_id', communityId),
    ]);
    if (expensesResult.error) throw expensesResult.error;
    if (billedResult.error) throw billedResult.error;
    if (chargesResult.error) throw chargesResult.error;
    if (paymentsResult.error) throw paymentsResult.error;
    if (fundResult.error) throw fundResult.error;

    const byCategoryMap = new Map<string, number>();
    let expensesTotal = 0;
    for (const row of expensesResult.data ?? []) {
        const amount = Math.round(Number(row.amount || 0));
        expensesTotal += amount;
        const key = String(row.category || 'other');
        byCategoryMap.set(key, (byCategoryMap.get(key) || 0) + amount);
    }

    const gastoComun = (billedResult.data ?? [])
        .reduce((sum, row) => sum + Math.round(Number(row.amount || 0)), 0);
    const otherCharges = (chargesResult.data ?? [])
        .reduce((sum, row) => sum + Math.round(Number(row.amount || 0)), 0);

    const byMethodMap = new Map<string, number>();
    let collectedTotal = 0;
    for (const row of paymentsResult.data ?? []) {
        const amount = Math.round(Number(row.amount || 0));
        collectedTotal += amount;
        const key = String(row.method || 'other');
        byMethodMap.set(key, (byMethodMap.get(key) || 0) + amount);
    }

    const fundContributions = (fundResult.data ?? [])
        .filter(row => row.kind === 'contribution')
        .reduce((sum, row) => sum + Math.round(Number(row.amount || 0)), 0);
    const fundWithdrawals = (fundResult.data ?? [])
        .filter(row => row.kind === 'withdrawal')
        .reduce((sum, row) => sum + Math.round(Number(row.amount || 0)), 0);

    const totalCharged = gastoComun + otherCharges;

    return {
        month,
        expenses: {
            total: expensesTotal,
            byCategory: [...byCategoryMap.entries()]
                .map(([category, total]) => ({ category: CATEGORY_LABELS[category] || category, total }))
                .sort((a, b) => b.total - a.total),
        },
        charged: { gastoComun, otherCharges, total: totalCharged },
        collected: {
            total: collectedTotal,
            byMethod: [...byMethodMap.entries()]
                .map(([method, total]) => ({ method: METHOD_LABELS[method] || method, total }))
                .sort((a, b) => b.total - a.total),
        },
        collectionRate: totalCharged > 0 ? Math.round((collectedTotal / totalCharged) * 100) : 0,
        reserveFund: {
            contributions: fundContributions,
            withdrawals: fundWithdrawals,
            balance: fundContributions - fundWithdrawals,
        },
        result: collectedTotal - expensesTotal,
    };
}
