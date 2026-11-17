/**
 * Estacionamientos, lo que faltaba: extender (cambia el cobro), horarios del
 * estacionamiento propio y acceso de conductores externos. Extender y resolver
 * delegan en funciones de base con el perfil autenticado; los horarios solo
 * los cambia el dueño.
 */

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extendParkingBooking, reviewParkingAccess, setMySpotAvailability } from '@/lib/coco/parkingExtraTools';
import { TOOL_DEFINITIONS, MUTATING_TOOLS, isToolAllowedForRole } from '@/lib/coco/tools';
import { NEIGHBOR_MODE_BLOCKED_TOOLS } from '@/lib/neighborMode';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';

type Row = Record<string, unknown>;
const VECINA = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const OTRO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function fakeDb(tables: Record<string, Row[]>, rpcResult: { data?: unknown; error?: { message: string } | null } = { data: null, error: null }) {
    const ops: { table: string; op: string; values?: unknown }[] = [];
    const rpcs: { fn: string; args: Row }[] = [];
    const from = (table: string) => {
        let op = 'select';
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'in', 'limit']) b[m] = () => b;
        b.delete = () => { op = 'delete'; ops.push({ table, op }); return b; };
        b.insert = (values: unknown) => { op = 'insert'; ops.push({ table, op, values }); return b; };
        b.maybeSingle = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
        b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: op === 'select' ? tables[table] ?? [] : null, error: null }).then(ok);
        return b;
    };
    const rpc = async (fn: string, args: Row) => { rpcs.push({ fn, args }); return { data: rpcResult.data ?? null, error: rpcResult.error ?? null }; };
    return { db: { from, rpc } as unknown as SupabaseClient, ops, rpcs };
}

describe('cableado', () => {
    const nombres = (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name);
    it('residente: extender y horarios, bloqueadas en modo vecino', () => {
        for (const tool of ['extend_parking_booking', 'set_my_spot_availability']) {
            expect(nombres).toContain(tool);
            expect(isToolAllowedForRole(tool, 'resident')).toBe(true);
            expect(NEIGHBOR_MODE_BLOCKED_TOOLS.has(tool)).toBe(true);
        }
    });
    it('acceso externo: solo administración', () => {
        expect(isToolAllowedForRole('review_parking_access', 'admin')).toBe(true);
        expect(isToolAllowedForRole('review_parking_access', 'resident')).toBe(false);
    });
    it('las que escriben piden confirmación', () => {
        for (const tool of ['extend_parking_booking', 'set_my_spot_availability', 'review_parking_access']) {
            expect(MUTATING_TOOLS.has(tool)).toBe(true);
            expect(cocoToolRisk(tool)).toBe('write_high');
        }
    });
});

describe('extender', () => {
    it('delega con el perfil autenticado e informa lo que se suma', async () => {
        const { db, rpcs } = fakeDb({}, { data: [{ new_ends_at: '2026-11-20T20:00:00Z', additional_amount: 1500 }] });
        const result = await extendParkingBooking(db, VECINA, { booking_id: ID, additional_minutes: 60 }) as Row;
        expect(rpcs).toEqual([{ fn: 'coco_extend_parking_booking', args: { p_user_id: VECINA, p_booking_id: ID, p_additional_minutes: 60 } }]);
        expect(result.message).toMatch(/\$1\.500/);
    });
    it('fuera de rango no llama a la base', async () => {
        const { db, rpcs } = fakeDb({});
        expect((await extendParkingBooking(db, VECINA, { booking_id: ID, additional_minutes: 2000 }) as Row).error).toBeTruthy();
        expect(rpcs).toHaveLength(0);
    });
});

describe('horarios', () => {
    it('solo el dueño los cambia', async () => {
        const { db, ops } = fakeDb({ parking_spots: [{ id: ID, label: 'E-23', owner_id: OTRO }] });
        const result = await setMySpotAvailability(db, VECINA, { listing_id: ID, windows: [{ weekday: 1, start_time: '09:00', end_time: '18:00' }] }) as Row;
        expect(result.error).toBeTruthy();
        expect(ops).toHaveLength(0);
    });
    it('rechaza horarios inválidos antes de borrar los existentes', async () => {
        const { db, ops } = fakeDb({ parking_spots: [{ id: ID, label: 'E-23', owner_id: VECINA }] });
        const result = await setMySpotAvailability(db, VECINA, { listing_id: ID, windows: [{ weekday: 8, start_time: '18:00', end_time: '09:00' }] }) as Row;
        expect(result.error).toBeTruthy();
        expect(ops).toHaveLength(0);
    });
    it('reemplaza los horarios', async () => {
        const { db, ops } = fakeDb({ parking_spots: [{ id: ID, label: 'E-23', owner_id: VECINA }] });
        const result = await setMySpotAvailability(db, VECINA, { listing_id: ID, windows: [{ weekday: 1, start_time: '09:00', end_time: '18:00' }] }) as Row;
        expect(result.success).toBe(true);
        expect(ops.map(o => o.op)).toEqual(['delete', 'insert']);
    });
});

describe('acceso externo', () => {
    it('delega en la función de base con el administrador autenticado', async () => {
        const { db, rpcs } = fakeDb({});
        await reviewParkingAccess(db, VECINA, { access_id: ID, approve: false, reason: 'Sin referencias' });
        expect(rpcs[0]).toEqual({ fn: 'coco_review_parking_community_access', args: { p_user_id: VECINA, p_access_id: ID, p_approved: false, p_reason: 'Sin referencias' } });
    });
});
