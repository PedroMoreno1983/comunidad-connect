/**
 * Aviso de cobro de gastos comunes (boleta).
 *
 * El artículo 31 de la Ley 21.442 fija qué debe decir: la proporción con que la
 * unidad contribuye, lo que va al fondo común de reserva, los intereses y
 * multas adeudados, y el total de ingresos, egresos y saldo de caja del
 * condominio. Este módulo arma esos números a partir de los registros; el PDF
 * solo los dibuja.
 *
 * Convención del estado de cuenta: el aviso del periodo M muestra el saldo que
 * venía de antes de M, lo cobrado en M y todo lo pagado desde el inicio de M
 * hasta hoy. Así una transferencia hecha el 2 del mes siguiente ya no aparece
 * como deuda en la boleta que se imprime el 3.
 */

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { BillNotice, BillNoticeCommunitySummary } from '@/lib/types';
import { BillingError, MONTH_PATTERN } from './billingService';
import { isCommitteeDiscount, signedChargeAmount } from './adjustments';
import { LEGAL_RESERVE_FUND, parseFundLabel } from './funds';

const CHARGE_KIND_LABELS: Record<string, string> = {
    fine: 'Multa',
    interest: 'Interés por mora',
    extraordinary: 'Cargo extraordinario',
    service: 'Servicio',
    other: 'Otro cargo',
};

const PAGE_SIZE = 1000;

export interface NoticeUnitRow {
    id: string;
    number: string;
    tower: string | null;
    sharePermille: number | null;
    ownerName: string | null;
}

export interface NoticeExpenseRow {
    id: string;
    unitId: string;
    month: string;
    amount: number;
    dueDate: string | null;
}

export interface NoticeChargeRow {
    unitId: string;
    month: string;
    kind: string;
    label: string;
    amount: number;
    status: string;
    notes?: string | null;
}

export interface NoticePaymentRow {
    unitId: string;
    paidAt: string;
    amount: number;
}

export interface NoticeItemRow {
    expenseId: string;
    label: string;
    amount: number;
}

export interface NoticeInputs {
    month: string;
    community: { name: string; address: string | null };
    units: NoticeUnitRow[];
    expenses: NoticeExpenseRow[];
    items: NoticeItemRow[];
    charges: NoticeChargeRow[];
    payments: NoticePaymentRow[];
    /** Fracción del gasto común del mes que se destinó al fondo de reserva. */
    reserveRatio: number;
    summary: BillNoticeCommunitySummary;
}

export function monthStart(month: string): string {
    return `${month}-01`;
}

export function nextMonth(month: string): string {
    const [year, mon] = month.split('-').map(Number);
    return mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`;
}

export function previousMonths(month: string, count: number): string[] {
    const [year, mon] = month.split('-').map(Number);
    return Array.from({ length: count }, (_, index) => {
        const date = new Date(Date.UTC(year, mon - 1 - (count - 1 - index), 1));
        return date.toISOString().slice(0, 7);
    });
}

function labelFor(unit: NoticeUnitRow): string {
    return unit.tower && unit.tower !== 'A' ? `${unit.tower}-${unit.number}` : unit.number;
}

export function buildBillNotice(inputs: NoticeInputs, unit: NoticeUnitRow): BillNotice {
    const { month } = inputs;
    const start = monthStart(month);
    const unitExpenses = inputs.expenses.filter(row => row.unitId === unit.id);
    const unitCharges = inputs.charges.filter(row => row.unitId === unit.id && row.status !== 'cancelled');
    const unitPayments = inputs.payments.filter(row => row.unitId === unit.id);

    const current = unitExpenses.find(row => row.month === month) ?? null;
    const gastoComun = current ? Math.round(current.amount) : 0;
    const items = current
        ? inputs.items
            .filter(item => item.expenseId === current.id)
            .map(item => ({ label: item.label, amount: Math.round(item.amount) }))
        : [];

    const monthCharges = unitCharges
        .filter(row => row.month === month)
        .map(row => ({
            label: row.label,
            kind: isCommitteeDiscount(row) ? 'Descuento de comité' : (CHARGE_KIND_LABELS[row.kind] || 'Cargo'),
            amount: signedChargeAmount(row),
        }));

    const previousCharged = unitExpenses.filter(row => row.month < month).reduce((sum, row) => sum + Math.round(row.amount), 0)
        + unitCharges.filter(row => row.month < month).reduce((sum, row) => sum + signedChargeAmount(row), 0);
    const previousPaid = unitPayments.filter(row => row.paidAt < start).reduce((sum, row) => sum + Math.round(row.amount), 0);
    const previousBalance = previousCharged - previousPaid;

    const periodCharges = gastoComun + monthCharges.reduce((sum, row) => sum + row.amount, 0);
    const paymentsSinceStart = unitPayments
        .filter(row => row.paidAt >= start)
        .reduce((sum, row) => sum + Math.round(row.amount), 0);

    const unpaidPenalties = unitCharges
        .filter(row => row.month <= month && row.status === 'pending' && (row.kind === 'interest' || row.kind === 'fine'))
        .map(row => ({ label: row.label, kind: CHARGE_KIND_LABELS[row.kind], amount: Math.round(row.amount), month: row.month }));

    const history = previousMonths(month, 6).map(period => ({
        month: period,
        amount: Math.round(unitExpenses.find(row => row.month === period)?.amount ?? 0),
    }));

    return {
        month,
        community: inputs.community,
        unit: {
            id: unit.id,
            label: labelFor(unit),
            ownerName: unit.ownerName,
            sharePermille: unit.sharePermille,
        },
        dueDate: current?.dueDate ?? null,
        items,
        gastoComun,
        reserveContribution: Math.round(gastoComun * inputs.reserveRatio),
        monthCharges,
        previousBalance,
        periodCharges,
        paymentsSinceStart,
        totalDue: previousBalance + periodCharges - paymentsSinceStart,
        unpaidPenalties,
        history,
        summary: inputs.summary,
    };
}

/** Lee todas las filas de una consulta paginando; PostgREST corta en 1000 por defecto. */
export async function fetchAllFinanceRows<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await build(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE_SIZE) return rows;
    }
}

/**
 * Carga lo necesario para los avisos de un mes. Con `unitId` arma solo esa
 * unidad; sin él, todas las que tienen algo que cobrar o deuda arrastrada.
 * `cashBalance` es el saldo de caja que informa el administrador; si no viene,
 * se estima con lo recaudado menos lo gastado según los registros.
 */
export async function getBillNotices(
    communityId: string,
    month: string,
    options: { unitId?: string; cashBalance?: number | null } = {},
): Promise<BillNotice[]> {
    if (!MONTH_PATTERN.test(month)) throw new BillingError('bad_month', 'Indica el mes en formato AAAA-MM.');
    const admin = getSupabaseAdmin();
    const end = monthStart(nextMonth(month));

    const unitsQuery = admin.from('units')
        .select('id, number, tower, share_permille, owner_id')
        .eq('community_id', communityId)
        .order('number', { ascending: true });
    const [communityResult, unitsResult, runResult] = await Promise.all([
        admin.from('communities').select('name, address').eq('id', communityId).maybeSingle(),
        options.unitId ? unitsQuery.eq('id', options.unitId) : unitsQuery,
        admin.from('billing_runs')
            .select('id, total_amount')
            .eq('community_id', communityId).eq('month', month).eq('status', 'issued')
            .maybeSingle(),
    ]);
    if (unitsResult.error) throw unitsResult.error;
    const unitRows = unitsResult.data ?? [];
    if (options.unitId && unitRows.length === 0) {
        throw new BillingError('unit_not_found', 'Esa unidad no existe en tu comunidad.', 404);
    }

    const onlyUnit = options.unitId;

    const [expenses, charges, payments, communityExpenses, allPayments, fundRows, owners] = await Promise.all([
        fetchAllFinanceRows<{ id: string; unit_id: string; month: string; amount: number; due_date: string | null }>((from, to) => {
            let query = admin.from('expenses').select('id, unit_id, month, amount, due_date')
                .eq('community_id', communityId).lte('month', month);
            if (onlyUnit) query = query.eq('unit_id', onlyUnit);
            return query.order('id').range(from, to);
        }),
        fetchAllFinanceRows<{ unit_id: string; month: string; kind: string; label: string; amount: number; status: string; notes: string | null }>((from, to) => {
            let query = admin.from('unit_charges').select('unit_id, month, kind, label, amount, status, notes')
                .eq('community_id', communityId).lte('month', month).neq('status', 'cancelled');
            if (onlyUnit) query = query.eq('unit_id', onlyUnit);
            return query.order('id').range(from, to);
        }),
        fetchAllFinanceRows<{ unit_id: string; paid_at: string; amount: number }>((from, to) => {
            let query = admin.from('unit_payments').select('unit_id, paid_at, amount').eq('community_id', communityId);
            if (onlyUnit) query = query.eq('unit_id', onlyUnit);
            return query.order('id').range(from, to);
        }),
        fetchAllFinanceRows<{ month: string; amount: number }>((from, to) =>
            admin.from('community_expenses').select('month, amount')
                .eq('community_id', communityId).lte('month', month).order('id').range(from, to)),
        fetchAllFinanceRows<{ paid_at: string; amount: number }>((from, to) =>
            admin.from('unit_payments').select('paid_at, amount')
                .eq('community_id', communityId).lt('paid_at', end).order('id').range(from, to)),
        fetchAllFinanceRows<{ kind: string; amount: number; month: string; billing_run_id: string | null; label: string }>((from, to) =>
            admin.from('reserve_fund_movements').select('kind, amount, month, billing_run_id, label')
                .eq('community_id', communityId).lte('month', month).order('id').range(from, to)),
        (async () => {
            const ownerIds = [...new Set(unitRows.map(row => row.owner_id).filter(Boolean).map(String))];
            if (ownerIds.length === 0) return new Map<string, string>();
            const { data } = await admin.from('profiles').select('id, name, full_name').in('id', ownerIds);
            return new Map((data ?? []).map(row => [String(row.id), String(row.full_name || row.name || '')]));
        })(),
    ]);

    const currentExpenseIds = expenses.filter(row => row.month === month).map(row => String(row.id));
    const items: NoticeItemRow[] = [];
    for (let index = 0; index < currentExpenseIds.length; index += 200) {
        const chunk = currentExpenseIds.slice(index, index + 200);
        const { data, error } = await admin.from('expense_items').select('expense_id, label, amount').in('expense_id', chunk);
        if (error) throw error;
        items.push(...(data ?? []).map(row => ({ expenseId: String(row.expense_id), label: String(row.label), amount: Number(row.amount || 0) })));
    }

    const run = runResult.data;
    const runContribution = run
        ? fundRows.filter(row => row.billing_run_id === run.id && row.kind === 'contribution')
            .reduce((sum, row) => sum + Number(row.amount || 0), 0)
        : 0;
    const reserveRatio = run && Number(run.total_amount) > 0 ? runContribution / Number(run.total_amount) : 0;

    const start = monthStart(month);
    const monthIncome = allPayments.filter(row => row.paid_at >= start).reduce((sum, row) => sum + Math.round(Number(row.amount || 0)), 0);
    const monthExpenses = communityExpenses.filter(row => row.month === month).reduce((sum, row) => sum + Math.round(Number(row.amount || 0)), 0);
    const estimatedCash = allPayments.reduce((sum, row) => sum + Math.round(Number(row.amount || 0)), 0)
        - communityExpenses.reduce((sum, row) => sum + Math.round(Number(row.amount || 0)), 0);
    const reserveBalance = fundRows
        .filter(row => parseFundLabel(String(row.label || '')).fundName === LEGAL_RESERVE_FUND)
        .reduce((sum, row) => sum + (row.kind === 'withdrawal' ? -1 : 1) * Math.round(Number(row.amount || 0)), 0);

    let declaredCash = typeof options.cashBalance === 'number' && Number.isFinite(options.cashBalance)
        ? Math.round(options.cashBalance)
        : null;
    if (declaredCash === null && run) {
        const { data: cashEvent } = await admin.from('operation_events')
            .select('metadata')
            .eq('community_id', communityId)
            .eq('action', 'billing.cash_declared')
            .eq('entity_id', run.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        const meta = cashEvent?.metadata && typeof cashEvent.metadata === 'object'
            ? cashEvent.metadata as Record<string, unknown>
            : null;
        const stored = meta ? Number(meta.cashBalance) : NaN;
        if (Number.isFinite(stored)) declaredCash = Math.round(stored);
    }
    const hasDeclaredCash = declaredCash !== null;

    const inputs: NoticeInputs = {
        month,
        community: {
            name: String(communityResult.data?.name || 'Comunidad'),
            address: communityResult.data?.address ? String(communityResult.data.address) : null,
        },
        units: unitRows.map(row => ({
            id: String(row.id),
            number: String(row.number ?? ''),
            tower: row.tower ? String(row.tower) : null,
            sharePermille: row.share_permille === null || row.share_permille === undefined ? null : Number(row.share_permille),
            ownerName: row.owner_id ? owners.get(String(row.owner_id)) || null : null,
        })),
        expenses: expenses.map(row => ({
            id: String(row.id), unitId: String(row.unit_id), month: String(row.month),
            amount: Number(row.amount || 0), dueDate: row.due_date ? String(row.due_date) : null,
        })),
        items,
        charges: charges.map(row => ({
            unitId: String(row.unit_id), month: String(row.month), kind: String(row.kind),
            label: String(row.label), amount: Number(row.amount || 0), status: String(row.status),
            notes: row.notes ? String(row.notes) : null,
        })),
        payments: payments.map(row => ({ unitId: String(row.unit_id), paidAt: String(row.paid_at), amount: Number(row.amount || 0) })),
        reserveRatio,
        summary: {
            monthIncome,
            monthExpenses,
            cashBalance: declaredCash ?? estimatedCash,
            cashBalanceIsEstimate: !hasDeclaredCash,
            reserveFundBalance: reserveBalance,
        },
    };

    const notices = inputs.units.map(unit => buildBillNotice(inputs, unit));
    if (options.unitId) return notices;
    return notices.filter(notice => notice.periodCharges > 0 || notice.totalDue !== 0);
}
