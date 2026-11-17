/**
 * Operación diaria por CoCo: solicitudes de servicio, incidencias y lecturas
 * de agua. Vigilan roles, que se respeten las transiciones de la pantalla y
 * que una lectura no pise la del mes.
 */

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordWaterReading, registerIncidentForStaff } from '@/lib/coco/operationsTools';
import { changeServiceRequestStatus } from '@/lib/services/requestStatus';
import { TOOL_DEFINITIONS, MUTATING_TOOLS, isToolAllowedForRole } from '@/lib/coco/tools';
import { NEIGHBOR_MODE_BLOCKED_TOOLS } from '@/lib/neighborMode';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';

type Row = Record<string, unknown>;
type Call = { table: string; op: string; filters: [string, string, unknown][]; values?: Row | Row[] };
const COMUNIDAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb';
const ADMIN = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const VECINA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REQ = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function fakeDb(tables: Record<string, Row[]>) {
    const calls: Call[] = [];
    const from = (table: string) => {
        const call: Call = { table, op: 'select', filters: [] };
        calls.push(call);
        const b: Record<string, unknown> = {};
        const chain = (op: string) => (col: string, val: unknown) => { call.filters.push([op, col, val]); return b; };
        for (const op of ['eq', 'in']) b[op] = chain(op);
        for (const op of ['select', 'order', 'limit']) b[op] = () => b;
        for (const op of ['insert', 'update']) b[op] = (values: Row) => { call.op = op; call.values = values; return b; };
        b.maybeSingle = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
        b.single = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
        b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: call.op === 'select' ? tables[table] ?? [] : null, error: null }).then(ok);
        return b;
    };
    return { db: { from } as unknown as SupabaseClient, calls };
}

describe('cableado', () => {
    const nombres = (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name);

    it('solicitudes de servicio: residentes y equipo; funcionan en modo vecino', () => {
        for (const tool of ['list_service_requests', 'update_service_request_status']) {
            expect(nombres).toContain(tool);
            expect(isToolAllowedForRole(tool, 'resident')).toBe(true);
            expect(isToolAllowedForRole(tool, 'admin')).toBe(true);
            expect(NEIGHBOR_MODE_BLOCKED_TOOLS.has(tool)).toBe(false);
        }
    });

    it('incidencias: conserjería y administración; lecturas: solo administración', () => {
        expect(isToolAllowedForRole('register_incident', 'concierge')).toBe(true);
        expect(isToolAllowedForRole('register_incident', 'resident')).toBe(false);
        expect(isToolAllowedForRole('record_water_reading', 'admin')).toBe(true);
        expect(isToolAllowedForRole('record_water_reading', 'concierge')).toBe(false);
    });

    it('las que escriben piden confirmación', () => {
        for (const tool of ['update_service_request_status', 'register_incident', 'record_water_reading']) {
            expect(MUTATING_TOOLS.has(tool)).toBe(true);
            expect(cocoToolRisk(tool)).toBe('write_high');
        }
    });
});

describe('solicitudes de servicio', () => {
    const request = { id: REQ, provider_id: null, user_id: VECINA, status: 'pending', community_id: COMUNIDAD, description: 'Gasfiter' };

    it('el equipo acepta una pendiente, con bloqueo sobre el estado anterior', async () => {
        const { db, calls } = fakeDb({ service_requests: [request] });
        const result = await changeServiceRequestStatus(db, { id: ADMIN, role: 'admin', communityId: COMUNIDAD }, REQ, { status: 'accepted' });
        expect('request' in result).toBe(true);
        const update = calls.find(c => c.op === 'update');
        expect(update?.values).toEqual({ status: 'accepted' });
        expect(update?.filters).toContainEqual(['eq', 'status', 'pending']);
    });

    it('otra comunidad no', async () => {
        const { db } = fakeDb({ service_requests: [{ ...request, community_id: OTRA }] });
        expect(await changeServiceRequestStatus(db, { id: ADMIN, role: 'admin', communityId: COMUNIDAD }, REQ, { status: 'accepted' })).toMatchObject({ status: 403 });
    });

    it('rechaza estados inventados', async () => {
        const { db, calls } = fakeDb({ service_requests: [request] });
        expect(await changeServiceRequestStatus(db, { id: ADMIN, role: 'admin', communityId: COMUNIDAD }, REQ, { status: 'archivada' })).toMatchObject({ status: 400 });
        expect(calls).toHaveLength(0);
    });
});

describe('incidencias y lecturas', () => {
    it('la incidencia queda como caso abierto de conserjería y avisa a la administración', async () => {
        const { db, calls } = fakeDb({ coco_cases: [{ id: 'c1', title: 'Portón trabado' }], profiles: [{ id: ADMIN }] });
        const result = await registerIncidentForStaff(db, { id: VECINA, role: 'concierge', communityId: COMUNIDAD }, { title: 'Portón trabado', urgency: 'alta' }) as Row;
        expect(result.success).toBe(true);
        expect(calls.find(c => c.table === 'coco_cases' && c.op === 'insert')?.values).toMatchObject({ status: 'open', urgency: 'alta', community_id: COMUNIDAD, metadata: { reportedBy: 'coco' } });
        expect(calls.some(c => c.table === 'notifications' && c.op === 'insert')).toBe(true);
    });

    it('la lectura no pisa la del mismo mes', async () => {
        const { db, calls } = fakeDb({ units: [{ id: 'u1', number: '504', tower: 'A' }], water_readings: [{ id: 'w1', reading_value: 120 }] });
        const result = await recordWaterReading(db, { id: ADMIN, role: 'admin', communityId: COMUNIDAD }, { unit_number: '504', reading_value: 130, month: '2026-11' }) as Row;
        expect(result.error).toMatch(/ya tiene lectura/);
        expect(calls.some(c => c.op === 'insert')).toBe(false);
    });

    it('guarda con el mes en español, como lo lee el resto de la app', async () => {
        const { db, calls } = fakeDb({ units: [{ id: 'u1', number: '504', tower: 'A' }], water_readings: [] });
        const result = await recordWaterReading(db, { id: ADMIN, role: 'admin', communityId: COMUNIDAD }, { unit_number: '504', reading_value: 130, month: '2026-11' }) as Row;
        expect(result.success).toBe(true);
        expect(calls.find(c => c.table === 'water_readings' && c.op === 'insert')?.values).toMatchObject({ month: 'Noviembre', year: 2026, reading_value: 130, created_by: ADMIN });
    });
});
