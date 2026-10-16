/**
 * Flujo 4 — Fondo de reserva, de punta a punta sobre Postgres real (PGlite)
 * con todas las migraciones: el aporte que nace con la emisión del gasto
 * común, los aportes y usos manuales, y su reflejo en reserve_fund_movements y
 * en los estados financieros (resultado, situación y fondos adicionales), con
 * el período cerrado bloqueando movimientos del mes.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createMoneyDb } from '../fixtures/moneyDb';
import { createPgliteSupabase } from '../fixtures/supabasePglite';
import { asUser, chileMonth, chileToday, expectLedgerInvariant, seedMoneyCommunity } from '../fixtures/moneyFlows';

const admin = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => admin.client,
    supabaseAdmin: new Proxy({}, { get: (_target, property) => (admin.client as Record<string | symbol, unknown>)[property] }),
}));

import { addCommunityExpense, cancelBilling, issueBilling } from '@/lib/finance/billingService';
import { recordPayment } from '@/lib/finance/collectionService';
import { addReserveFundMovement, getMonthlyReport, getReserveFund } from '@/lib/finance/reportingService';
import { getFinancialStatements } from '@/lib/finance/financialStatements';
import { closeFinancialPeriod } from '@/lib/finance/periodClosureService';

let db: PGlite;

beforeAll(async () => {
    ({ db } = await createMoneyDb());
    admin.client = createPgliteSupabase(db);
});

describe('fondo de reserva', () => {
    it('aporte de la emisión, aporte extraordinario y uso quedan en el fondo y en los estados financieros', async () => {
        const c = await seedMoneyCommunity(db, { shares: [600, 400], reserveRatePercent: 5 });
        const month = chileMonth(-1);
        await addCommunityExpense(c.communityId, c.adminId, { month, label: 'Mantención bombas', amount: 200_000, category: 'maintenance' });
        const issued = await issueBilling(c.communityId, c.adminId, month, `${month}-10`);
        expect(issued.reserveContribution).toBe(10_000);

        await addReserveFundMovement(c.communityId, c.adminId, { kind: 'contribution', amount: 50_000, month, label: 'Aporte extraordinario acordado en asamblea' });
        await addReserveFundMovement(c.communityId, c.adminId, { kind: 'withdrawal', amount: 15_000, month, label: 'Reparación portón' });
        // Un fondo adicional no se mezcla con el fondo legal.
        await addReserveFundMovement(c.communityId, c.adminId, { kind: 'contribution', amount: 7000, month, label: 'Fondo pintura', fundName: 'pintura' });
        // No se retira más de lo que hay.
        await expect(addReserveFundMovement(c.communityId, c.adminId, { kind: 'withdrawal', amount: 100_000, month, label: 'Excede' }))
            .rejects.toMatchObject({ code: 'insufficient_fund' });

        const { rows: movements } = await db.query<{ kind: string; amount: number; billing_run_id: string | null }>(
            'SELECT kind, amount::int, billing_run_id FROM public.reserve_fund_movements WHERE community_id = $1 ORDER BY created_at, amount', [c.communityId]);
        expect(movements).toHaveLength(4);
        expect(movements.filter(row => row.billing_run_id === issued.runId)).toEqual([{ kind: 'contribution', amount: 10_000, billing_run_id: issued.runId }]);

        const fund = await getReserveFund(c.communityId);
        expect(fund).toMatchObject({ balance: 45_000, totalContributions: 60_000, totalWithdrawals: 15_000, ratePercent: 5 });
        expect(fund.additionalFunds).toEqual([expect.objectContaining({ name: 'pintura', balance: 7000 })]);

        const year = Number(month.slice(0, 4));
        const statements = await getFinancialStatements(c.communityId, year, { cutoffMonth: month, openingCash: 0 });
        // Al resultado va el traspaso al fondo legal (aportes), no los fondos adicionales.
        expect(statements.income.reserveTransfer).toBe(60_000);
        expect(statements.income.result).toBe(statements.income.totalIncome - statements.income.totalExpenses - 60_000);
        expect(statements.position.reserveFund).toBe(45_000);
        // La situación cuadra: activo = pasivo + fondo + excedente.
        expect(statements.position.totalAssets).toBe(statements.position.totalLiabilities + statements.position.reserveFund + statements.position.accumulatedSurplus);

        // La rendición mensual informa el mismo fondo legal (sin los fondos adicionales).
        const report = await getMonthlyReport(c.communityId, month);
        expect(report.reserveFund).toEqual({ contributions: 60_000, withdrawals: 15_000, balance: 45_000 });

        // Los residentes ven el fondo de su comunidad (transparencia), no el de otras.
        const other = await seedMoneyCommunity(db, { shares: [1000] });
        const own = await asUser(db, c.units[0].ownerId, tx => tx.query('SELECT 1 FROM public.reserve_fund_movements WHERE community_id = $1', [c.communityId]));
        const foreign = await asUser(db, other.units[0].ownerId, tx => tx.query('SELECT 1 FROM public.reserve_fund_movements WHERE community_id = $1', [c.communityId]));
        expect(foreign.rows).toHaveLength(0);
        expect(own.rows).toHaveLength(4);
        // Nadie escribe el fondo directo desde el cliente.
        await expect(asUser(db, c.adminId, tx => tx.query(
            `INSERT INTO public.reserve_fund_movements (community_id, kind, amount, month, label) VALUES ($1, 'contribution', 1, $2, 'directo')`,
            [c.communityId, month]))).rejects.toThrow();

        // Cerrado el mes, no hay movimientos con esa fecha; la emisión con aporte tampoco se anula.
        await closeFinancialPeriod(c.communityId, c.adminId, month, 0);
        await expect(addReserveFundMovement(c.communityId, c.adminId, { kind: 'withdrawal', amount: 1000, month, label: 'Tarde' })).rejects.toThrow(/está cerrado/);
        await expect(cancelBilling(c.communityId, issued.runId, c.adminId)).rejects.toMatchObject({ code: 'closed_period' });
        await addReserveFundMovement(c.communityId, c.adminId, { kind: 'withdrawal', amount: 1000, month: chileMonth(0), label: 'Mes abierto' });
        expect((await getReserveFund(c.communityId)).balance).toBe(44_000);
        await expectLedgerInvariant(db, c.communityId);
    });

    it('el fondo no es caja: aportar al fondo no cambia el banco ni la recaudación', async () => {
        const c = await seedMoneyCommunity(db, { shares: [1000], reserveRatePercent: 10 });
        const month = chileMonth(0);
        await addCommunityExpense(c.communityId, c.adminId, { month, label: 'Aseo', amount: 10_000, category: 'maintenance' });
        await issueBilling(c.communityId, c.adminId, month, chileToday());
        const { rows: [expense] } = await db.query<{ id: string; amount: number }>('SELECT id, amount::int FROM public.expenses WHERE community_id = $1', [c.communityId]);
        await recordPayment(c.communityId, c.adminId, { unitId: c.units[0].id, amount: expense.amount, paidAt: chileToday(), method: 'transfer', expenseId: expense.id });
        const statements = await getFinancialStatements(c.communityId, Number(month.slice(0, 4)), { cutoffMonth: month, openingCash: 0 });
        expect(statements.cashFlow.totalInflow).toBe(10_000);
        // Caja = lo recaudado − egresos del edificio; el aporte al fondo es una reserva del patrimonio, no una salida.
        expect(statements.position.cash).toBe(0);
        expect(statements.position.journalBank).toBe(10_000);
        expect(statements.position.reserveFund).toBe(1000);
        const { bankBalance } = await expectLedgerInvariant(db, c.communityId);
        expect(bankBalance).toBe(10_000);
    });
});
