/**
 * CoCo reservaba y publicaba, pero no podía deshacer: para cancelar, el
 * residente tenía que buscar la pantalla (y en espacios comunes no había
 * ninguna: solo la administración cancelaba). Estos tests vigilan que las
 * herramientas de deshacer existan, pidan confirmación, respeten el modo
 * vecino y, sobre todo, que solo toquen lo que es del propio residente.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import {
    cancelParkingBookingForUser,
    cancelReservationForUser,
    cancelStorageRentalForUser,
    parkingCancellationWindow,
    updateMarketplaceItemForUser,
} from '@/lib/coco/undoActions';
import { TOOL_DEFINITIONS, MUTATING_TOOLS, isToolAllowedForRole, describePendingAction } from '@/lib/coco/tools';
import { NEIGHBOR_MODE_BLOCKED_TOOLS } from '@/lib/neighborMode';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';
import { requiredMutationTool } from '@/lib/coco/agent';

type Row = Record<string, unknown>;
type Call = { table: string; op: 'select' | 'update'; filters: [string, string, unknown][]; values?: Row };

const COMUNIDAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA_COMUNIDAD = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb';
const VECINA = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const OTRO_VECINO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RESERVA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

/** Cliente falso: cada tabla devuelve filas fijas y se registran filtros y updates. */
function fakeDb(tables: Record<string, Row[]>, rpc: (fn: string, args: Row) => { data?: unknown; error?: { message: string } | null } = () => ({ data: null, error: null })) {
    const calls: Call[] = [];
    const rpcCalls: { fn: string; args: Row }[] = [];
    const from = (table: string) => {
        const call: Call = { table, op: 'select', filters: [] };
        calls.push(call);
        const rows = () => tables[table] ?? [];
        const builder: Record<string, unknown> = {};
        const chain = (op: string) => (column: string, value: unknown) => { call.filters.push([op, column, value]); return builder; };
        for (const op of ['eq', 'neq', 'in', 'gte', 'lte', 'ilike']) builder[op] = chain(op);
        for (const op of ['order', 'limit', 'select']) builder[op] = () => builder;
        builder.update = (values: Row) => { call.op = 'update'; call.values = values; return builder; };
        builder.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
        builder.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
            Promise.resolve({ data: call.op === 'update' ? null : rows(), error: null }).then(ok, err);
        return builder;
    };
    const client = {
        from,
        rpc: async (fn: string, args: Row) => { rpcCalls.push({ fn, args }); return rpc(fn, args); },
    };
    return { db: client as unknown as SupabaseClient, calls, rpcCalls };
}

const NUEVAS = ['cancel_reservation', 'cancel_parking_booking', 'cancel_storage_rental', 'update_marketplace_item', 'report_transfer'] as const;

describe('las herramientas de deshacer están cableadas', () => {
    const nombres = (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name);

    it.each(NUEVAS)('%s existe, la alcanza un residente y pide confirmación', (tool) => {
        expect(nombres).toContain(tool);
        expect(isToolAllowedForRole(tool, 'resident')).toBe(true);
        expect(MUTATING_TOOLS.has(tool)).toBe(true);
        // Ninguna entra a la lista de las que corren solas en el Agent Center.
        expect(cocoToolRisk(tool)).toBe('write_high');
        expect(describePendingAction(tool, {}).title).not.toBe('');
    });

    it('en modo vecino se bloquean las que dependen de la administración', () => {
        for (const tool of ['cancel_reservation', 'cancel_parking_booking', 'cancel_storage_rental', 'report_transfer']) {
            expect(NEIGHBOR_MODE_BLOCKED_TOOLS.has(tool)).toBe(true);
        }
        // El marketplace funciona sin administración: retirar lo vendido también.
        expect(NEIGHBOR_MODE_BLOCKED_TOOLS.has('update_marketplace_item')).toBe(false);
    });

    it('informar transferencia es del residente, no de la administración', () => {
        expect(isToolAllowedForRole('report_transfer', 'admin')).toBe(false);
    });

    it('"cancela mi reserva" ya no fuerza create_reservation', () => {
        expect(requiredMutationTool('cancela mi reserva del quincho del sábado')).toBeUndefined();
        expect(requiredMutationTool('ya no voy a usar la reserva de la piscina')).toBeUndefined();
        expect(requiredMutationTool('quiero reservar el quincho el sábado')).toBe('create_reservation');
    });
});

describe('cancel_reservation', () => {
    const quincho = { id: 'amenity-1', name: 'Quincho' };
    const reserva = { id: RESERVA, amenity_id: 'amenity-1', date: '2099-01-10', start_time: '19:00:00', end_time: '23:00:00', status: 'confirmed' };

    it('cancela solo una reserva propia, filtrando por usuario y comunidad', async () => {
        const { db, calls } = fakeDb({ amenities: [quincho], bookings: [reserva] });
        const result = await cancelReservationForUser(db, COMUNIDAD, VECINA, { space_name: 'quincho', date: '2099-01-10' }) as Row;
        expect(result.success).toBe(true);
        const update = calls.find(c => c.table === 'bookings' && c.op === 'update');
        expect(update?.values).toEqual({ status: 'cancelled' });
        expect(update?.filters).toContainEqual(['eq', 'user_id', VECINA]);
        const lookup = calls.find(c => c.table === 'bookings' && c.op === 'select');
        expect(lookup?.filters).toContainEqual(['eq', 'user_id', VECINA]);
        expect(lookup?.filters).toContainEqual(['eq', 'community_id', COMUNIDAD]);
    });

    it('con dos reservas el mismo día no adivina: pide la hora', async () => {
        const { db, calls } = fakeDb({ amenities: [quincho], bookings: [reserva, { ...reserva, id: 'otra', start_time: '12:00:00' }] });
        const result = await cancelReservationForUser(db, COMUNIDAD, VECINA, { space_name: 'quincho', date: '2099-01-10' }) as Row;
        expect(result.error).toMatch(/más de una/);
        expect(calls.some(c => c.op === 'update')).toBe(false);
    });

    it('no cancela reservas pasadas', async () => {
        const { db, calls } = fakeDb({ amenities: [quincho], bookings: [reserva] });
        const result = await cancelReservationForUser(db, COMUNIDAD, VECINA, { space_name: 'quincho', date: '2020-01-10' }) as Row;
        expect(result.error).toMatch(/ya pasó/);
        expect(calls).toHaveLength(0);
    });

    it('el nombre del espacio no actúa como comodín', async () => {
        const { db, calls } = fakeDb({ amenities: [] });
        await cancelReservationForUser(db, COMUNIDAD, VECINA, { space_name: '%', date: '2099-01-10' });
        expect(calls).toHaveLength(0);
    });
});

describe('cancel_parking_booking', () => {
    it('delega en la función de base con el perfil autenticado', async () => {
        const { db, rpcCalls } = fakeDb(
            { parking_bookings: [{ id: RESERVA, community_id: COMUNIDAD }], parking_charges: [{ amount: 3000, status: 'voided' }] },
        );
        const result = await cancelParkingBookingForUser(db, COMUNIDAD, VECINA, { booking_id: RESERVA }) as Row;
        expect(rpcCalls).toEqual([{ fn: 'coco_cancel_parking_booking', args: { p_user_id: VECINA, p_booking_id: RESERVA, p_reason: null } }]);
        expect(result.cobro).toMatch(/sin costo|no tiene costo/i);
    });

    it('fuera de plazo avisa que el cobro se mantiene', async () => {
        const { db } = fakeDb({
            parking_bookings: [{ id: RESERVA, community_id: COMUNIDAD }],
            parking_charges: [{ id: 'charge-1', amount: 3000, status: 'charged' }],
            parking_charge_events: [{ event_type: 'late_cancellation_retained' }],
        });
        const result = await cancelParkingBookingForUser(db, COMUNIDAD, VECINA, { booking_id: RESERVA }) as Row;
        expect(result.cobro).toMatch(/se mantiene/);
    });

    it('a tiempo sobre un cobro ya pagado dice que corresponde reembolso, no que se mantiene', async () => {
        // parking_charge_void deja el cobro en 'paid' y marca refund_required:
        // el estado solo no distingue esto de una cancelación tardía.
        const { db } = fakeDb({
            parking_bookings: [{ id: RESERVA, community_id: COMUNIDAD }],
            parking_charges: [{ id: 'charge-1', amount: 3000, status: 'paid' }],
            parking_charge_events: [{ event_type: 'refund_required' }],
        });
        const result = await cancelParkingBookingForUser(db, COMUNIDAD, VECINA, { booking_id: RESERVA }) as Row;
        expect(result.cobro).toMatch(/sin costo/);
        expect(result.cobro).toMatch(/devolv/);
        expect(result.cobro).not.toMatch(/se mantiene/);
    });

    it('la ventana sin costo usa el plazo de la comunidad, no el de fábrica', () => {
        const ahora = new Date('2026-11-20T10:00:00Z');
        // Reserva a las 15:00; con 6 h de plazo, a las 10:00 ya no es gratis.
        expect(parkingCancellationWindow('2026-11-20T15:00:00Z', 6, ahora).cancelar_ahora).toBe('se mantiene el cobro');
        expect(parkingCancellationWindow('2026-11-20T15:00:00Z', 2, ahora).cancelar_ahora).toBe('sin costo');
        expect(parkingCancellationWindow('2026-11-20T15:00:00Z', 6, ahora).cancelar_gratis_hasta).toBe('2026-11-20T09:00:00.000Z');
    });

    it('una reserva de otra comunidad no existe para el residente', async () => {
        const { db, rpcCalls } = fakeDb({ parking_bookings: [{ id: RESERVA, community_id: OTRA_COMUNIDAD }] });
        const result = await cancelParkingBookingForUser(db, COMUNIDAD, VECINA, { booking_id: RESERVA }) as Row;
        expect(result.error).toMatch(/no existe/);
        expect(rpcCalls).toHaveLength(0);
    });

    it('devuelve el mensaje de la base tal cual', async () => {
        const { db } = fakeDb({ parking_bookings: [{ id: RESERVA, community_id: COMUNIDAD }] }, () => ({ error: { message: 'No puedes cancelar esta reserva' } }));
        const result = await cancelParkingBookingForUser(db, COMUNIDAD, VECINA, { booking_id: RESERVA }) as Row;
        expect(result.error).toBe('No puedes cancelar esta reserva');
    });
});

describe('cancel_storage_rental', () => {
    it('solo el arrendatario la termina, y dice cuántos cobros anuló', async () => {
        const { db, rpcCalls } = fakeDb({ storage_rentals: [{ id: RESERVA, community_id: COMUNIDAD, tenant_id: VECINA }] }, () => ({ data: 3, error: null }));
        const result = await cancelStorageRentalForUser(db, COMUNIDAD, VECINA, { rental_id: RESERVA }) as Row;
        expect(rpcCalls[0]?.fn).toBe('coco_cancel_storage_rental');
        expect(result.message).toMatch(/3 cobros futuros/);
    });

    it('el arriendo de otro vecino no se toca', async () => {
        const { db, rpcCalls } = fakeDb({ storage_rentals: [{ id: RESERVA, community_id: COMUNIDAD, tenant_id: OTRO_VECINO }] });
        const result = await cancelStorageRentalForUser(db, COMUNIDAD, VECINA, { rental_id: RESERVA }) as Row;
        expect(result.error).toBeTruthy();
        expect(rpcCalls).toHaveLength(0);
    });
});

describe('update_marketplace_item', () => {
    it('cambia el estado de una publicación propia', async () => {
        const { db, calls } = fakeDb({ marketplace_items: [{ id: RESERVA, title: 'Bicicleta aro 26', status: 'available' }] });
        const result = await updateMarketplaceItemForUser(db, COMUNIDAD, VECINA, { title: 'bicicleta', status: 'sold' }) as Row;
        expect(result.success).toBe(true);
        const update = calls.find(c => c.op === 'update');
        expect(update?.values).toEqual({ status: 'sold' });
        expect(update?.filters).toContainEqual(['eq', 'seller_id', VECINA]);
        expect(calls[0].filters).toContainEqual(['eq', 'seller_id', VECINA]);
    });

    it('con varias parecidas devuelve la lista y no toca nada', async () => {
        const { db, calls } = fakeDb({ marketplace_items: [{ id: 'a', title: 'Silla roja' }, { id: 'b', title: 'Silla azul' }] });
        const result = await updateMarketplaceItemForUser(db, COMUNIDAD, VECINA, { title: 'silla', status: 'sold' }) as Row;
        expect(result.publicaciones).toHaveLength(2);
        expect(calls.some(c => c.op === 'update')).toBe(false);
    });

    it('rechaza estados que no existen', async () => {
        const { db, calls } = fakeDb({});
        const result = await updateMarketplaceItemForUser(db, COMUNIDAD, VECINA, { title: 'silla', status: 'deleted' }) as Row;
        expect(result.error).toBeTruthy();
        expect(calls).toHaveLength(0);
    });
});

beforeEach(() => vi.clearAllMocks());
