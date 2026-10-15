/**
 * Liquidación al dueño de los arriendos de estacionamiento, contra Postgres real
 * (PGlite) con las migraciones del repo: cuándo se crea, el cálculo de comisión
 * y neto en la base, los tres destinos, las reversas y el RLS.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asServiceRole, asUser, chargeFor, seedCommunity, tomorrowAt, type SeededCommunity } from '../fixtures/parkingChargesDb';
import { createParkingPayoutsDb } from '../fixtures/parkingPayoutsDb';
import { splitParkingPayout } from '@/lib/parkingPayouts/payouts';

let db: PGlite;

beforeAll(async () => {
    db = await createParkingPayoutsDb();
}, 90_000);

interface PayoutRow {
    id: string;
    charge_id: string;
    owner_id: string;
    gross_amount: number;
    commission_amount: number;
    net_amount: number;
    commission_source: string;
    destination: string;
    destination_source: string;
    status: string;
    needs_review: boolean;
    review_reason: string | null;
    credit_unit_id: string | null;
    unit_payment_id: string | null;
    reserve_fund_movement_id: string | null;
    bank_snapshot: Record<string, string> | null;
    paid_on: string | null;
}

async function bookAsResident(c: SeededCommunity, fromHour = 10, toHour = 12): Promise<string> {
    const startsAt = await tomorrowAt(db, fromHour);
    const endsAt = await tomorrowAt(db, toHour);
    return asUser(db, c.residentId, async () => (await db.query<{ id: string }>(
        'SELECT public.create_parking_booking($1, $2, $3) AS id', [c.spotId, startsAt, endsAt],
    )).rows[0].id);
}

/** El arrendatario paga el cargo en la cartola (lo que hace reconcileUnitStatuses). */
async function tenantPays(bookingId: string) {
    const charge = (await chargeFor(db, bookingId))!;
    await db.query(`UPDATE public.unit_charges SET status = 'paid' WHERE id = $1`, [charge.unit_charge_id]);
    return charge;
}

async function payoutFor(chargeId: string): Promise<PayoutRow | undefined> {
    const { rows } = await db.query<PayoutRow>('SELECT * FROM public.parking_payouts WHERE charge_id = $1', [chargeId]);
    return rows[0];
}

async function payoutEvents(payoutId: string) {
    const { rows } = await db.query<{ event_type: string }>(
        'SELECT event_type FROM public.parking_payout_events WHERE payout_id = $1 ORDER BY seq', [payoutId],
    );
    return rows.map(row => row.event_type);
}

async function setSettings(c: SeededCommunity, args: {
    destination: string | null; bank?: boolean; creditUnitId?: string | null;
}) {
    return asUser(db, c.ownerId, () => db.query(
        'SELECT * FROM public.parking_set_my_payout_settings($1, $2, $3, $4, $5, $6, $7)',
        [
            args.destination,
            args.bank ? 'Banco de Chile' : null,
            args.bank ? 'corriente' : null,
            args.bank ? '00-123-45678-09' : null,
            args.bank ? '12.345.678-5' : null,
            args.bank ? 'Dueña de Prueba' : null,
            args.creditUnitId ?? null,
        ],
    ));
}

describe('cuándo se liquida', () => {
    it('"cargado a gastos comunes" no cuenta: la liquidación nace cuando el arrendatario paga', async () => {
        const c = await seedCommunity(db);
        const bookingId = await bookAsResident(c);
        const charge = (await chargeFor(db, bookingId))!;
        expect(charge.status).toBe('charged');
        expect(await payoutFor(charge.id)).toBeUndefined();

        await tenantPays(bookingId);
        const payout = (await payoutFor(charge.id))!;
        expect(payout).toBeDefined();
        expect(payout.gross_amount).toBe(3000);
    });

    it('el pago por Haulmer también liquida', async () => {
        const c = await seedCommunity(db);
        await db.query(`UPDATE public.communities SET parking_billing_method = 'haulmer' WHERE id = $1`, [c.communityId]);
        const charge = (await chargeFor(db, await bookAsResident(c)))!;
        await asServiceRole(db, () => db.query(
            `SELECT public.parking_charge_apply_provider_result($1, 'completed', 3000, 'gw-9')`, [charge.id],
        ));
        expect((await payoutFor(charge.id))!.status).toBe('credited');
    });

    it('es idempotente: una sola liquidación por cobro', async () => {
        const c = await seedCommunity(db);
        const charge = await tenantPays(await bookAsResident(c));
        await asUser(db, c.adminId, () => db.query('SELECT public.admin_sync_parking_payouts()'));
        await db.query('SELECT public.parking_payout_open($1)', [charge.id]);
        const { rows } = await db.query('SELECT 1 FROM public.parking_payouts WHERE charge_id = $1', [charge.id]);
        expect(rows).toHaveLength(1);
        const { rows: credits } = await db.query(
            `SELECT 1 FROM public.unit_payments WHERE reference LIKE 'parking_payout:%' AND unit_id = $1`, [c.ownerUnitId],
        );
        expect(credits).toHaveLength(1);
    });

    it('un arriendo gratis no genera liquidación', async () => {
        const c = await seedCommunity(db, { hourlyRate: 0 });
        const charge = (await chargeFor(db, await bookAsResident(c)))!;
        expect(charge.status).toBe('paid');
        expect(await payoutFor(charge.id)).toBeUndefined();
    });
});

describe('comisión de la comunidad', () => {
    it('usa la comisión que quedó fijada en la reserva y cuadra bruto = comisión + neto', async () => {
        const c = await seedCommunity(db, { hourlyRate: 1999 });
        await db.query('UPDATE public.communities SET parking_commission_percent = 12.5 WHERE id = $1', [c.communityId]);
        const bookingId = await bookAsResident(c, 10, 11);
        // Si la administración cambia la tasa después, rige la de la reserva.
        await db.query('UPDATE public.communities SET parking_commission_percent = 40 WHERE id = $1', [c.communityId]);
        const charge = await tenantPays(bookingId);
        const payout = (await payoutFor(charge.id))!;
        expect(payout.commission_source).toBe('booking');
        expect(payout.commission_amount).toBe(250); // 1.999 × 12,5 % = 249,875 → 250
        expect(payout.net_amount).toBe(1749);
        expect(payout.gross_amount).toBe(payout.commission_amount + payout.net_amount);
    });

    it('la función de la base y la de la app redondean igual', async () => {
        const cases: Array<[number, number]> = [
            [2500, 10], [50, 1], [49, 1], [1500, 12.35], [1999, 12.5], [1004, 12.5], [10000, 0.29], [100, 33.33], [7, 100], [123457, 0.01],
        ];
        for (const [gross, rate] of cases) {
            const { rows } = await db.query<{ commission_amount: number; net_amount: number }>(
                'SELECT * FROM public.parking_payout_split($1, $2)', [gross, rate],
            );
            const app = splitParkingPayout(gross, rate);
            expect({ commission: rows[0].commission_amount, net: rows[0].net_amount }).toEqual({ commission: app.commission, net: app.net });
        }
    });

    it('la comisión acepta 0–100 % con 2 decimales y solo la fija la administración', async () => {
        const c = await seedCommunity(db);
        const set = (userId: string, value: number) => asUser(db, userId, () => db.query(
            'SELECT public.admin_set_parking_commission_percent($1)', [value],
        ));
        await set(c.adminId, 100);
        await set(c.adminId, 12.35);
        await expect(set(c.adminId, 100.01)).rejects.toThrow(/0 a 100/);
        await expect(set(c.adminId, 1.234)).rejects.toThrow(/2 decimales/);
        await expect(set(c.ownerId, 5)).rejects.toThrow(/Solo la administración/);
        const { rows } = await db.query<{ p: string }>('SELECT parking_commission_percent::text AS p FROM public.communities WHERE id = $1', [c.communityId]);
        expect(rows[0].p).toBe('12.35');
    });

    it('con comisión del 100 % la liquidación queda cerrada sin mover dinero', async () => {
        const c = await seedCommunity(db);
        await db.query('UPDATE public.communities SET parking_commission_percent = 100 WHERE id = $1', [c.communityId]);
        const charge = await tenantPays(await bookAsResident(c));
        const payout = (await payoutFor(charge.id))!;
        expect(payout).toMatchObject({ status: 'retained', net_amount: 0, commission_amount: 3000 });
    });
});

describe('destino de lo recaudado', () => {
    it('por defecto (sin elección ni datos bancarios): abono automático a la unidad del dueño', async () => {
        const c = await seedCommunity(db);
        const charge = await tenantPays(await bookAsResident(c));
        const payout = (await payoutFor(charge.id))!;
        expect(payout).toMatchObject({
            destination: 'common_expenses_credit', destination_source: 'default_credit',
            status: 'credited', credit_unit_id: c.ownerUnitId,
        });
        const { rows } = await db.query<{ unit_id: string; amount: string; method: string; reference: string }>(
            'SELECT unit_id, amount, method, reference FROM public.unit_payments WHERE id = $1', [payout.unit_payment_id],
        );
        expect(rows[0]).toMatchObject({ unit_id: c.ownerUnitId, method: 'other', reference: `parking_payout:${payout.id}` });
        expect(Number(rows[0].amount)).toBe(3000);

        // El abono no infla el banco: va contra la cuenta 2400, no contra 1100.
        const { rows: lines } = await db.query<{ code: string; debit: number; credit: number }>(
            `SELECT a.code, l.debit, l.credit FROM public.journal_entries e
               JOIN public.journal_lines l ON l.entry_id = e.id
               JOIN public.ledger_accounts a ON a.id = l.account_id
             WHERE e.source_record_id = $1 ORDER BY a.code`, [payout.unit_payment_id],
        );
        expect(lines).toEqual([
            { code: '1200', debit: 0, credit: 3000 },
            { code: '2400', debit: 3000, credit: 0 },
        ]);
        expect(await payoutEvents(payout.id)).toEqual(['created', 'credited_to_unit']);
    });

    it('por defecto con datos bancarios completos: transferencia pendiente, con la foto de los datos', async () => {
        const c = await seedCommunity(db);
        await setSettings(c, { destination: null, bank: true });
        const charge = await tenantPays(await bookAsResident(c));
        const payout = (await payoutFor(charge.id))!;
        expect(payout).toMatchObject({ destination: 'bank_transfer', destination_source: 'default_bank', status: 'pending' });
        expect(payout.bank_snapshot).toMatchObject({ bank_name: 'Banco de Chile', holder_rut: '12345678-5' });

        // La administración transfiere fuera de la app y la marca pagada.
        const { rows: today } = await db.query<{ d: string }>(`SELECT to_char((NOW() AT TIME ZONE 'America/Santiago')::date, 'YYYY-MM-DD') AS d`);
        await expect(asUser(db, c.ownerId, () => db.query(
            'SELECT public.admin_mark_parking_payout_paid($1, $2::date, $3, $4)', [payout.id, today[0].d, 'X', null],
        ))).rejects.toThrow(/Solo la administración/);
        await expect(asUser(db, c.adminId, () => db.query(
            `SELECT public.admin_mark_parking_payout_paid($1, ($2::date + 3), NULL, NULL)`, [payout.id, today[0].d],
        ))).rejects.toThrow(/no puede ser futura/);
        await asUser(db, c.adminId, () => db.query(
            'SELECT public.admin_mark_parking_payout_paid($1, $2::date, $3, $4)', [payout.id, today[0].d, 'TRX-778', 'Transferencia BCI'],
        ));
        const paid = (await payoutFor(charge.id))!;
        expect(paid.status).toBe('paid');
        expect(await payoutEvents(paid.id)).toEqual(['created', 'transfer_marked_paid']);
        // Una transferencia no toca la cuenta de la unidad.
        const { rows } = await db.query(`SELECT 1 FROM public.unit_payments WHERE reference = $1`, [`parking_payout:${paid.id}`]);
        expect(rows).toHaveLength(0);
    });

    it('donación al fondo de reserva: aporte automático en el fondo legal', async () => {
        const c = await seedCommunity(db);
        await setSettings(c, { destination: 'reserve_fund_donation' });
        const charge = await tenantPays(await bookAsResident(c));
        const payout = (await payoutFor(charge.id))!;
        expect(payout).toMatchObject({ destination: 'reserve_fund_donation', destination_source: 'owner_choice', status: 'donated' });
        const { rows } = await db.query<{ kind: string; amount: string; label: string }>(
            'SELECT kind, amount, label FROM public.reserve_fund_movements WHERE id = $1', [payout.reserve_fund_movement_id],
        );
        expect(rows[0].kind).toBe('contribution');
        expect(Number(rows[0].amount)).toBe(3000);
        expect(rows[0].label.startsWith('[')).toBe(false); // sin prefijo = fondo de reserva legal
    });

    it('el destino queda congelado: cambiar la preferencia solo afecta a las siguientes', async () => {
        const c = await seedCommunity(db);
        await setSettings(c, { destination: 'bank_transfer', bank: true });
        const first = await tenantPays(await bookAsResident(c, 8, 10));
        await setSettings(c, { destination: 'reserve_fund_donation', bank: true });
        const second = await tenantPays(await bookAsResident(c, 14, 16));
        expect((await payoutFor(first.id))!).toMatchObject({ destination: 'bank_transfer', status: 'pending' });
        expect((await payoutFor(second.id))!).toMatchObject({ destination: 'reserve_fund_donation', status: 'donated' });
        await expect(db.query(
            `UPDATE public.parking_payouts SET destination = 'reserve_fund_donation' WHERE charge_id = $1`, [first.id],
        )).rejects.toThrow(/no cambia/);
    });

    it('si el abono no se puede hacer (período cerrado) queda pendiente y para revisión, sin romper el pago', async () => {
        const c = await seedCommunity(db);
        const bookingId = await bookAsResident(c);
        await db.query(`INSERT INTO public.finance_period_closures (community_id, month) VALUES ($1, '2999-12')`, [c.communityId]);
        const charge = (await chargeFor(db, bookingId))!;
        // Cerrar el período no impide marcar pagado el cargo (solo cambia estado).
        await db.query(`UPDATE public.unit_charges SET status = 'paid' WHERE id = $1`, [charge.unit_charge_id]);
        expect((await chargeFor(db, bookingId))!.status).toBe('paid');
        const payout = (await payoutFor(charge.id))!;
        expect(payout).toMatchObject({ status: 'pending', needs_review: true });
        expect(payout.review_reason).toMatch(/No se pudo abonar/);

        await db.query('DELETE FROM public.finance_period_closures WHERE community_id = $1', [c.communityId]);
        const result = await asUser(db, c.adminId, async () => (await db.query<{ r: string }>(
            'SELECT public.admin_retry_parking_payout($1) AS r', [payout.id],
        )).rows[0].r);
        expect(result).toBe('credited');
    });

    it('el dueño con varias unidades y sin elegir cuál: queda para revisión', async () => {
        const c = await seedCommunity(db);
        const extraUnit = crypto.randomUUID();
        await db.query(`INSERT INTO public.units (id, community_id, number, owner_id) VALUES ($1, $2, '303', $3)`, [extraUnit, c.communityId, c.ownerId]);
        await db.query('UPDATE public.profiles SET unit_id = NULL WHERE id = $1', [c.ownerId]);
        const charge = await tenantPays(await bookAsResident(c));
        expect((await payoutFor(charge.id))!).toMatchObject({ status: 'pending', needs_review: true, credit_unit_id: null });

        // Si elige la unidad, la siguiente se abona allí.
        await setSettings(c, { destination: 'common_expenses_credit', creditUnitId: extraUnit });
        const next = await tenantPays(await bookAsResident(c, 15, 16));
        expect((await payoutFor(next.id))!).toMatchObject({ status: 'credited', credit_unit_id: extraUnit });
    });
});

describe('reversas y cancelaciones', () => {
    it('si se revierte el pago del arrendatario, la transferencia pendiente se pausa y se reanuda al volver a pagar', async () => {
        const c = await seedCommunity(db);
        await setSettings(c, { destination: 'bank_transfer', bank: true });
        const charge = await tenantPays(await bookAsResident(c));
        await db.query(`UPDATE public.unit_charges SET status = 'pending' WHERE id = $1`, [charge.unit_charge_id]);
        expect((await payoutFor(charge.id))!.status).toBe('on_hold');
        await db.query(`UPDATE public.unit_charges SET status = 'paid' WHERE id = $1`, [charge.unit_charge_id]);
        const payout = (await payoutFor(charge.id))!;
        expect(payout.status).toBe('pending');
        expect(await payoutEvents(payout.id)).toEqual(['created', 'charge_payment_reversed', 'resumed']);
    });

    it('una liquidación ya abonada no se revierte sola: queda para revisión', async () => {
        const c = await seedCommunity(db);
        const charge = await tenantPays(await bookAsResident(c));
        await db.query(`UPDATE public.unit_charges SET status = 'pending' WHERE id = $1`, [charge.unit_charge_id]);
        const payout = (await payoutFor(charge.id))!;
        expect(payout).toMatchObject({ status: 'credited', needs_review: true });
        const { rows } = await db.query('SELECT 1 FROM public.unit_payments WHERE id = $1', [payout.unit_payment_id]);
        expect(rows).toHaveLength(1);
    });

    it('cancelar sin costo una reserva ya pagada pausa la transferencia pendiente; el reembolso la anula', async () => {
        const c = await seedCommunity(db);
        await setSettings(c, { destination: 'bank_transfer', bank: true });
        const bookingId = await bookAsResident(c);
        const charge = await tenantPays(bookingId);
        await asUser(db, c.ownerId, () => db.query('SELECT public.cancel_parking_booking($1)', [bookingId]));
        expect((await payoutFor(charge.id))!).toMatchObject({ status: 'on_hold', needs_review: true });

        await asUser(db, c.adminId, () => db.query(
            'SELECT public.admin_mark_parking_charge_refunded($1, $2)', [charge.id, 'Transferencia 991'],
        ));
        expect((await payoutFor(charge.id))!.status).toBe('cancelled');
    });

    it('cancelar una reserva ya transferida al dueño la marca para revisión sin revertir', async () => {
        const c = await seedCommunity(db);
        await setSettings(c, { destination: 'bank_transfer', bank: true });
        const bookingId = await bookAsResident(c);
        const charge = await tenantPays(bookingId);
        const payout = (await payoutFor(charge.id))!;
        const { rows: today } = await db.query<{ d: string }>(`SELECT to_char((NOW() AT TIME ZONE 'America/Santiago')::date, 'YYYY-MM-DD') AS d`);
        await asUser(db, c.adminId, () => db.query(
            'SELECT public.admin_mark_parking_payout_paid($1, $2::date, NULL, NULL)', [payout.id, today[0].d],
        ));
        await asUser(db, c.residentId, () => db.query('SELECT public.cancel_parking_booking($1)', [bookingId]));
        expect((await payoutFor(charge.id))!).toMatchObject({ status: 'paid', needs_review: true });

        await asUser(db, c.adminId, () => db.query(
            'SELECT public.admin_resolve_parking_payout_review($1, $2)', [payout.id, 'Se acordó con la dueña'],
        ));
        expect((await payoutFor(charge.id))!.needs_review).toBe(false);
    });

    it('la máquina de estados no deja reabrir una liquidación cerrada', async () => {
        const c = await seedCommunity(db);
        const charge = await tenantPays(await bookAsResident(c));
        await expect(db.query(`UPDATE public.parking_payouts SET status = 'pending' WHERE charge_id = $1`, [charge.id]))
            .rejects.toThrow(/Transición de liquidación inválida/);
        await expect(db.query(`UPDATE public.parking_payouts SET net_amount = 1 WHERE charge_id = $1`, [charge.id]))
            .rejects.toThrow(/no cambia/);
    });
});

describe('RLS y permisos', () => {
    it('el dueño ve lo suyo; la administración su comunidad; conserjería, el arrendatario y otras comunidades nada', async () => {
        const a = await seedCommunity(db);
        const b = await seedCommunity(db);
        await setSettings(a, { destination: null, bank: true });
        const chargeA = await tenantPays(await bookAsResident(a));
        await tenantPays(await bookAsResident(b));

        const payouts = (userId: string) => asUser(db, userId, async () => (await db.query<{ charge_id: string; community_id: string }>(
            'SELECT charge_id, community_id FROM public.parking_payouts',
        )).rows);
        const settings = (userId: string) => asUser(db, userId, async () => (await db.query<{ profile_id: string }>(
            'SELECT profile_id FROM public.parking_owner_payout_settings',
        )).rows);

        expect((await payouts(a.ownerId)).map(row => row.charge_id)).toEqual([chargeA.id]);
        expect((await payouts(a.adminId)).every(row => row.community_id === a.communityId)).toBe(true);
        expect(await payouts(a.conciergeId)).toEqual([]);
        expect(await payouts(a.residentId)).toEqual([]);
        expect((await payouts(b.adminId)).some(row => row.community_id === a.communityId)).toBe(false);

        // Datos bancarios: solo el dueño y la administración de su comunidad.
        expect((await settings(a.ownerId)).map(row => row.profile_id)).toEqual([a.ownerId]);
        expect((await settings(a.adminId)).map(row => row.profile_id)).toContain(a.ownerId);
        expect(await settings(a.conciergeId)).toEqual([]);
        expect(await settings(a.residentId)).toEqual([]);
        expect((await settings(b.adminId)).map(row => row.profile_id)).not.toContain(a.ownerId);
    });

    it('nadie escribe directo ni llama funciones internas; anon no tiene acceso', async () => {
        const a = await seedCommunity(db);
        const charge = await tenantPays(await bookAsResident(a));
        const payout = (await payoutFor(charge.id))!;
        await expect(asUser(db, a.ownerId, () => db.query(
            `UPDATE public.parking_payouts SET status = 'paid' WHERE id = $1`, [payout.id],
        ))).rejects.toThrow(/permission denied/);
        await expect(asUser(db, a.ownerId, () => db.query(
            `INSERT INTO public.parking_owner_payout_settings (community_id, profile_id) VALUES ($1, $2)`, [a.communityId, a.ownerId],
        ))).rejects.toThrow(/permission denied/);
        await expect(asUser(db, a.adminId, () => db.query('SELECT public.parking_payout_execute($1)', [payout.id])))
            .rejects.toThrow(/permission denied/);
        await expect(asUser(db, a.ownerId, () => db.query('TRUNCATE public.parking_payouts')))
            .rejects.toThrow(/permission denied/);

        await db.exec('SET ROLE anon');
        try {
            await expect(db.query('SELECT 1 FROM public.parking_payouts')).rejects.toThrow(/permission denied/);
            await expect(db.query(`SELECT public.parking_set_my_payout_settings('bank_transfer')`)).rejects.toThrow(/permission denied/);
        } finally {
            await db.exec('RESET ROLE');
        }
    });

    it('la administración de otra comunidad no puede operar una liquidación ajena', async () => {
        const a = await seedCommunity(db);
        const b = await seedCommunity(db);
        await setSettings(a, { destination: 'bank_transfer', bank: true });
        const payout = (await payoutFor((await tenantPays(await bookAsResident(a))).id))!;
        await expect(asUser(db, b.adminId, () => db.query(
            'SELECT public.admin_cancel_parking_payout($1, $2)', [payout.id, 'intento ajeno'],
        ))).rejects.toThrow(/no pertenece a tu comunidad/);
    });

    it('la preferencia valida RUT, datos completos y que la unidad sea del dueño', async () => {
        const a = await seedCommunity(db);
        const save = (args: unknown[]) => asUser(db, a.ownerId, () => db.query(
            'SELECT * FROM public.parking_set_my_payout_settings($1, $2, $3, $4, $5, $6, $7)', args,
        ));
        await expect(save(['bank_transfer', 'Banco', 'corriente', '123456', null, 'Titular', null])).rejects.toThrow(/completa banco/);
        await expect(save([null, 'Banco', 'corriente', '123456', '12.345.678-9', 'Titular', null])).rejects.toThrow(/RUT/);
        await expect(save(['common_expenses_credit', null, null, null, null, null, a.residentUnitId])).rejects.toThrow(/no está asociada/);
        const { rows } = await save(['bank_transfer', 'Banco Estado', 'vista', '1234-5678', '7.654.321-6', 'Titular', null]);
        expect((rows[0] as { holder_rut: string }).holder_rut).toBe('7654321-6');
    });
});

describe('migración', () => {
    it('se puede aplicar dos veces sin duplicar liquidaciones', async () => {
        const c = await seedCommunity(db);
        const charge = await tenantPays(await bookAsResident(c));
        await db.exec(readFileSync(resolve(process.cwd(), 'supabase/migrations/20261015060000_parking_owner_payouts.sql'), 'utf8'));
        const { rows } = await db.query('SELECT 1 FROM public.parking_payouts WHERE charge_id = $1', [charge.id]);
        expect(rows).toHaveLength(1);
    });

    it('los cobros pagados antes de la migración quedan pendientes y para revisión, sin abonar nada', async () => {
        const c = await seedCommunity(db);
        const charge = await tenantPays(await bookAsResident(c));
        const payout = (await payoutFor(charge.id))!;
        // Simula un cobro pagado antes de la migración: sin liquidación ni abono.
        await db.query('DELETE FROM public.unit_payments WHERE id = $1', [payout.unit_payment_id]);
        await db.query('DELETE FROM public.parking_payouts WHERE id = $1', [payout.id]);
        await db.exec(readFileSync(resolve(process.cwd(), 'supabase/migrations/20261015060000_parking_owner_payouts.sql'), 'utf8'));
        const backfilled = (await payoutFor(charge.id))!;
        expect(backfilled).toMatchObject({ status: 'pending', needs_review: true, unit_payment_id: null });
        expect(await payoutEvents(backfilled.id)).toEqual(['backfilled']);
    });
});
