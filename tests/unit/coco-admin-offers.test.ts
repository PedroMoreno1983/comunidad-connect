/**
 * Las brechas más pesadas del día a día: la administración no podía validar
 * a los vecinos que se registran solos ni asignarles departamento conversando,
 * y un residente no podía ofrecer su estacionamiento o su bodega. Estos tests
 * vigilan el cableado, que nada se autoapruebe y que solo se toque lo propio.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

const neighbor = vi.hoisted(() => ({
    list: vi.fn(),
    decide: vi.fn(),
}));
vi.mock('@/lib/onboarding/neighborBuildings', () => {
    class NeighborBuildingError extends Error {
        constructor(message: string, public status: number) { super(message); }
    }
    return { NeighborBuildingError, listPendingResidents: neighbor.list, decidePendingResident: neighbor.decide };
});

import { assignResidentUnitForAdmin, decidePendingResidentForAdmin, listPendingResidentsForAdmin } from '@/lib/coco/residentAdminTools';
import { publishParkingSpotForUser, publishStorageUnitForUser } from '@/lib/coco/offerTools';
import { TOOL_DEFINITIONS, MUTATING_TOOLS, isToolAllowedForRole, describePendingAction } from '@/lib/coco/tools';
import { NEIGHBOR_MODE_BLOCKED_TOOLS } from '@/lib/neighborMode';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';

type Row = Record<string, unknown>;
const COMUNIDAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb';
const VECINA = 'cccccccc-cccc-4ccc-accc-cccccccccccc';

function insertDb(result: { data?: Row | null; error?: { code?: string; message: string } | null }) {
    const inserts: { table: string; row: Row }[] = [];
    const db = {
        from: (table: string) => {
            const builder: Record<string, unknown> = {};
            builder.insert = (row: Row) => { inserts.push({ table, row }); return builder; };
            builder.select = () => builder;
            builder.single = async () => ({ data: result.data ?? null, error: result.error ?? null });
            return builder;
        },
    };
    return { db: db as unknown as SupabaseClient, inserts };
}

beforeEach(() => vi.clearAllMocks());

describe('cableado', () => {
    const nombres = (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name);

    it.each(['list_pending_residents', 'decide_pending_resident', 'assign_resident_unit'])('%s es solo de la administración', (tool) => {
        expect(nombres).toContain(tool);
        expect(isToolAllowedForRole(tool, 'admin')).toBe(true);
        expect(isToolAllowedForRole(tool, 'resident')).toBe(false);
        expect(isToolAllowedForRole(tool, 'concierge')).toBe(false);
    });

    it('validar, quitar y asignar piden confirmación; listar no', () => {
        expect(MUTATING_TOOLS.has('decide_pending_resident')).toBe(true);
        expect(MUTATING_TOOLS.has('assign_resident_unit')).toBe(true);
        expect(MUTATING_TOOLS.has('list_pending_residents')).toBe(false);
        expect(cocoToolRisk('decide_pending_resident')).toBe('write_high');
        expect(describePendingAction('decide_pending_resident', { approve: false, resident_name: 'Ana' }).summary).toMatch(/pierde el acceso/);
    });

    it.each(['publish_my_parking_spot', 'publish_my_storage_unit'])('%s: residente, confirmación y bloqueado en modo vecino', (tool) => {
        expect(nombres).toContain(tool);
        expect(isToolAllowedForRole(tool, 'resident')).toBe(true);
        expect(MUTATING_TOOLS.has(tool)).toBe(true);
        expect(cocoToolRisk(tool)).toBe('write_high');
        expect(NEIGHBOR_MODE_BLOCKED_TOOLS.has(tool)).toBe(true);
    });
});

describe('vecinos pendientes', () => {
    it('lista sin correos', async () => {
        neighbor.list.mockResolvedValue([{ id: VECINA, name: 'Ana', email: 'ana@correo.cl', departmentNumber: '504', createdAt: '2026-11-16T12:00:00Z' }]);
        const result = await listPendingResidentsForAdmin(COMUNIDAD) as Row;
        expect(result.total).toBe(1);
        expect(JSON.stringify(result)).not.toContain('ana@correo.cl');
    });

    it('decide con el administrador autenticado y exige un id real', async () => {
        neighbor.decide.mockResolvedValue(undefined);
        const ok = await decidePendingResidentForAdmin(COMUNIDAD, ADMIN, { resident_id: VECINA, approve: true }) as Row;
        expect(ok.success).toBe(true);
        expect(neighbor.decide).toHaveBeenCalledWith(COMUNIDAD, ADMIN, VECINA, true);
        const bad = await decidePendingResidentForAdmin(COMUNIDAD, ADMIN, { resident_id: 'Ana', approve: true }) as Row;
        expect(bad.error).toBeTruthy();
        expect(neighbor.decide).toHaveBeenCalledTimes(1);
    });

    it('asignar por nombre con varios resultados devuelve la lista y no asigna', async () => {
        const db = {
            from: () => {
                const b: Record<string, unknown> = {};
                for (const m of ['select', 'eq', 'ilike', 'limit']) b[m] = () => b;
                b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'x', name: 'María Pérez' }, { id: 'y', name: 'María Soto' }], error: null }).then(ok);
                return b;
            },
        } as unknown as SupabaseClient;
        const result = await assignResidentUnitForAdmin(db, COMUNIDAD, { resident_name: 'María', unit_number: '504' }) as Row;
        expect(result.residentes).toHaveLength(2);
    });
});

describe('publicar lo propio', () => {
    it('el estacionamiento queda pendiente de aprobación, a nombre del residente', async () => {
        const { db, inserts } = insertDb({ data: { id: 's1', label: 'E-23' } });
        const result = await publishParkingSpotForUser(db, COMUNIDAD, VECINA, { label: 'E-23', hourly_rate: 1500, owner_id: 'otro', status: 'published' }) as Row;
        expect(result.success).toBe(true);
        expect(inserts[0].row.status).toBe('pending_approval');
        expect(inserts[0].row.owner_id).toBe(VECINA);
        expect(inserts[0].row.allows_external).toBe(false);
    });

    it('sin precio no publica', async () => {
        const { db, inserts } = insertDb({});
        const result = await publishParkingSpotForUser(db, COMUNIDAD, VECINA, { label: 'E-23' }) as Row;
        expect(result.error).toMatch(/precio/);
        expect(inserts).toHaveLength(0);
    });

    it('la bodega queda pendiente y un nombre repetido se explica', async () => {
        const ok = insertDb({ data: { id: 'b1', label: 'Bodega 12' } });
        await publishStorageUnitForUser(ok.db, COMUNIDAD, VECINA, { label: 'Bodega 12', monthly_rate: 40000 });
        expect(ok.inserts[0].row.status).toBe('pending_approval');
        const dup = insertDb({ error: { code: '23505', message: 'duplicate key' } });
        const result = await publishStorageUnitForUser(dup.db, COMUNIDAD, VECINA, { label: 'Bodega 12', monthly_rate: 40000 }) as Row;
        expect(result.error).toMatch(/Ya hay una bodega/);
    });
});
