/**
 * Libro de cobros de estacionamientos, contra Postgres real (PGlite) con las
 * migraciones del repo. Cubre lo que no se puede probar con mocks: la UNIQUE
 * que garantiza un cobro por reserva, los triggers que cargan y revierten en
 * unit_charges, la regla de cancelación y el RLS por comunidad.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
    asServiceRole,
    asUser,
    chargeFor,
    createParkingDb,
    seedCommunity,
    tomorrowAt,
    type SeededCommunity,
} from '../fixtures/parkingChargesDb';

let db: PGlite;

beforeAll(async () => {
    db = await createParkingDb();
}, 60_000);

async function bookAsResident(c: SeededCommunity, fromHour = 10, toHour = 12): Promise<string> {
    const startsAt = await tomorrowAt(db, fromHour);
    const endsAt = await tomorrowAt(db, toHour);
    return asUser(db, c.residentId, async () => {
        const { rows } = await db.query<{ id: string }>(
            'SELECT public.create_parking_booking($1, $2, $3) AS id',
            [c.spotId, startsAt, endsAt],
        );
        return rows[0].id;
    });
}

async function unitCharges(communityId: string) {
    const { rows } = await db.query<{ id: string; unit_id: string; amount: string; status: string; kind: string; notes: string }>(
        'SELECT id, unit_id, amount, status, kind, notes FROM public.unit_charges WHERE community_id = $1',
        [communityId],
    );
    return rows;
}

async function events(chargeId: string) {
    const { rows } = await db.query<{ event_type: string; from_status: string | null; to_status: string | null }>(
        'SELECT event_type, from_status, to_status FROM public.parking_charge_events WHERE charge_id = $1 ORDER BY seq',
        [chargeId],
    );
    return rows.map(row => row.event_type);
}

async function bookingPaymentStatus(bookingId: string) {
    const { rows } = await db.query<{ payment_status: string }>(
        'SELECT payment_status FROM public.parking_bookings WHERE id = $1',
        [bookingId],
    );
    return rows[0]?.payment_status;
}

describe('cobro al reservar (método por defecto: gastos comunes)', () => {
    it('una reserva confirmada genera exactamente un cobro, cargado a la unidad del residente', async () => {
        const c = await seedCommunity(db);
        const bookingId = await bookAsResident(c);

        const charge = await chargeFor(db, bookingId);
        expect(charge).toMatchObject({
            status: 'charged',
            method: 'common_expenses',
            amount: 3000, // 2 h x $1.500, calculado por la base
            unit_id: c.residentUnitId,
            payer_profile_id: c.residentId,
            needs_review: false,
        });

        const rows = await unitCharges(c.communityId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            id: charge!.unit_charge_id,
            unit_id: c.residentUnitId,
            kind: 'service',
            status: 'pending',
            notes: `parking_booking:${bookingId}`,
        });
        expect(Number(rows[0].amount)).toBe(3000);
        expect(await bookingPaymentStatus(bookingId)).toBe('pending');
        expect(await events(charge!.id)).toEqual(['created', 'posted_to_unit']);
    });

    it('es idempotente: reintentar el cargo o insertar otro cobro para la misma reserva no duplica nada', async () => {
        const c = await seedCommunity(db);
        const bookingId = await bookAsResident(c);
        const charge = (await chargeFor(db, bookingId))!;

        // Reintento del servidor (p. ej. el proveedor respondió tarde).
        const retry = await asServiceRole(db, async () => (await db.query<{ r: string }>(
            'SELECT public.parking_charge_fallback_to_unit($1, $2) AS r',
            [charge.id, 'reintento'],
        )).rows[0].r);
        expect(retry).toBe('charged');

        // Un segundo cobro para la misma reserva choca con la UNIQUE.
        await expect(db.query(
            `INSERT INTO public.parking_charges (community_id, booking_id, driver_id, amount, method)
             SELECT community_id, booking_id, driver_id, amount, method FROM public.parking_charges WHERE id = $1`,
            [charge.id],
        )).rejects.toThrow(/parking_charges_booking_unique/);

        // Ni un segundo cargo en la cuenta de la unidad para el mismo arriendo.
        await expect(db.query(
            `INSERT INTO public.unit_charges (community_id, unit_id, month, kind, label, amount, notes)
             VALUES ($1, $2, '2026-10', 'service', 'duplicado', 3000, $3)`,
            [c.communityId, c.residentUnitId, `parking_booking:${bookingId}`],
        )).rejects.toThrow(/idx_unit_charges_parking_booking_once/);

        expect(await unitCharges(c.communityId)).toHaveLength(1);
        const { rows } = await db.query('SELECT 1 FROM public.parking_charges WHERE booking_id = $1', [bookingId]);
        expect(rows).toHaveLength(1);
    });

    it('el monto lo calcula la base: una reserva con un monto distinto a la tarifa se rechaza', async () => {
        const c = await seedCommunity(db, { hourlyRate: 2000 });
        const startsAt = await tomorrowAt(db, 10);
        const endsAt = await tomorrowAt(db, 13);

        // Ni siquiera la service role puede colar un monto propio.
        await expect(db.query(
            `INSERT INTO public.parking_bookings (community_id, spot_id, driver_id, owner_id, driver_is_resident,
               starts_at, ends_at, total_amount, access_code)
             SELECT $1, $2, d.id, $3, TRUE, $4, $5, 1, 'HACK01' FROM public.parking_drivers d WHERE d.user_id = $6`,
            [c.communityId, c.spotId, c.ownerId, startsAt, endsAt, c.residentId],
        )).rejects.toThrow(/no coincide con la tarifa/);

        // Y el residente no tiene permiso de escribir reservas directo.
        await expect(asUser(db, c.residentId, () => db.query(
            `INSERT INTO public.parking_bookings (community_id, spot_id, driver_id, owner_id, starts_at, ends_at, total_amount, access_code)
             VALUES ($1, $2, $2, $3, $4, $5, 1, 'HACK02')`,
            [c.communityId, c.spotId, c.ownerId, startsAt, endsAt],
        ))).rejects.toThrow(/permission denied|row-level security/);

        // Por la vía normal, el cobro sale de la tarifa: 3 h x $2.000.
        const bookingId = await asUser(db, c.residentId, async () => (await db.query<{ id: string }>(
            'SELECT public.create_parking_booking($1, $2, $3) AS id', [c.spotId, startsAt, endsAt],
        )).rows[0].id);
        expect((await chargeFor(db, bookingId))!.amount).toBe(6000);
    });

    it('la tarifa diaria actúa como techo también en el cobro', async () => {
        const c = await seedCommunity(db, { hourlyRate: 2000, dailyRate: 5000 });
        const bookingId = await bookAsResident(c, 8, 18); // 10 h x 2.000 = 20.000 > 5.000
        expect((await chargeFor(db, bookingId))!.amount).toBe(5000);
    });

    it('cuando el staff reserva para un residente (CoCo / Agent Center), el cargo va a la unidad del residente', async () => {
        const c = await seedCommunity(db);
        const startsAt = await tomorrowAt(db, 15);
        const endsAt = await tomorrowAt(db, 16);
        const bookingId = await asServiceRole(db, async () => (await db.query<{ id: string }>(
            'SELECT public.coco_create_parking_booking($1, $2, $3, $4) AS id',
            [c.residentId, c.spotId, startsAt, endsAt],
        )).rows[0].id);

        const charge = (await chargeFor(db, bookingId))!;
        expect(charge.unit_id).toBe(c.residentUnitId);
        expect(charge.unit_id).not.toBe(c.ownerUnitId);
        const rows = await unitCharges(c.communityId);
        expect(rows.map(row => row.unit_id)).toEqual([c.residentUnitId]);
    });

    it('un residente sin unidad asociada no rompe la reserva: el cobro queda pendiente y marcado para revisión', async () => {
        const c = await seedCommunity(db);
        await db.query('UPDATE public.profiles SET unit_id = NULL WHERE id = $1', [c.residentId]);
        await db.query('UPDATE public.units SET owner_id = NULL WHERE id = $1', [c.residentUnitId]);
        const bookingId = await bookAsResident(c);

        const charge = (await chargeFor(db, bookingId))!;
        expect(charge.status).toBe('pending');
        expect(charge.needs_review).toBe(true);
        expect(charge.failure_reason).toMatch(/unidad/);
        expect(await unitCharges(c.communityId)).toHaveLength(0);
    });

    it('con el período financiero cerrado la reserva se crea igual y el cobro queda fallido para revisión', async () => {
        const c = await seedCommunity(db);
        await db.query(
            `INSERT INTO public.finance_period_closures (community_id, month) VALUES ($1, '2999-12')`,
            [c.communityId],
        );
        const bookingId = await bookAsResident(c);
        const charge = (await chargeFor(db, bookingId))!;
        expect(charge.status).toBe('failed');
        expect(charge.needs_review).toBe(true);
        expect(await bookingPaymentStatus(bookingId)).toBe('failed');
    });

    it('el pago registrado en finanzas marca el cobro como pagado, y revertirlo lo devuelve a cargado', async () => {
        const c = await seedCommunity(db);
        const bookingId = await bookAsResident(c);
        const charge = (await chargeFor(db, bookingId))!;

        await db.query(`UPDATE public.unit_charges SET status = 'paid' WHERE id = $1`, [charge.unit_charge_id]);
        expect((await chargeFor(db, bookingId))!.status).toBe('paid');
        expect(await bookingPaymentStatus(bookingId)).toBe('paid');

        await db.query(`UPDATE public.unit_charges SET status = 'pending' WHERE id = $1`, [charge.unit_charge_id]);
        expect((await chargeFor(db, bookingId))!.status).toBe('charged');
    });

    it('extender la reserva ajusta el cargo pendiente con la tarifa del cupo', async () => {
        const c = await seedCommunity(db);
        const bookingId = await bookAsResident(c, 10, 12);
        await asUser(db, c.residentId, () => db.query(
            'SELECT * FROM public.extend_parking_booking($1, 60)', [bookingId],
        ));
        const charge = (await chargeFor(db, bookingId))!;
        expect(charge.amount).toBe(4500);
        const rows = await unitCharges(c.communityId);
        expect(Number(rows[0].amount)).toBe(4500);
        expect(await events(charge.id)).toContain('amount_adjusted');
    });

    it('la máquina de estados no deja reabrir un cobro anulado', async () => {
        const c = await seedCommunity(db);
        const bookingId = await bookAsResident(c);
        await asUser(db, c.residentId, () => db.query('SELECT public.cancel_parking_booking($1)', [bookingId]));
        const charge = (await chargeFor(db, bookingId))!;
        expect(charge.status).toBe('voided');
        await expect(db.query(`UPDATE public.parking_charges SET status = 'charged' WHERE id = $1`, [charge.id]))
            .rejects.toThrow(/Transición de cobro inválida/);
    });
});

describe('cancelación y anulación', () => {
    it('cancelar con más de 2 h de anticipación anula el cobro y revierte el cargo en la cuenta de la unidad', async () => {
        const c = await seedCommunity(db);
        const bookingId = await bookAsResident(c);
        await asUser(db, c.residentId, () => db.query('SELECT public.cancel_parking_booking($1)', [bookingId]));

        const charge = (await chargeFor(db, bookingId))!;
        expect(charge.status).toBe('voided');
        const rows = await unitCharges(c.communityId);
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('cancelled'); // la cartola excluye los cancelados
        expect(await bookingPaymentStatus(bookingId)).toBe('voided');
        expect(await events(charge.id)).toContain('unit_charge_cancelled');
    });

    it('cancelar dentro del plazo (conductor) mantiene el cobro', async () => {
        const c = await seedCommunity(db);
        // Plazo de 48 h: una reserva de mañana ya está dentro de él.
        await db.query('UPDATE public.communities SET parking_free_cancellation_hours = 48 WHERE id = $1', [c.communityId]);
        const bookingId = await bookAsResident(c);
        await asUser(db, c.residentId, () => db.query('SELECT public.cancel_parking_booking($1)', [bookingId]));

        const charge = (await chargeFor(db, bookingId))!;
        expect(charge.status).toBe('charged');
        const rows = await unitCharges(c.communityId);
        expect(rows[0].status).toBe('pending');
        expect(await events(charge.id)).toContain('late_cancellation_retained');
    });

    it('si cancela el dueño del cupo, el cobro se anula aunque esté dentro del plazo', async () => {
        const c = await seedCommunity(db);
        await db.query('UPDATE public.communities SET parking_free_cancellation_hours = 48 WHERE id = $1', [c.communityId]);
        const bookingId = await bookAsResident(c);
        await asUser(db, c.ownerId, () => db.query('SELECT public.cancel_parking_booking($1)', [bookingId]));

        expect((await chargeFor(db, bookingId))!.status).toBe('voided');
        const { rows } = await db.query<{ cancelled_by_party: string }>(
            'SELECT cancelled_by_party FROM public.parking_bookings WHERE id = $1', [bookingId],
        );
        expect(rows[0].cancelled_by_party).toBe('owner');
    });

    it('anular un cobro ya pagado no borra el pago: queda para reembolso y la administración lo cierra', async () => {
        const c = await seedCommunity(db);
        const bookingId = await bookAsResident(c);
        const charge = (await chargeFor(db, bookingId))!;
        await db.query(`UPDATE public.unit_charges SET status = 'paid' WHERE id = $1`, [charge.unit_charge_id]);

        await asUser(db, c.residentId, () => db.query('SELECT public.cancel_parking_booking($1)', [bookingId]));
        const flagged = (await chargeFor(db, bookingId))!;
        expect(flagged.status).toBe('paid');
        expect(flagged.needs_review).toBe(true);
        expect(await events(charge.id)).toContain('refund_required');

        await asUser(db, c.adminId, () => db.query(
            'SELECT public.admin_mark_parking_charge_refunded($1, $2)', [charge.id, 'Transferencia 123'],
        ));
        const refunded = (await chargeFor(db, bookingId))!;
        expect(refunded.status).toBe('refunded');
        expect(refunded.needs_review).toBe(false);
        expect(await bookingPaymentStatus(bookingId)).toBe('refunded');
    });
});

describe('aislamiento entre comunidades', () => {
    it('cada quien ve solo los cobros que le corresponden; conserjería no ve cobros', async () => {
        const a = await seedCommunity(db);
        const b = await seedCommunity(db);
        const bookingA = await bookAsResident(a);
        await bookAsResident(b);

        const visibleTo = (userId: string) => asUser(db, userId, async () => (await db.query<{ booking_id: string; community_id: string }>(
            'SELECT booking_id, community_id FROM public.parking_charges',
        )).rows);

        expect((await visibleTo(a.residentId)).map(row => row.booking_id)).toEqual([bookingA]);
        expect((await visibleTo(a.adminId)).every(row => row.community_id === a.communityId)).toBe(true);
        expect((await visibleTo(a.adminId)).map(row => row.booking_id)).toContain(bookingA);
        expect((await visibleTo(b.adminId)).some(row => row.community_id === a.communityId)).toBe(false);
        expect(await visibleTo(a.conciergeId)).toEqual([]);
        expect(await visibleTo(a.ownerId)).toEqual([]);

        const eventsSeenByB = await asUser(db, b.adminId, async () => (await db.query<{ community_id: string }>(
            'SELECT community_id FROM public.parking_charge_events',
        )).rows);
        expect(eventsSeenByB.every(row => row.community_id === b.communityId)).toBe(true);
    });

    it('la administración de otra comunidad no puede operar un cobro ajeno', async () => {
        const a = await seedCommunity(db);
        const b = await seedCommunity(db);
        const charge = (await chargeFor(db, await bookAsResident(a)))!;

        await expect(asUser(db, b.adminId, () => db.query(
            'SELECT public.admin_mark_parking_charge_refunded($1, $2)', [charge.id, 'intento'],
        ))).rejects.toThrow(/no pertenece a tu comunidad/);
        await expect(asUser(db, a.residentId, () => db.query(
            'SELECT public.admin_post_parking_charge_to_unit($1)', [charge.id],
        ))).rejects.toThrow(/Solo la administración/);
    });

    it('un usuario no puede escribir el libro ni llamar las funciones del servidor', async () => {
        const a = await seedCommunity(db);
        const charge = (await chargeFor(db, await bookAsResident(a)))!;
        await expect(asUser(db, a.residentId, () => db.query(
            `UPDATE public.parking_charges SET status = 'paid' WHERE id = $1`, [charge.id],
        ))).rejects.toThrow(/permission denied/);
        await expect(asUser(db, a.residentId, () => db.query(
            `SELECT public.parking_charge_apply_provider_result($1, 'completed', 3000, 'x')`, [charge.id],
        ))).rejects.toThrow(/permission denied/);
    });
});

describe('comunidad con Haulmer como método', () => {
    it('el cobro queda pendiente para el proveedor y, si se cae a gastos comunes, se carga a la unidad', async () => {
        const c = await seedCommunity(db);
        await db.query(`UPDATE public.communities SET parking_billing_method = 'haulmer' WHERE id = $1`, [c.communityId]);
        const bookingId = await bookAsResident(c);

        const pending = (await chargeFor(db, bookingId))!;
        expect(pending).toMatchObject({ status: 'pending', method: 'haulmer' });
        expect(await unitCharges(c.communityId)).toHaveLength(0);

        const result = await asServiceRole(db, async () => (await db.query<{ r: string }>(
            'SELECT public.parking_charge_fallback_to_unit($1, $2) AS r', [pending.id, 'Haulmer apagado'],
        )).rows[0].r);
        expect(result).toBe('charged');
        expect((await chargeFor(db, bookingId))!.method).toBe('common_expenses');
        expect(await events(pending.id)).toEqual(
            ['created', 'awaiting_provider', 'fallback_to_common_expenses', 'posted_to_unit'],
        );
    });

    it('el webhook solo da por pagado un cobro si el monto coincide', async () => {
        const c = await seedCommunity(db);
        await db.query(`UPDATE public.communities SET parking_billing_method = 'haulmer' WHERE id = $1`, [c.communityId]);
        const bookingId = await bookAsResident(c);
        const charge = (await chargeFor(db, bookingId))!;

        const apply = (amount: number) => asServiceRole(db, async () => (await db.query<{ r: string }>(
            `SELECT public.parking_charge_apply_provider_result($1, 'completed', $2, 'gw-1') AS r`, [charge.id, amount],
        )).rows[0].r);

        expect(await apply(10)).toBe('amount_mismatch');
        expect((await chargeFor(db, bookingId))!.status).toBe('pending');
        expect(await apply(3000)).toBe('processed');
        expect((await chargeFor(db, bookingId))!.status).toBe('paid');
        expect(await apply(3000)).toBe('idempotent');
    });
});

describe('migración', () => {
    it('se puede aplicar dos veces sin duplicar cobros ni romper lo existente', async () => {
        const c = await seedCommunity(db);
        const bookingId = await bookAsResident(c);
        const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261013160000_parking_charges_ledger.sql'), 'utf8');
        await db.exec(sql);
        const { rows } = await db.query('SELECT 1 FROM public.parking_charges WHERE booking_id = $1', [bookingId]);
        expect(rows).toHaveLength(1);
        expect((await chargeFor(db, bookingId))!.status).toBe('charged');
    });

    it('las reservas anteriores al libro quedan pendientes y para revisión, sin cargar nada a nadie', async () => {
        const c = await seedCommunity(db);
        const bookingId = await bookAsResident(c);
        // Simula una reserva hecha antes de la migración: sin cobro ni cargo.
        await db.query('DELETE FROM public.parking_charges WHERE booking_id = $1', [bookingId]);
        await db.query(`DELETE FROM public.unit_charges WHERE notes = $1`, [`parking_booking:${bookingId}`]);

        const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261013160000_parking_charges_ledger.sql'), 'utf8');
        await db.exec(sql);

        const charge = (await chargeFor(db, bookingId))!;
        expect(charge).toMatchObject({ status: 'pending', needs_review: true, unit_id: c.residentUnitId });
        expect(await unitCharges(c.communityId)).toHaveLength(0);

        // La administración decide cargarlo.
        const result = await asUser(db, c.adminId, async () => (await db.query<{ r: string }>(
            'SELECT public.admin_post_parking_charge_to_unit($1) AS r', [charge.id],
        )).rows[0].r);
        expect(result).toBe('charged');
        const rows = await unitCharges(c.communityId);
        expect(rows).toHaveLength(1);
        expect(rows[0].unit_id).toBe(c.residentUnitId);
    });
});
