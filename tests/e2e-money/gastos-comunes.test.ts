/**
 * Flujo 1 — Gastos comunes, de punta a punta sobre Postgres real (PGlite) con
 * todas las migraciones: egresos del mes → emisión (prorrateo por
 * share_permille o, si falta algún derecho, partes iguales) → pago de la
 * unidad → conciliación con la cartola → cobro pagado → cierre del período,
 * que bloquea las escrituras del mes.
 *
 * Los pasos van por los mismos servicios que usan las rutas de administración
 * (billingService, collectionService, reconciliationService,
 * periodClosureService) con el cliente admin apuntando al PGlite.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createMoneyDb } from '../fixtures/moneyDb';
import { createPgliteSupabase, type PgliteSupabase } from '../fixtures/supabasePglite';
import { addDaysIso, asUser, chileMonth, chileToday, expectLedgerInvariant, seedMoneyCommunity } from '../fixtures/moneyFlows';

const admin = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => admin.client,
    supabaseAdmin: new Proxy({}, { get: (_target, property) => (admin.client as Record<string | symbol, unknown>)[property] }),
}));
vi.mock('@/lib/security/rateLimit', () => ({ enforceDistributedRateLimit: async () => null }));

import { addCommunityExpense, cancelBilling, issueBilling, previewBilling, BillingError } from '@/lib/finance/billingService';
import { addUnitCharge, getUnitStatement, reconcileUnitStatuses, recordPayment } from '@/lib/finance/collectionService';
import { autoReconcile, getReconciliation, importBankTransactions, recordSuggestedDeposit } from '@/lib/finance/reconciliationService';
import { closeFinancialPeriod } from '@/lib/finance/periodClosureService';
import { addReserveFundMovement } from '@/lib/finance/reportingService';
import { getFinancialStatements } from '@/lib/finance/financialStatements';
import { signHaulmerParams } from '@/lib/services/haulmer';
import { POST as haulmerWebhook } from '@/app/api/webhooks/haulmer/route';

let db: PGlite;

beforeAll(async () => {
    ({ db } = await createMoneyDb());
    admin.client = createPgliteSupabase(db) as PgliteSupabase;
});

async function expenseRows(communityId: string, month: string) {
    const { rows } = await db.query<{ id: string; unit_id: string; amount: number; status: string; billing_run_id: string }>(
        `SELECT id, unit_id::text, amount::int, status, billing_run_id FROM public.expenses WHERE community_id = $1 AND month = $2`,
        [communityId, month]);
    return new Map(rows.map(row => [row.unit_id, row]));
}

describe('gastos comunes: emisión, pago, conciliación y cierre', () => {
    it('prorratea por share_permille, cobra, concilia y deja el período cerrado', async () => {
        const c = await seedMoneyCommunity(db, { shares: [500, 300, 200], reserveRatePercent: 5 });
        const month = chileMonth(-1);
        const dueDate = `${month}-10`;
        const [u101, u102, u103] = c.units;

        await addCommunityExpense(c.communityId, c.adminId, { month, label: 'Mantención ascensores', amount: 100_000, category: 'maintenance' });
        await addCommunityExpense(c.communityId, c.adminId, { month, label: 'Remuneraciones conserjería', amount: 50_001, category: 'salaries' });

        const preview = await previewBilling(c.communityId, month);
        expect(preview.fellBackToEqualSplit).toBe(false);
        expect(preview.totalCharged).toBe(150_001);
        const byUnit = new Map(preview.units.map(unit => [unit.unitId, unit.total]));
        // 50 % / 30 % / 20 %, al peso y sin perder el resto.
        expect(Math.abs(byUnit.get(u101.id)! - 75_000.5)).toBeLessThanOrEqual(1);
        expect(Math.abs(byUnit.get(u102.id)! - 45_000.3)).toBeLessThanOrEqual(1);
        expect(Math.abs(byUnit.get(u103.id)! - 30_000.2)).toBeLessThanOrEqual(1);

        const issued = await issueBilling(c.communityId, c.adminId, month, dueDate);
        expect(issued).toMatchObject({ issuedUnits: 3, totalCharged: 150_001, fellBackToEqualSplit: false, reserveContribution: 7500 });

        const expenses = await expenseRows(c.communityId, month);
        expect([...expenses.values()].reduce((sum, row) => sum + row.amount, 0)).toBe(150_001);
        for (const unit of c.units) {
            expect(expenses.get(unit.id)).toMatchObject({ amount: byUnit.get(unit.id), status: 'pending', billing_run_id: issued.runId });
        }
        const { rows: items } = await db.query<{ total: number }>(
            `SELECT sum(i.amount)::int AS total FROM public.expense_items i JOIN public.expenses e ON e.id = i.expense_id
             WHERE e.community_id = $1 AND e.month = $2`, [c.communityId, month]);
        expect(items[0].total).toBe(150_001);
        // El aporte al fondo de reserva nace con la emisión, en la misma transacción.
        const { rows: fund } = await db.query<{ amount: number; billing_run_id: string }>(
            `SELECT amount::int, billing_run_id FROM public.reserve_fund_movements WHERE community_id = $1`, [c.communityId]);
        expect(fund).toEqual([{ amount: 7500, billing_run_id: issued.runId }]);

        // Emitir dos veces el mismo mes no duplica.
        await expect(issueBilling(c.communityId, c.adminId, month, dueDate)).rejects.toMatchObject({ code: 'already_issued' });
        // Los egresos de un mes emitido no se tocan.
        await expect(addCommunityExpense(c.communityId, c.adminId, { month, label: 'Tarde', amount: 1 }))
            .rejects.toMatchObject({ code: 'already_issued' });

        // El residente ve su cobro y no el de los vecinos (RLS), y no puede registrarse pagos.
        const visible = await asUser(db, u101.ownerId, tx => tx.query<{ unit_id: string }>(
            'SELECT unit_id::text FROM public.expenses WHERE community_id = $1', [c.communityId]));
        expect(visible.rows.map(row => row.unit_id)).toEqual([u101.id]);
        await expect(asUser(db, u101.ownerId, tx => tx.query(
            `INSERT INTO public.unit_payments (community_id, unit_id, amount, paid_at, method) VALUES ($1, $2, 1, CURRENT_DATE, 'cash')`,
            [c.communityId, u101.id]))).rejects.toThrow();
        await expect(asUser(db, u101.ownerId, tx => tx.query(
            `UPDATE public.expenses SET status = 'paid' WHERE unit_id = $1 RETURNING id`, [u101.id]).then(result => {
            if (result.rows.length) throw new Error('el residente marcó su cobro como pagado');
            throw new Error('sin filas');
        }))).rejects.toThrow();
        expect((await expenseRows(c.communityId, month)).get(u101.id)!.status).toBe('pending');

        // Pago de 101 desde la cartola: la glosa nombra la unidad y se imputa al cobro del mes.
        const paidOn = `${month}-08`;
        const e101 = expenses.get(u101.id)!;
        await importBankTransactions(c.communityId, c.adminId, [
            { txnDate: paidOn, amount: e101.amount, description: `Transferencia GC depto ${u101.number}`, reference: 'OP-101' },
        ]);
        const snapshot = await getReconciliation(c.communityId);
        const suggestion = snapshot.depositSuggestions.find(item => item.kind === 'record');
        expect(suggestion).toMatchObject({ unitId: u101.id });
        const recorded = await recordSuggestedDeposit(c.communityId, c.adminId, suggestion!.transactionId, e101.id);
        expect(recorded.ok).toBe(true);

        // Pago de 102 registrado a mano y luego conciliado automáticamente.
        const e102 = expenses.get(u102.id)!;
        const manual = await recordPayment(c.communityId, c.adminId, {
            unitId: u102.id, amount: e102.amount, paidAt: paidOn, method: 'transfer', reference: 'OP-102', expenseId: e102.id,
        });
        await importBankTransactions(c.communityId, c.adminId, [
            { txnDate: paidOn, amount: e102.amount, description: 'Abono recibido', reference: 'OP-102' },
        ]);
        expect(await autoReconcile(c.communityId)).toMatchObject({ applied: 1 });

        let after = await expenseRows(c.communityId, month);
        expect(after.get(u101.id)!.status).toBe('paid');
        expect(after.get(u102.id)!.status).toBe('paid');
        // 103 no pagó: su estado solo se recalcula cuando se mueve su cuenta, y entonces queda vencido.
        expect(after.get(u103.id)!.status).toBe('pending');
        await reconcileUnitStatuses(c.communityId, u103.id);
        expect((await expenseRows(c.communityId, month)).get(u103.id)!.status).toBe(dueDate < chileToday() ? 'overdue' : 'pending');

        const { rows: txns } = await db.query<{ status: string; matched_payment_id: string }>(
            'SELECT status, matched_payment_id FROM public.bank_transactions WHERE community_id = $1 ORDER BY reference', [c.communityId]);
        expect(txns).toEqual([
            { status: 'matched', matched_payment_id: recorded.paymentId },
            { status: 'matched', matched_payment_id: manual.id },
        ]);
        const statement = await getUnitStatement(c.communityId, u101.id);
        expect(statement.balance).toBe(0);

        // Ninguna conciliación pendiente vuelve a ofrecer pagos ya cruzados.
        const reconciled = await getReconciliation(c.communityId);
        expect(reconciled.unmatchedPayments).toEqual([]);

        // Cierre del mes: los estados financieros quedan guardados.
        const closed = await closeFinancialPeriod(c.communityId, c.adminId, month, 0);
        expect(closed.cashFlow.totalInflow).toBe(e101.amount + e102.amount);
        expect(closed.income.lines[0]).toMatchObject({ label: 'Gastos comunes emitidos', total: 150_001 });
        expect(closed.income.reserveTransfer).toBe(7500);

        // Período cerrado: nada se escribe con fecha de ese mes.
        after = await expenseRows(c.communityId, month);
        const e103 = after.get(u103.id)!;
        await expect(recordPayment(c.communityId, c.adminId, {
            unitId: u103.id, amount: e103.amount, paidAt: `${month}-20`, method: 'cash',
        })).rejects.toThrow(/está cerrado/);
        await expect(addUnitCharge(c.communityId, c.adminId, { unitId: u103.id, month, kind: 'fine', label: 'Multa ruidos', amount: 5000 }))
            .rejects.toThrow(/está cerrado/);
        await expect(addReserveFundMovement(c.communityId, c.adminId, { kind: 'contribution', amount: 1000, month, label: 'Aporte tardío' }))
            .rejects.toThrow(/está cerrado/);
        await expect(cancelBilling(c.communityId, issued.runId, c.adminId)).rejects.toMatchObject({ code: 'closed_period' });
        await expect(db.query(`DELETE FROM public.unit_payments WHERE id = $1`, [manual.id])).rejects.toThrow(/está cerrado/);
        // Un segundo corte del mismo mes no se guarda (el siguiente debe ser el mes que sigue).
        await expect(closeFinancialPeriod(c.communityId, c.adminId, month, 0)).rejects.toMatchObject({ code: 'nonsequential_close' });
        const { rows: closures } = await db.query('SELECT 1 FROM public.finance_period_closures WHERE community_id = $1', [c.communityId]);
        expect(closures).toHaveLength(1);

        // El mes abierto sigue operando: 103 paga hoy y salda la deuda del mes cerrado.
        await recordPayment(c.communityId, c.adminId, {
            unitId: u103.id, amount: e103.amount, paidAt: chileToday(), method: 'transfer', reference: 'OP-103', expenseId: e103.id,
        });
        expect((await expenseRows(c.communityId, month)).get(u103.id)!.status).toBe('paid');

        const { bankBalance } = await expectLedgerInvariant(db, c.communityId);
        expect(bankBalance).toBe(150_001);
        // Los estados financieros cuentan cada peso una sola vez.
        const statements = await getFinancialStatements(c.communityId, Number(chileMonth(0).slice(0, 4)), { cutoffMonth: chileMonth(0), openingCash: 0 });
        if (chileMonth(0).slice(0, 4) === month.slice(0, 4)) {
            expect(statements.cashFlow.totalInflow).toBe(150_001);
            expect(statements.position.receivables).toBe(0);
            expect(statements.position.journalBank).toBe(150_001);
        }
    });

    it('si falta el derecho de alguna unidad, reparte en partes iguales a todas y lo advierte', async () => {
        const c = await seedMoneyCommunity(db, { shares: [600, null, 400] });
        const month = chileMonth(-1);
        await addCommunityExpense(c.communityId, c.adminId, { month, label: 'Aseo', amount: 90_001, category: 'maintenance' });
        const preview = await previewBilling(c.communityId, month);
        expect(preview.fellBackToEqualSplit).toBe(true);
        expect(preview.warnings.join(' ')).toMatch(/partes iguales|igual/i);

        const issued = await issueBilling(c.communityId, c.adminId, month, `${month}-10`);
        expect(issued.fellBackToEqualSplit).toBe(true);
        const amounts = [...(await expenseRows(c.communityId, month)).values()].map(row => row.amount).sort();
        expect(amounts.reduce((sum, value) => sum + value, 0)).toBe(90_001);
        expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
        const { rows } = await db.query<{ fallback_equal_split: boolean }>(
            'SELECT fallback_equal_split FROM public.billing_runs WHERE id = $1', [issued.runId]);
        expect(rows[0].fallback_equal_split).toBe(true);
        await expectLedgerInvariant(db, c.communityId);
    });

    it('con comité vigente no se emite sin su aprobación', async () => {
        const c = await seedMoneyCommunity(db, { committee: true });
        const month = chileMonth(-1);
        await addCommunityExpense(c.communityId, c.adminId, { month, label: 'Luz', amount: 30_000, category: 'electricity' });
        await expect(issueBilling(c.communityId, c.adminId, month, `${month}-10`)).rejects.toBeInstanceOf(BillingError);
        await expect(issueBilling(c.communityId, c.adminId, month, `${month}-10`)).rejects.toMatchObject({ code: 'committee_review_required' });
        const { rows } = await db.query('SELECT 1 FROM public.expenses WHERE community_id = $1', [c.communityId]);
        expect(rows).toHaveLength(0);
    });

    it('anular una emisión sin pagos revierte cobros y aporte; con un abono parcial se bloquea', async () => {
        const c = await seedMoneyCommunity(db, { shares: [500, 500], reserveRatePercent: 10 });
        const month = chileMonth(0);
        await addCommunityExpense(c.communityId, c.adminId, { month, label: 'Jardines', amount: 20_000, category: 'maintenance' });
        const first = await issueBilling(c.communityId, c.adminId, month, addDaysIso(chileToday(), 10));
        await cancelBilling(c.communityId, first.runId, c.adminId);
        const { rows: live } = await db.query(`SELECT 1 FROM public.expenses WHERE community_id = $1 AND status <> 'cancelled'`, [c.communityId]);
        expect(live).toHaveLength(0);
        const { rows: fund } = await db.query('SELECT 1 FROM public.reserve_fund_movements WHERE community_id = $1', [c.communityId]);
        expect(fund).toHaveLength(0);

        const second = await issueBilling(c.communityId, c.adminId, month, addDaysIso(chileToday(), 10));
        const expense = [...(await expenseRows(c.communityId, month)).values()].find(row => row.billing_run_id === second.runId)!;
        await recordPayment(c.communityId, c.adminId, {
            unitId: expense.unit_id, amount: 1000, paidAt: chileToday(), method: 'cash', expenseId: expense.id,
        });
        await expect(cancelBilling(c.communityId, second.runId, c.adminId)).rejects.toMatchObject({ code: 'has_payment' });
        await expectLedgerInvariant(db, c.communityId);
    });

    it('el pago en línea (webhook de Haulmer firmado) salda el cobro una sola vez aunque se repita', async () => {
        process.env.HAULMER_SECRET_KEY = 'clave-abc';
        delete process.env.HAULMER_ACCOUNT_ID;
        const c = await seedMoneyCommunity(db, { shares: [700, 300] });
        const month = chileMonth(0);
        await addCommunityExpense(c.communityId, c.adminId, { month, label: 'Seguridad', amount: 40_000, category: 'security' });
        await issueBilling(c.communityId, c.adminId, month, addDaysIso(chileToday(), 5));
        const expense = (await expenseRows(c.communityId, month)).get(c.units[0].id)!;
        const send = async (amount: number) => {
            const params = { x_reference: `EXP_${expense.id}`, x_result: 'completed', x_amount: String(amount), x_currency: 'CLP', x_gateway_reference: 'gw-gc-1' };
            const body = new URLSearchParams({ ...params, x_signature: signHaulmerParams(params, 'clave-abc') });
            const response = await haulmerWebhook(new Request('https://conviveconnect.test/api/webhooks/haulmer', {
                method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString(),
            }));
            return (await response.json() as { status: string }).status;
        };
        // Un aviso con otro monto no se acepta, tampoco en el reintento de la pasarela
        // (antes el reintento tomaba el monto equivocado como "lo esperado").
        expect(await send(expense.amount - 500)).toBe('amount_mismatch');
        expect(await send(expense.amount - 500)).toBe('amount_mismatch');
        expect((await expenseRows(c.communityId, month)).get(c.units[0].id)!.status).toBe('pending');
        expect(await send(expense.amount)).toBe('processed');
        expect(await send(expense.amount)).toBe('idempotent');
        expect((await expenseRows(c.communityId, month)).get(c.units[0].id)!.status).toBe('paid');
        const { rows } = await db.query<{ amount: number; method: string; reference: string }>(
            'SELECT amount::int, method, reference FROM public.unit_payments WHERE unit_id = $1', [c.units[0].id]);
        expect(rows).toEqual([{ amount: expense.amount, method: 'online', reference: 'haulmer:gw-gc-1' }]);
        const { bankBalance } = await expectLedgerInvariant(db, c.communityId);
        expect(bankBalance).toBe(expense.amount);
    });
});
