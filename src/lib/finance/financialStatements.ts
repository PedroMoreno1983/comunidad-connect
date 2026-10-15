/**
 * Estados financieros del condominio: resultado, flujo de caja y situación.
 *
 * Se derivan de los registros operativos (cobros emitidos, cargos, pagos,
 * egresos y fondo de reserva), sin asientos de apertura. La caja parte del
 * saldo al inicio del año informado por administración; el siguiente año debe
 * tomar el saldo final del cierre anterior para no contar movimientos dos veces.
 *
 * El estado de situación cuadra por construcción: el excedente acumulado es lo
 * que queda del activo después de pasivos y fondo de reserva. Lo que lo hace
 * útil no es el cuadre sino ver juntas la caja, la deuda de las unidades y los
 * anticipos.
 */

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { FinancialStatements } from '@/lib/types';
import { BillingError } from './billingService';
import { fetchAllFinanceRows } from './billNotice';
import { getJournal } from './journalService';
import { isCommitteeDiscount } from './adjustments';
import { LEGAL_RESERVE_FUND, parseFundLabel } from './funds';
import { isParkingPayoutCredit } from '@/lib/parkingPayouts/payouts';
import { todayInChile } from './chileDates';

const CATEGORY_LABELS: Record<string, string> = {
    water: 'Agua',
    electricity: 'Electricidad',
    salaries: 'Remuneraciones',
    maintenance: 'Mantención',
    security: 'Seguridad',
    other: 'Otros',
};

export interface StatementInputs {
    year: number;
    /** Último mes incluido (AAAA-MM). Los meses posteriores del año quedan fuera. */
    cutoffMonth: string;
    openingCash: number;
    unitIds: string[];
    expenses: Array<{ unitId: string; month: string; amount: number }>;
    charges: Array<{ unitId: string; month: string; kind: string; amount: number; label?: string }>;
    /** nonCash: abono de una liquidación de estacionamiento (baja el saldo de la unidad, no entra al banco). */
    payments: Array<{ unitId: string; paidAt: string; amount: number; nonCash?: boolean }>;
    communityExpenses: Array<{ month: string; category: string; amount: number }>;
    reserveMovements: Array<{ month: string; kind: string; amount: number; label?: string }>;
    /**
     * Liquidaciones a dueños de estacionamientos ya entregadas (neto). El arriendo
     * entra completo como ingreso (cargo 'service'), pero solo la comisión es de
     * la comunidad: lo transferido o abonado al dueño es gasto. Una transferencia
     * además es salida de caja. Las donaciones al fondo de reserva no van aquí:
     * ya cuentan como aporte al fondo.
     */
    parkingPayouts?: Array<{ month: string; netAmount: number; kind: 'transfer' | 'credit' }>;
    /** Saldo de la cuenta 1100 Banco del libro de 4 cuentas. 0 si aún no hay asientos. */
    journalBank: number;
}

const PARKING_PAYOUTS_CATEGORY = 'parking_owner_payouts';

function monthOf(date: string): string {
    return date.slice(0, 7);
}

export function buildFinancialStatements(inputs: StatementInputs): FinancialStatements {
    const { year, cutoffMonth } = inputs;
    const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
        .filter(month => month <= cutoffMonth);
    const firstMonth = `${year}-01`;
    const inYear = (month: string) => month >= firstMonth && month <= cutoffMonth;
    const round = (value: number) => Math.round(value);

    const gastoComun = inputs.expenses.filter(row => inYear(row.month)).reduce((sum, row) => sum + round(row.amount), 0);
    const chargesBy = (kinds: string[]) => inputs.charges
        .filter(row => inYear(row.month) && kinds.includes(row.kind))
        .reduce((sum, row) => sum + round(row.amount), 0);
    const fines = chargesBy(['fine']);
    const interest = chargesBy(['interest']);
    const otherIncome = inputs.charges
        .filter(row => inYear(row.month) && ['extraordinary', 'service', 'other'].includes(row.kind) && !isCommitteeDiscount(row))
        .reduce((sum, row) => sum + round(row.amount), 0);
    const totalIncome = gastoComun + fines + interest + otherIncome;

    const byCategory = new Map<string, number>();
    for (const row of inputs.communityExpenses.filter(item => inYear(item.month))) {
        byCategory.set(row.category, (byCategory.get(row.category) || 0) + round(row.amount));
    }
    const parkingPayoutsInYear = (inputs.parkingPayouts ?? []).filter(row => inYear(row.month));
    const parkingPayoutTotal = parkingPayoutsInYear.reduce((sum, row) => sum + round(row.netAmount), 0);
    if (parkingPayoutTotal > 0) byCategory.set(PARKING_PAYOUTS_CATEGORY, parkingPayoutTotal);
    const expenseLines = [...byCategory.entries()]
        .map(([category, total]) => ({
            category,
            label: category === PARKING_PAYOUTS_CATEGORY ? 'Liquidaciones a dueños de estacionamientos' : CATEGORY_LABELS[category] || category,
            total,
        }))
        .sort((left, right) => right.total - left.total || left.category.localeCompare(right.category));
    const totalExpenses = expenseLines.reduce((sum, line) => sum + line.total, 0);
    const reserveTransfer = inputs.reserveMovements
        .filter(row => inYear(row.month) && row.kind === 'contribution' && parseFundLabel(row.label || '').fundName === LEGAL_RESERVE_FUND)
        .reduce((sum, row) => sum + round(row.amount), 0);

    const paymentsByMonth = new Map<string, number>();
    for (const row of inputs.payments) {
        if (row.nonCash) continue;
        paymentsByMonth.set(monthOf(row.paidAt), (paymentsByMonth.get(monthOf(row.paidAt)) || 0) + round(row.amount));
    }
    const expensesByMonth = new Map<string, number>();
    for (const row of inputs.communityExpenses) expensesByMonth.set(row.month, (expensesByMonth.get(row.month) || 0) + round(row.amount));
    // La transferencia al dueño sale del banco; el abono a su cuenta no.
    for (const row of inputs.parkingPayouts ?? []) {
        if (row.kind === 'transfer') expensesByMonth.set(row.month, (expensesByMonth.get(row.month) || 0) + round(row.netAmount));
    }

    const startingCash = inputs.openingCash;
    let running = startingCash;
    const cashFlow = months.map(month => {
        const inflow = paymentsByMonth.get(month) || 0;
        const outflow = expensesByMonth.get(month) || 0;
        running += inflow - outflow;
        return { month, inflow, outflow, net: inflow - outflow, closing: running };
    });

    const balances = new Map<string, number>(inputs.unitIds.map(id => [id, 0]));
    const bump = (unitId: string, amount: number) => balances.set(unitId, (balances.get(unitId) || 0) + amount);
    for (const row of inputs.expenses) if (row.month <= cutoffMonth) bump(row.unitId, round(row.amount));
    for (const row of inputs.charges) if (row.month <= cutoffMonth) {
        bump(row.unitId, isCommitteeDiscount(row) ? -round(row.amount) : round(row.amount));
    }
    for (const row of inputs.payments) if (monthOf(row.paidAt) <= cutoffMonth) bump(row.unitId, -round(row.amount));
    const receivables = [...balances.values()].reduce((sum, value) => sum + Math.max(0, value), 0);
    const advances = [...balances.values()].reduce((sum, value) => sum + Math.max(0, -value), 0);

    const sumThrough = (map: Map<string, number>, month: string) =>
        [...map.entries()].filter(([key]) => key >= firstMonth && key <= month).reduce((sum, [, value]) => sum + value, 0);
    const cash = inputs.openingCash
        + sumThrough(paymentsByMonth, cutoffMonth)
        - sumThrough(expensesByMonth, cutoffMonth);
    const reserveFund = inputs.reserveMovements
        .filter(row => row.month <= cutoffMonth && parseFundLabel(row.label || '').fundName === LEGAL_RESERVE_FUND)
        .reduce((sum, row) => sum + (row.kind === 'withdrawal' ? -1 : 1) * round(row.amount), 0);
    const totalAssets = cash + receivables;
    const accumulatedSurplus = totalAssets - advances - reserveFund;

    return {
        year,
        cutoffMonth,
        openingCash: inputs.openingCash,
        income: {
            lines: [
                { label: 'Gastos comunes emitidos', total: gastoComun },
                { label: 'Multas', total: fines },
                { label: 'Intereses por mora', total: interest },
                { label: 'Cargos extraordinarios y servicios', total: otherIncome },
            ],
            totalIncome,
            expenseLines,
            totalExpenses,
            reserveTransfer,
            result: totalIncome - totalExpenses - reserveTransfer,
        },
        cashFlow: {
            startingCash,
            months: cashFlow,
            totalInflow: cashFlow.reduce((sum, row) => sum + row.inflow, 0),
            totalOutflow: cashFlow.reduce((sum, row) => sum + row.outflow, 0),
            endingCash: running,
        },
        position: {
            cash,
            receivables,
            totalAssets,
            advances,
            totalLiabilities: advances,
            reserveFund,
            accumulatedSurplus,
            totalEquity: reserveFund + accumulatedSurplus,
            unitsWithDebt: [...balances.values()].filter(value => value > 0).length,
            journalBank: Math.round(inputs.journalBank),
        },
    };
}

export async function getFinancialStatements(
    communityId: string,
    year: number,
    options: { cutoffMonth: string; openingCash: number },
): Promise<FinancialStatements> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new BillingError('bad_year', 'Indica un año válido.');
    const admin = getSupabaseAdmin();
    const cutoff = options.cutoffMonth;

    const [units, expenses, charges, payments, communityExpenses, reserve, journal, parkingPayouts] = await Promise.all([
        fetchAllFinanceRows<{ id: string }>((from, to) =>
            admin.from('units').select('id').eq('community_id', communityId).order('id').range(from, to)),
        fetchAllFinanceRows<{ unit_id: string; month: string; amount: number }>((from, to) =>
            admin.from('expenses').select('unit_id, month, amount').eq('community_id', communityId)
                .lte('month', cutoff).order('id').range(from, to)),
        fetchAllFinanceRows<{ unit_id: string; month: string; kind: string; amount: number; label: string }>((from, to) =>
            admin.from('unit_charges').select('unit_id, month, kind, amount, label').eq('community_id', communityId)
                .lte('month', cutoff).neq('status', 'cancelled').order('id').range(from, to)),
        fetchAllFinanceRows<{ unit_id: string; paid_at: string; amount: number; reference: string | null }>((from, to) =>
            admin.from('unit_payments').select('unit_id, paid_at, amount, reference').eq('community_id', communityId)
                .order('id').range(from, to)),
        fetchAllFinanceRows<{ month: string; category: string; amount: number }>((from, to) =>
            admin.from('community_expenses').select('month, category, amount').eq('community_id', communityId)
                .lte('month', cutoff).order('id').range(from, to)),
        fetchAllFinanceRows<{ month: string; kind: string; amount: number; label: string }>((from, to) =>
            admin.from('reserve_fund_movements').select('month, kind, amount, label').eq('community_id', communityId)
                .lte('month', cutoff).order('id').range(from, to)),
        getJournal(communityId, new Date(Date.UTC(Number(cutoff.slice(0, 4)), Number(cutoff.slice(5, 7)), 0)).toISOString().slice(0, 10)),
        readDeliveredParkingPayouts(communityId, cutoff),
    ]);

    return buildFinancialStatements({
        year,
        cutoffMonth: cutoff,
        openingCash: options.openingCash,
        unitIds: units.map(row => String(row.id)),
        expenses: expenses.map(row => ({ unitId: String(row.unit_id), month: String(row.month), amount: Number(row.amount || 0) })),
        charges: charges.map(row => ({ unitId: String(row.unit_id), month: String(row.month), kind: String(row.kind), amount: Number(row.amount || 0), label: String(row.label || '') })),
        payments: payments.map(row => ({
            unitId: String(row.unit_id), paidAt: String(row.paid_at), amount: Number(row.amount || 0),
            nonCash: isParkingPayoutCredit(row.reference),
        })),
        communityExpenses: communityExpenses.map(row => ({ month: String(row.month), category: String(row.category || 'other'), amount: Number(row.amount || 0) })),
        reserveMovements: reserve.map(row => ({ month: String(row.month), kind: String(row.kind), amount: Number(row.amount || 0), label: String(row.label || '') })),
        journalBank: Number(journal.accounts.find(account => account.code === '1100')?.balance || 0),
        parkingPayouts,
    });
}

/** Liquidaciones transferidas o abonadas hasta el corte, con su mes en Chile. */
async function readDeliveredParkingPayouts(communityId: string, cutoff: string) {
    const admin = getSupabaseAdmin();
    try {
        const rows = await fetchAllFinanceRows<{ status: string; net_amount: number; paid_on: string | null; settled_at: string | null }>((from, to) =>
            admin.from('parking_payouts').select('status, net_amount, paid_on, settled_at').eq('community_id', communityId)
                .in('status', ['paid', 'credited']).order('id').range(from, to));
        return rows
            .map(row => ({
                month: row.status === 'paid' && row.paid_on
                    ? String(row.paid_on).slice(0, 7)
                    : row.settled_at ? todayInChile(new Date(String(row.settled_at))).slice(0, 7) : '',
                netAmount: Number(row.net_amount || 0),
                kind: row.status === 'paid' ? 'transfer' as const : 'credit' as const,
            }))
            .filter(row => row.month && row.month <= cutoff && row.netAmount > 0);
    } catch {
        // Sin la migración de liquidaciones aplicada, no hay liquidaciones.
        return [];
    }
}
