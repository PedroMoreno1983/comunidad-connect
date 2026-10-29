/**
 * Flujo 5 — Estacionamientos, de punta a punta sobre Postgres real (PGlite)
 * con todas las migraciones: reserva → cobro (cargo a gastos comunes o
 * Haulmer) → pagado → liquidación al dueño en sus tres destinos
 * (transferencia marcada por la administración con asiento 2400/1100, abono a
 * GC como unit_payments sin doble conteo, donación al fondo de reserva),
 * comisión 0 %, 12,5 % y 100 % con bruto = comisión + neto, reversas según
 * AGENTS.md e idempotencia (un cobro por reserva, una liquidación por cobro,
 * webhook repetido). El arriendo pagado (por GC o por Haulmer) se reconoce en el
 * libro: debe 1200 o 1100 por el bruto, haber 2400 por el neto y 4300 por la
 * comisión; liquidar deja la 2400 en 0.
 *
 * Cada paso va por el camino de la app: la reserva y las RPC del dueño o de la
 * administración con su JWT (RLS activo), el pago del arrendatario por
 * `recordPayment` (collectionService → reconcileUnitStatuses →
 * reconcileParkingPayoutCredits), el link de Haulmer por `processParkingCharge`
 * y la confirmación por el route handler real del webhook, firmado.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createMoneyDb } from '../fixtures/moneyDb';
import { createPgliteSupabase } from '../fixtures/supabasePglite';
import {
    addDaysIso, asUser, chileMonth, chileToday, createUser, DEBTOR_PATTERN, expectLedgerInvariant, ledgerBalances,
    seedMoneyCommunity, type MoneyCommunity,
} from '../fixtures/moneyFlows';
import type { ParkingChargeProviderInput, PaymentProvider } from '@/lib/types';

const clients = vi.hoisted(() => ({ admin: null as unknown, user: null as unknown }));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => clients.admin,
    supabaseAdmin: new Proxy({}, { get: (_target, property) => (clients.admin as Record<string | symbol, unknown>)[property] }),
}));
// Cliente del navegador (servicio de liquidaciones): el usuario que el test elija.
vi.mock('@/lib/supabase', () => ({
    supabase: new Proxy({}, { get: (_target, property) => (clients.user as Record<string | symbol, unknown>)[property] }),
}));
vi.mock('@/lib/security/rateLimit', () => ({ enforceDistributedRateLimit: async () => null }));

import { createUnitExpense } from '@/lib/finance/billingService';
import { deletePayment, recordPayment } from '@/lib/finance/collectionService';
import { getReconciliation } from '@/lib/finance/reconciliationService';
import { getFinancialStatements } from '@/lib/finance/financialStatements';
import { getReserveFund } from '@/lib/finance/reportingService';
import { processParkingCharge, type ParkingChargesDb } from '@/lib/payments/parkingCharges';
import { ParkingPayoutService } from '@/lib/services/parkingPayoutService';
import { splitParkingPayout } from '@/lib/parkingPayouts/payouts';
import { signHaulmerParams } from '@/lib/services/haulmer';
import { POST as haulmerWebhook } from '@/app/api/webhooks/haulmer/route';

let db: PGlite;
const HAULMER_TEST_KEY = 'clave-abc';

beforeAll(async () => {
    ({ db } = await createMoneyDb());
    clients.admin = createPgliteSupabase(db);
    process.env.HAULMER_SECRET_KEY = HAULMER_TEST_KEY;
    delete process.env.HAULMER_ACCOUNT_ID;
    // El servicio del cliente avisa al servidor con fetch relativo: aquí no hay servidor.
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }));
});

const as = (userId: string) => { clients.user = createPgliteSupabase(db, { kind: 'user', userId }); };

interface ParkingCommunity extends MoneyCommunity {
    owner: MoneyCommunity['units'][number];
    tenant: MoneyCommunity['units'][number];
    spotId: string;
    conciergeId: string;
}

let spotCounter = 0;

async function seedParking(options: { hourlyRate?: number; commission?: number; haulmer?: boolean } = {}): Promise<ParkingCommunity> {
    const c = await seedMoneyCommunity(db, { shares: [500, 500] });
    // La producción usa Haulmer por defecto. Estos escenarios declaran el
    // método que ejercitan para no depender del valor por defecto de la base.
    await asUser(db, c.adminId, tx => tx.query(
        'SELECT public.admin_set_parking_billing_settings($1, NULL)',
        [options.haulmer ? 'haulmer' : 'common_expenses'],
    ));
    const [owner, tenant] = c.units;
    const conciergeId = await createUser(db, c.communityId, 'concierge', 'Conserjería');
    const spotId = crypto.randomUUID();
    spotCounter += 1;
    await db.query(`INSERT INTO public.parking_spots (id, community_id, owner_id, label, hourly_rate, status)
                    VALUES ($1, $2, $3, $4, $5, 'published')`, [spotId, c.communityId, owner.ownerId, `E-${spotCounter}`, options.hourlyRate ?? 1500]);
    for (let weekday = 0; weekday < 7; weekday += 1) {
        await db.query(`INSERT INTO public.parking_spot_availability (spot_id, weekday, start_time, end_time) VALUES ($1, $2, '00:00', '23:59')`, [spotId, weekday]);
    }
    await db.query(`INSERT INTO public.parking_drivers (user_id, profile_id, full_name, phone, plate) VALUES ($1, $1, 'Vecina Conductora', '+56911112222', 'BBCC12')`, [tenant.ownerId]);
    if (options.commission !== undefined) {
        as(c.adminId);
        await ParkingPayoutService.adminSetCommissionPercent(options.commission);
    }
    return { ...c, owner, tenant, spotId, conciergeId };
}

async function tomorrowAt(hour: number): Promise<string> {
    const { rows } = await db.query<{ ts: string }>(
        `SELECT to_char(((date_trunc('day', NOW() AT TIME ZONE 'America/Santiago') + make_interval(days => 1, hours => $1))
                AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ts`, [hour]);
    return rows[0].ts;
}

/** La arrendataria reserva mañana por la RPC de la app, con su JWT. */
async function bookAt(p: ParkingCommunity, fromHour: number, hours = 2): Promise<string> {
    const startsAt = await tomorrowAt(fromHour);
    const endsAt = await tomorrowAt(fromHour + hours);
    const { rows } = await asUser(db, p.tenant.ownerId, tx => tx.query<{ id: string }>(
        'SELECT public.create_parking_booking($1, $2, $3) AS id', [p.spotId, startsAt, endsAt]));
    return rows[0].id;
}

interface ChargeRow { id: string; status: string; method: string; amount: number; unit_charge_id: string | null; payment_url: string | null }
async function chargeOf(bookingId: string): Promise<ChargeRow> {
    const { rows } = await db.query<ChargeRow>('SELECT id, status, method, amount, unit_charge_id, payment_url FROM public.parking_charges WHERE booking_id = $1', [bookingId]);
    expect(rows, 'un cobro por reserva').toHaveLength(1);
    return rows[0];
}

interface PayoutRow {
    id: string; status: string; destination: string; destination_source: string; gross_amount: number; commission_amount: number;
    net_amount: number; needs_review: boolean; unit_payment_id: string | null; reserve_fund_movement_id: string | null;
    credit_unit_id: string | null; credit_reconciled_at: string | null; journal_entry_id: string | null;
}
async function payoutsOf(chargeId: string): Promise<PayoutRow[]> {
    const { rows } = await db.query<PayoutRow>('SELECT * FROM public.parking_payouts WHERE charge_id = $1', [chargeId]);
    return rows;
}
async function payoutOf(chargeId: string): Promise<PayoutRow> {
    const rows = await payoutsOf(chargeId);
    expect(rows, 'una liquidación por cobro').toHaveLength(1);
    return rows[0];
}

/** La arrendataria paga su cargo de estacionamiento en la cartola (pago sin imputar, como llega por transferencia). */
async function tenantPays(p: ParkingCommunity, amount: number, reference: string) {
    return recordPayment(p.communityId, p.adminId, { unitId: p.tenant.id, amount, paidAt: chileToday(), method: 'transfer', reference });
}

const BANK = { bankName: 'Banco de Chile', bankAccountType: 'corriente' as const, bankAccountNumber: '00-123-45678-09', holderRut: '12.345.678-5', holderName: 'Dueña de Prueba' };
const NO_BANK = { bankName: null, bankAccountType: null, bankAccountNumber: null, holderRut: null, holderName: null };

function expectSplit(payout: PayoutRow, percent: number) {
    expect(payout.gross_amount).toBe(payout.commission_amount + payout.net_amount);
    const app = splitParkingPayout(payout.gross_amount, percent);
    expect({ commission: payout.commission_amount, net: payout.net_amount }).toEqual({ commission: app.commission, net: app.net });
}

async function creditPayments(unitId: string) {
    const { rows } = await db.query<{ id: string; amount: number; reference: string }>(
        `SELECT id, amount::int, reference FROM public.unit_payments WHERE unit_id = $1 AND reference LIKE 'parking_payout:%'`, [unitId]);
    return rows;
}

const thisYear = () => Number(chileMonth(0).slice(0, 4));
/** Saldo acreedor de una cuenta (haber − debe); 0 si no existe. */
const net = (balance?: { debit: number; credit: number }) => balance ? balance.credit - balance.debit : 0;

interface LedgerLine { code: string; debit: number; credit: number }
/** Asientos de reconocimiento (y reversa) del arriendo, con sus líneas. */
async function chargeEntries(chargeId: string) {
    const { rows } = await db.query<{ entry_id: string; source: string; event_type: string; code: string; debit: number; credit: number }>(`
        SELECT j.id AS entry_id, j.source, ev.event_type, a.code, l.debit, l.credit
        FROM public.parking_charge_events ev
        JOIN public.journal_entries j ON j.source_record_id = ev.id AND j.source IN ('parking_charge', 'parking_charge_reversal')
        JOIN public.journal_lines l ON l.entry_id = j.id JOIN public.ledger_accounts a ON a.id = l.account_id
        WHERE ev.charge_id = $1 ORDER BY ev.seq, a.code`, [chargeId]);
    const entries = new Map<string, { source: string; lines: LedgerLine[] }>();
    for (const row of rows) {
        const entry = entries.get(row.entry_id) ?? { source: row.source, lines: [] };
        entry.lines.push({ code: row.code, debit: row.debit, credit: row.credit });
        entries.set(row.entry_id, entry);
    }
    return [...entries.values()];
}

describe('cargo a gastos comunes → abono a GC del dueño (destino por defecto)', () => {
    it('el pago de la arrendataria abre la liquidación, abona al dueño y recalcula su unidad sin contar dos veces', async () => {
        const p = await seedParking({ commission: 0 });
        // El dueño debe justo lo que le van a abonar: tras el abono queda al día.
        const ownerExpense = (await createUnitExpense(p.communityId, p.adminId, {
            unitId: p.owner.id, month: chileMonth(0), amount: 3000, dueDate: addDaysIso(chileToday(), 10),
        })).expense;

        const bookingId = await bookAt(p, 8);
        const charge = await chargeOf(bookingId);
        expect(charge).toMatchObject({ status: 'charged', method: 'common_expenses', amount: 3000 });
        expect(charge.unit_charge_id).toBeTruthy();
        // "Cargado a gastos comunes" es deuda, no dinero: no se liquida todavía.
        expect(await payoutsOf(charge.id)).toEqual([]);
        // processParkingCharge es idempotente y no crea otro cobro.
        await processParkingCharge(clients.admin as ParkingChargesDb, bookingId);
        await chargeOf(bookingId);

        const tenantPayment = await tenantPays(p, 3000, 'TRF-ARRIENDO-1');
        expect((await chargeOf(bookingId)).status).toBe('paid');
        const payout = await payoutOf(charge.id);
        expect(payout).toMatchObject({ status: 'credited', destination: 'common_expenses_credit', destination_source: 'default_credit', credit_unit_id: p.owner.id });
        expectSplit(payout, 0);
        expect(payout.net_amount).toBe(3000);
        // reconcileUnitStatuses recalculó la unidad abonada y la marcó.
        expect(payout.credit_reconciled_at).not.toBeNull();
        const { rows: [ownerAfter] } = await db.query<{ status: string }>('SELECT status FROM public.expenses WHERE id = $1', [ownerExpense.id]);
        expect(ownerAfter.status).toBe('paid');
        expect(await creditPayments(p.owner.id)).toEqual([{ id: payout.unit_payment_id, amount: 3000, reference: `parking_payout:${payout.id}` }]);

        // Idempotencia: sincronizar no crea otra liquidación ni otro abono.
        as(p.adminId);
        expect(await ParkingPayoutService.adminSync()).toBe(0);
        await payoutOf(charge.id);
        expect(await creditPayments(p.owner.id)).toHaveLength(1);

        // Sin doble conteo: el abono no es dinero que entra al banco ni se ofrece para conciliar.
        const { balances, bankBalance } = await expectLedgerInvariant(db, p.communityId);
        expect(bankBalance).toBe(3000);
        // El arriendo pagado reconoce la obligación con el dueño (1200 → 2400) y el abono la salda.
        expect(balances.get('2400')).toMatchObject({ debit: 3000, credit: 3000 });
        const reconciliation = await getReconciliation(p.communityId);
        expect(reconciliation.unmatchedPayments.map(item => item.id)).toEqual([tenantPayment.id]);
        const statements = await getFinancialStatements(p.communityId, thisYear(), { cutoffMonth: chileMonth(0), openingCash: 0 });
        expect(statements.cashFlow.totalInflow).toBe(3000);
        expect(statements.income.lines.find(line => line.label.startsWith('Cargos extraordinarios'))?.total).toBe(3000);
        expect(statements.income.expenseLines).toEqual([{ category: 'parking_owner_payouts', label: 'Liquidaciones a dueños de estacionamientos', total: 3000 }]);
        // Solo queda el gasto común del dueño: el arriendo (3000 de ingreso, 3000 liquidados) da 0.
        expect(statements.income.result).toBe(3000);
        expect(statements.position.cash).toBe(3000);
        expect(statements.position.journalBank).toBe(3000);
        expect(statements.position.receivables).toBe(0);

        // RLS: el dueño ve lo suyo; la arrendataria, conserjería y otra comunidad, nada.
        as(p.owner.ownerId);
        expect((await ParkingPayoutService.getMyPayouts()).map(item => item.id)).toEqual([payout.id]);
        as(p.adminId);
        expect((await ParkingPayoutService.getCommunityPayouts(p.communityId)).map(item => item.id)).toEqual([payout.id]);
        as(p.tenant.ownerId);
        expect(await ParkingPayoutService.getCommunityPayouts(p.communityId)).toEqual([]);
        as(p.conciergeId);
        expect(await ParkingPayoutService.getCommunityPayouts(p.communityId)).toEqual([]);
        const other = await seedParking();
        as(other.adminId);
        expect(await ParkingPayoutService.getCommunityPayouts(p.communityId)).toEqual([]);
        await db.transaction(async tx => {
            await tx.exec('SET LOCAL ROLE anon');
            await expect(tx.query('SELECT 1 FROM public.parking_payouts')).rejects.toThrow(/permission denied/);
        });
    });

    it('si en finanzas se elimina el abono, la liquidación vuelve a pendiente y para revisión; reintentar abona de nuevo', async () => {
        const p = await seedParking();
        const charge = await chargeOf(await bookAt(p, 9));
        await tenantPays(p, charge.amount, 'TRF-2');
        const payout = await payoutOf(charge.id);
        await deletePayment(p.communityId, payout.unit_payment_id!);
        expect(await payoutOf(charge.id)).toMatchObject({ status: 'pending', needs_review: true, unit_payment_id: null });
        as(p.adminId);
        expect(await ParkingPayoutService.adminRetry(payout.id)).toBe('credited');
        expect(await creditPayments(p.owner.id)).toHaveLength(1);
        await expectLedgerInvariant(db, p.communityId);
    });

    it('una liquidación ya abonada nunca se revierte sola: si se revierte el pago queda para revisión', async () => {
        const p = await seedParking();
        const bookingId = await bookAt(p, 10);
        const charge = await chargeOf(bookingId);
        const payment = await tenantPays(p, charge.amount, 'TRF-3');
        await deletePayment(p.communityId, String(payment.id));
        expect((await chargeOf(bookingId)).status).toBe('charged');
        expect(await payoutOf(charge.id)).toMatchObject({ status: 'credited', needs_review: true });
        expect(await creditPayments(p.owner.id)).toHaveLength(1);
        as(p.adminId);
        await ParkingPayoutService.adminResolveReview((await payoutOf(charge.id)).id, 'Se conversó con el dueño');
        expect((await payoutOf(charge.id)).needs_review).toBe(false);
        await expectLedgerInvariant(db, p.communityId);
    });
});

describe('transferencia al dueño, marcada por la administración', () => {
    it('comisión 12,5 %: pendiente → reverso del pago (en pausa) → nuevo pago → transferida con asiento 2400/1100', async () => {
        const p = await seedParking({ hourlyRate: 1999, commission: 12.5 });
        as(p.owner.ownerId);
        await ParkingPayoutService.saveMySettings({ destination: 'bank_transfer', ...BANK, creditUnitId: null });

        const bookingId = await bookAt(p, 11, 1);
        // Si la administración cambia la tasa después, rige la de la reserva.
        as(p.adminId);
        await ParkingPayoutService.adminSetCommissionPercent(40);
        const charge = await chargeOf(bookingId);
        const first = await tenantPays(p, charge.amount, 'TRF-4');
        let payout = await payoutOf(charge.id);
        expect(payout).toMatchObject({ status: 'pending', destination: 'bank_transfer', destination_source: 'owner_choice', gross_amount: 1999, commission_amount: 250, net_amount: 1749 });
        expectSplit(payout, 12.5);

        // Una liquidación pendiente no se anula a mano mientras el arriendo siga pagado.
        await expect(ParkingPayoutService.adminCancel(payout.id, 'por error')).rejects.toThrow();
        // El dueño no puede marcarse la transferencia.
        as(p.owner.ownerId);
        await expect(ParkingPayoutService.adminMarkPaid(payout.id, chileToday(), 'X', '')).rejects.toThrow();

        // Se revierte el pago de la arrendataria: la liquidación queda en pausa; al volver a pagar, se reanuda.
        await deletePayment(p.communityId, String(first.id));
        expect((await payoutOf(charge.id)).status).toBe('on_hold');
        await tenantPays(p, charge.amount, 'TRF-4b');
        expect((await payoutOf(charge.id)).status).toBe('pending');

        // Período cerrado: no se marca ni queda a medias (el cierre lo inserta el test como armado).
        await db.query(`INSERT INTO public.finance_period_closures (community_id, month, opening_cash, statements, closed_by) VALUES ($1, $2, 0, '{}'::jsonb, $3)`,
            [p.communityId, chileMonth(0), p.adminId]);
        as(p.adminId);
        await expect(ParkingPayoutService.adminMarkPaid(payout.id, chileToday(), 'TRX-1', '')).rejects.toThrow(/cerrado/);
        expect(await payoutOf(charge.id)).toMatchObject({ status: 'pending', journal_entry_id: null });
        await db.query('DELETE FROM public.finance_period_closures WHERE community_id = $1', [p.communityId]);

        await ParkingPayoutService.adminMarkPaid(payout.id, chileToday(), 'TRX-778', 'Transferencia BCI');
        await expect(ParkingPayoutService.adminMarkPaid(payout.id, chileToday(), 'TRX-779', '')).rejects.toThrow(/pendiente/);
        payout = await payoutOf(charge.id);
        expect(payout.status).toBe('paid');
        const { rows: lines } = await db.query<{ code: string; debit: number; credit: number; source: string; source_record_id: string }>(`
            SELECT a.code, l.debit, l.credit, e.source, e.source_record_id FROM public.journal_entries e
            JOIN public.journal_lines l ON l.entry_id = e.id JOIN public.ledger_accounts a ON a.id = l.account_id
            WHERE e.id = $1 ORDER BY a.code`, [payout.journal_entry_id]);
        expect(lines).toEqual([
            { code: '1100', debit: 0, credit: 1749, source: 'manual', source_record_id: payout.id },
            { code: '2400', debit: 1749, credit: 0, source: 'manual', source_record_id: payout.id },
        ]);
        // Banco = lo que pagó la arrendataria − lo transferido al dueño; nada del abono.
        const { bankBalance, balances } = await expectLedgerInvariant(db, p.communityId);
        expect(bankBalance).toBe(1999 - 1749);
        // La 2400 queda en 0 tras liquidar y la comisión es ingreso de la comunidad
        // (el reconocimiento del primer pago se revirtió y se volvió a registrar).
        expect(net(balances.get('2400'))).toBe(0);
        expect(net(balances.get('4300'))).toBe(250);
        const statements = await getFinancialStatements(p.communityId, thisYear(), { cutoffMonth: chileMonth(0), openingCash: 0 });
        expect(statements.income.result).toBe(250);
        expect(statements.cashFlow.totalOutflow).toBe(1749);
        expect(statements.position.cash).toBe(250);
        expect(statements.position.journalBank).toBe(250);
    });

    it('cancelar sin costo un arriendo ya pagado pausa la transferencia pendiente; el reembolso la anula', async () => {
        const p = await seedParking();
        as(p.owner.ownerId);
        await ParkingPayoutService.saveMySettings({ destination: 'bank_transfer', ...BANK, creditUnitId: null });
        const bookingId = await bookAt(p, 12);
        const charge = await chargeOf(bookingId);
        await tenantPays(p, charge.amount, 'TRF-5');
        await asUser(db, p.tenant.ownerId, tx => tx.query('SELECT public.cancel_parking_booking($1)', [bookingId]));
        expect(await payoutOf(charge.id)).toMatchObject({ status: 'on_hold', needs_review: true });
        await asUser(db, p.adminId, tx => tx.query('SELECT public.admin_mark_parking_charge_refunded($1, $2)', [charge.id, 'Devuelto por transferencia']));
        expect((await chargeOf(bookingId)).status).toBe('refunded');
        expect((await payoutOf(charge.id)).status).toBe('cancelled');
        await expectLedgerInvariant(db, p.communityId);
    });

    it('cancelar un arriendo ya transferido al dueño lo marca para revisión, sin revertir', async () => {
        const p = await seedParking();
        as(p.owner.ownerId);
        await ParkingPayoutService.saveMySettings({ destination: 'bank_transfer', ...BANK, creditUnitId: null });
        const bookingId = await bookAt(p, 13);
        const charge = await chargeOf(bookingId);
        await tenantPays(p, charge.amount, 'TRF-6');
        as(p.adminId);
        await ParkingPayoutService.adminMarkPaid((await payoutOf(charge.id)).id, chileToday(), '', '');
        await asUser(db, p.tenant.ownerId, tx => tx.query('SELECT public.cancel_parking_booking($1)', [bookingId]));
        expect(await payoutOf(charge.id)).toMatchObject({ status: 'paid', needs_review: true });
        await expectLedgerInvariant(db, p.communityId);
    });
});

describe('donación al fondo de reserva y comisión del 100 %', () => {
    it('la donación entra al fondo legal y a los estados como aporte, no como gasto', async () => {
        const p = await seedParking();
        as(p.owner.ownerId);
        await ParkingPayoutService.saveMySettings({ destination: 'reserve_fund_donation', ...NO_BANK, creditUnitId: null });
        const charge = await chargeOf(await bookAt(p, 14));
        await tenantPays(p, charge.amount, 'TRF-7');
        const payout = await payoutOf(charge.id);
        expect(payout).toMatchObject({ status: 'donated', destination: 'reserve_fund_donation', net_amount: 3000 });
        const { rows: [movement] } = await db.query<{ kind: string; amount: number; month: string }>(
            'SELECT kind, amount::int, month FROM public.reserve_fund_movements WHERE id = $1', [payout.reserve_fund_movement_id]);
        expect(movement).toMatchObject({ kind: 'contribution', amount: 3000, month: chileMonth(0) });
        expect((await getReserveFund(p.communityId)).balance).toBe(3000);
        const statements = await getFinancialStatements(p.communityId, thisYear(), { cutoffMonth: chileMonth(0), openingCash: 0 });
        expect(statements.income.reserveTransfer).toBe(3000);
        expect(statements.income.expenseLines).toEqual([]);
        expect(statements.position.reserveFund).toBe(3000);
        expect(await creditPayments(p.owner.id)).toEqual([]);
        const { bankBalance, balances } = await expectLedgerInvariant(db, p.communityId);
        expect(bankBalance).toBe(3000);
        // La donación también salda la 2400: pasa al fondo de reserva (3100).
        expect(balances.get('2400')).toMatchObject({ debit: 3000, credit: 3000 });
        expect(balances.get('3100')).toMatchObject({ debit: 0, credit: 3000 });
    });

    it('con comisión del 100 % la liquidación queda retenida sin mover dinero', async () => {
        const p = await seedParking({ commission: 100 });
        const charge = await chargeOf(await bookAt(p, 15));
        await tenantPays(p, charge.amount, 'TRF-8');
        const payout = await payoutOf(charge.id);
        expect(payout).toMatchObject({ status: 'retained', commission_amount: 3000, net_amount: 0, unit_payment_id: null, reserve_fund_movement_id: null });
        expectSplit(payout, 100);
        expect(await creditPayments(p.owner.id)).toEqual([]);
        const balances = await ledgerBalances(db, p.communityId);
        expect(balances.has('2400')).toBe(false);
        expect(balances.get('4300')).toMatchObject({ debit: 0, credit: 3000 });
        await expectLedgerInvariant(db, p.communityId);
    });
});

/** Proveedor Haulmer de prueba: devuelve un link sin red y cuenta las llamadas. */
function fakeHaulmer() {
    const calls: ParkingChargeProviderInput[] = [];
    const provider: PaymentProvider = {
        id: 'haulmer',
        unavailableReason: () => null,
        createCharge: async input => {
            calls.push(input);
            return { kind: 'checkout', checkoutUrl: `https://pay.example.test/${input.chargeId}`, providerReference: `tuu-${input.chargeId.slice(0, 8)}` };
        },
        refund: async () => ({ refunded: false, reason: 'no aplica' }),
    };
    return { provider, calls };
}

async function webhook(params: Record<string, string>) {
    const body = new URLSearchParams({ ...params, x_signature: signHaulmerParams(params, HAULMER_TEST_KEY) });
    const response = await haulmerWebhook(new Request('https://conviveconnect.test/api/webhooks/haulmer', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString(),
    }));
    return { status: response.status, body: await response.json() as { status?: string; error?: string } };
}

describe('Haulmer: link de pago y webhook firmado', () => {
    it('cobra por Haulmer, el webhook marca pagado y liquida; repetirlo no duplica', async () => {
        const p = await seedParking({ haulmer: true });
        const bookingId = await bookAt(p, 16);
        let charge = await chargeOf(bookingId);
        expect(charge).toMatchObject({ status: 'pending', method: 'haulmer', unit_charge_id: null });

        const haulmer = fakeHaulmer();
        const first = await processParkingCharge(clients.admin as ParkingChargesDb, bookingId, { haulmer: haulmer.provider, returnUrl: 'https://conviveconnect.test/x' });
        expect(first.checkoutUrl).toBe(`https://pay.example.test/${charge.id}`);
        expect(haulmer.calls.map(call => call.amount)).toEqual([3000]);
        // Idempotente: no pide otro link ni crea otro cobro.
        const again = await processParkingCharge(clients.admin as ParkingChargesDb, bookingId, { haulmer: haulmer.provider });
        expect(again.checkoutUrl).toBe(first.checkoutUrl);
        expect(haulmer.calls).toHaveLength(1);

        const base = { x_reference: `PARKING_${charge.id}`, x_result: 'completed', x_currency: 'CLP', x_gateway_reference: 'gw-1' };
        // Firma inválida: 401 y nada cambia.
        const forged = await haulmerWebhook(new Request('https://conviveconnect.test/api/webhooks/haulmer', {
            method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ ...base, x_amount: '3000', x_signature: 'f'.repeat(64) }).toString(),
        }));
        expect(forged.status).toBe(401);
        // Monto distinto: no se marca pagado.
        expect((await webhook({ ...base, x_amount: '2000' })).body.status).toBe('amount_mismatch');
        expect((await chargeOf(bookingId)).status).toBe('pending');

        expect((await webhook({ ...base, x_amount: '3000' })).body.status).toBe('processed');
        charge = await chargeOf(bookingId);
        expect(charge.status).toBe('paid');
        const payout = await payoutOf(charge.id);
        expect(payout).toMatchObject({ status: 'credited', net_amount: 3000 });
        expect(payout.credit_reconciled_at).not.toBeNull();

        // Webhook repetido: idempotente, una liquidación y un abono.
        expect((await webhook({ ...base, x_amount: '3000' })).body.status).toBe('idempotent');
        await payoutOf(charge.id);
        expect(await creditPayments(p.owner.id)).toHaveLength(1);
        await expectLedgerInvariant(db, p.communityId);
    });

    async function payByHaulmer(p: ParkingCommunity, fromHour: number, hours = 2, gateway = `gw-${fromHour}`) {
        const bookingId = await bookAt(p, fromHour, hours);
        const charge = await chargeOf(bookingId);
        await processParkingCharge(clients.admin as ParkingChargesDb, bookingId, { haulmer: fakeHaulmer().provider });
        const params = { x_reference: `PARKING_${charge.id}`, x_result: 'completed', x_amount: String(charge.amount), x_currency: 'CLP', x_gateway_reference: gateway };
        expect((await webhook(params)).body.status).toBe('processed');
        return { bookingId, charge, params };
    }

    it('comisión 0 %: el pago por Haulmer entra al banco contra la 2400; resultado 0 y la 2400 en 0 tras abonar', async () => {
        const p = await seedParking({ haulmer: true, commission: 0 });
        const { charge, params } = await payByHaulmer(p, 19);
        expect((await payoutOf(charge.id)).status).toBe('credited');
        // Webhook repetido: un solo asiento por cobro.
        expect((await webhook(params)).body.status).toBe('idempotent');
        expect(await chargeEntries(charge.id)).toEqual([{ source: 'parking_charge', lines: [
            { code: '1100', debit: 3000, credit: 0 },
            { code: '2400', debit: 0, credit: 3000 },
        ] }]);

        const statements = await getFinancialStatements(p.communityId, thisYear(), { cutoffMonth: chileMonth(0), openingCash: 0 });
        expect(statements.income.totalIncome).toBe(charge.amount);
        expect(statements.income.lines.find(line => line.label.startsWith('Cargos extraordinarios'))?.total).toBe(3000);
        expect(statements.income.totalExpenses).toBe(3000);
        expect(statements.income.result).toBe(0);
        expect(statements.cashFlow.totalInflow).toBe(3000);
        expect(statements.position.cash).toBe(3000);
        expect(statements.position.journalBank).toBe(3000);
        const { bankBalance, balances } = await expectLedgerInvariant(db, p.communityId);
        expect(bankBalance).toBe(3000);
        expect(net(balances.get('2400'))).toBe(0);
    });

    it('comisión 12,5 %: bruto a banco, neto a la 2400 y comisión a ingreso; resultado = comisión y la 2400 en 0 tras transferir', async () => {
        const p = await seedParking({ haulmer: true, commission: 12.5, hourlyRate: 1999 });
        as(p.owner.ownerId);
        await ParkingPayoutService.saveMySettings({ destination: 'bank_transfer', ...BANK, creditUnitId: null });
        const { charge } = await payByHaulmer(p, 20, 1);
        const payout = await payoutOf(charge.id);
        expect(payout).toMatchObject({ status: 'pending', gross_amount: 1999, commission_amount: 250, net_amount: 1749 });
        expect(await chargeEntries(charge.id)).toEqual([{ source: 'parking_charge', lines: [
            { code: '1100', debit: 1999, credit: 0 },
            { code: '2400', debit: 0, credit: 1749 },
            { code: '4300', debit: 0, credit: 250 },
        ] }]);
        // Antes de liquidar, el neto espera al dueño en la 2400.
        expect(net((await expectLedgerInvariant(db, p.communityId)).balances.get('2400'))).toBe(1749);

        as(p.adminId);
        await ParkingPayoutService.adminMarkPaid(payout.id, chileToday(), 'TRX-H1', '');
        const { bankBalance, balances } = await expectLedgerInvariant(db, p.communityId);
        expect(bankBalance).toBe(250);
        expect(net(balances.get('2400'))).toBe(0);
        expect(net(balances.get('4300'))).toBe(250);
        const statements = await getFinancialStatements(p.communityId, thisYear(), { cutoffMonth: chileMonth(0), openingCash: 0 });
        expect(statements.income.totalIncome).toBe(1999);
        expect(statements.income.result).toBe(250);
        expect(statements.position.cash).toBe(250);
        expect(statements.position.journalBank).toBe(250);
    });

    it('el reembolso de un arriendo pagado por Haulmer revierte su asiento y anula la transferencia pendiente', async () => {
        const p = await seedParking({ haulmer: true, commission: 12.5 });
        as(p.owner.ownerId);
        await ParkingPayoutService.saveMySettings({ destination: 'bank_transfer', ...BANK, creditUnitId: null });
        const { bookingId, charge } = await payByHaulmer(p, 21);
        await asUser(db, p.adminId, tx => tx.query('SELECT public.admin_mark_parking_charge_refunded($1, $2)', [charge.id, 'Devuelto por Haulmer']));
        expect((await chargeOf(bookingId)).status).toBe('refunded');
        expect((await payoutOf(charge.id)).status).toBe('cancelled');
        const [recorded, reversed, ...rest] = await chargeEntries(charge.id);
        expect(rest).toEqual([]);
        expect(recorded.source).toBe('parking_charge');
        expect(reversed).toEqual({ source: 'parking_charge_reversal', lines: recorded.lines.map(line => ({ ...line, debit: line.credit, credit: line.debit })) });
        const { bankBalance, balances } = await expectLedgerInvariant(db, p.communityId);
        expect(bankBalance).toBe(0);
        expect(net(balances.get('2400'))).toBe(0);
        expect(net(balances.get('4300'))).toBe(0);
        const statements = await getFinancialStatements(p.communityId, thisYear(), { cutoffMonth: chileMonth(0), openingCash: 0 });
        expect(statements.income.totalIncome).toBe(0);
        expect(statements.income.result).toBe(0);
        expect(statements.cashFlow.totalInflow - statements.cashFlow.totalOutflow).toBe(0);
        expect(statements.position.cash).toBe(0);
    });

    it('reembolsar después de abonar al dueño revierte la entrada pero no el abono: queda para revisión y la 2400 lo muestra', async () => {
        const p = await seedParking({ haulmer: true });
        const { charge } = await payByHaulmer(p, 6);
        expect((await payoutOf(charge.id)).status).toBe('credited');
        await asUser(db, p.adminId, tx => tx.query('SELECT public.admin_mark_parking_charge_refunded($1, $2)', [charge.id, 'Devuelto por Haulmer']));
        expect(await payoutOf(charge.id)).toMatchObject({ status: 'credited', needs_review: true });
        const { bankBalance, balances } = await expectLedgerInvariant(db, p.communityId);
        expect(bankBalance).toBe(0);
        // Deudora por lo ya abonado: lo que hay que regularizar con el dueño.
        expect(net(balances.get('2400'))).toBe(-3000);
    });

    it('si Haulmer no está disponible, el cobro cae a gastos comunes', async () => {
        const p = await seedParking({ haulmer: true });
        const bookingId = await bookAt(p, 17);
        const unavailable: PaymentProvider = { ...fakeHaulmer().provider, unavailableReason: () => 'Haulmer no habilitado en el servidor' };
        const result = await processParkingCharge(clients.admin as ParkingChargesDb, bookingId, { haulmer: unavailable });
        expect(result.checkoutUrl).toBeNull();
        expect(await chargeOf(bookingId)).toMatchObject({ status: 'charged', method: 'common_expenses' });
    });
});

describe('textos al dueño', () => {
    it('los avisos de liquidación van en positivo, sin lenguaje de deudor', async () => {
        const p = await seedParking();
        const charge = await chargeOf(await bookAt(p, 18));
        await tenantPays(p, charge.amount, 'TRF-9');
        const { rows } = await db.query<{ title: string; body: string }>(
            `SELECT title, body FROM public.notifications WHERE user_id = $1`, [p.owner.ownerId]);
        for (const row of rows) {
            expect(`${row.title} ${row.body}`).not.toMatch(DEBTOR_PATTERN);
        }
    });
});
