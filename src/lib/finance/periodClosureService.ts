import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { isDeepStrictEqual } from 'node:util';
import { recordOperationEvent } from '@/lib/operations/audit';
import type { FinancialStatements } from '@/lib/types';
import { BillingError, MONTH_PATTERN } from './billingService';
import { currentMonthInChile } from './chileDates';
import { getFinancialStatements } from './financialStatements';

type ClosureRow = { month: string; opening_cash: number; statements: FinancialStatements; closed_at: string };

function nextMonth(month: string) {
    const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
    return date.toISOString().slice(0, 7);
}

async function readClosure(communityId: string, month: string): Promise<ClosureRow | null> {
    const { data, error } = await getSupabaseAdmin().from('finance_period_closures')
        .select('month, opening_cash, statements, closed_at')
        .eq('community_id', communityId).eq('month', month).maybeSingle();
    if (error) throw error;
    return data as ClosureRow | null;
}

export async function statementsForMonth(communityId: string, month: string, openingCash: number): Promise<FinancialStatements> {
    const closure = await readClosure(communityId, month);
    if (!closure) return getFinancialStatements(communityId, Number(month.slice(0, 4)), { cutoffMonth: month, openingCash });
    const current = await getFinancialStatements(communityId, Number(month.slice(0, 4)), {
        cutoffMonth: month, openingCash: Number(closure.opening_cash),
    });
    const saved = closure.statements;
    return { ...saved, closure: { closedAt: closure.closed_at,
        hasLaterChanges: !isDeepStrictEqual(saved, current) } };
}

export async function closeFinancialPeriod(communityId: string, adminId: string, month: string, openingCash: number) {
    if (!MONTH_PATTERN.test(month) || month >= currentMonthInChile()) {
        throw new BillingError('bad_month', 'Solo puedes cerrar un mes ya terminado.');
    }
    if (!Number.isSafeInteger(openingCash) || openingCash < 0 || openingCash > 10_000_000_000) {
        throw new BillingError('bad_opening_cash', 'Indica un saldo inicial válido.');
    }
    const admin = getSupabaseAdmin();
    const [sourceExpenses, issuedRun] = await Promise.all([
        admin.from('community_expenses').select('id', { count: 'exact', head: true })
            .eq('community_id', communityId).eq('month', month),
        admin.from('billing_runs').select('id').eq('community_id', communityId).eq('month', month)
            .eq('status', 'issued').limit(1).maybeSingle(),
    ]);
    if (sourceExpenses.error) throw sourceExpenses.error;
    if (issuedRun.error) throw issuedRun.error;
    if ((sourceExpenses.count ?? 0) > 0 && !issuedRun.data) {
        throw new BillingError('unissued_month', 'Hay egresos del mes sin gasto común emitido. Emite o corrige antes de guardar el corte.', 409);
    }
    const { data: latest, error: latestError } = await admin.from('finance_period_closures')
        .select('month, opening_cash, statements').eq('community_id', communityId)
        .order('month', { ascending: false }).limit(1).maybeSingle();
    if (latestError) throw latestError;
    if (latest) {
        if (nextMonth(String(latest.month)) !== month) {
            throw new BillingError('nonsequential_close', 'Guarda los cortes siguientes en orden mensual, sin saltos ni meses anteriores.', 409);
        }
        const expectedCash = String(latest.month).slice(0, 4) === month.slice(0, 4)
            ? Number(latest.opening_cash) : Number((latest.statements as FinancialStatements).position.cash);
        if (openingCash !== expectedCash) {
            throw new BillingError('opening_cash_mismatch', `El saldo inicial debe ser $${expectedCash.toLocaleString('es-CL')} según el corte previo.`, 409);
        }
    }
    const statements = await getFinancialStatements(communityId, Number(month.slice(0, 4)), { cutoffMonth: month, openingCash });
    const { data, error } = await admin.from('finance_period_closures').insert({
        community_id: communityId, month, opening_cash: openingCash, statements, closed_by: adminId,
    }).select('closed_at').single();
    if (error?.code === '23505') throw new BillingError('already_closed', 'Este período ya tiene un corte guardado.', 409);
    if (error || !data) throw error || new Error('No se pudo guardar el corte.');
    await recordOperationEvent({ communityId, actorId: adminId, actorRole: 'admin',
        action: 'finance.period_snapshot_saved', entityType: 'finance_period_closure', entityId: month,
        summary: `Corte financiero ${month} guardado`, metadata: { month, openingCash,
            totalIncome: statements.income.totalIncome, totalExpenses: statements.income.totalExpenses },
    });
    return { ...statements, closure: { closedAt: String(data.closed_at), hasLaterChanges: false } };
}
