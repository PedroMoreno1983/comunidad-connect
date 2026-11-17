/**
 * Trabajo diario de la administración por CoCo: casos y aprobaciones. Vigilan
 * los roles, que nada se apruebe fuera de "esperando aprobación", que rechazar
 * exija motivo y que no se toque otra comunidad.
 */

import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/supermarketGroupOrders', () => ({
    reviewSupermarketGroupOrder: vi.fn(async () => ({ id: 'o1', title: 'Compra de agua' })),
}));

import { reviewListingForAdmin, updateCaseStatusForStaff } from '@/lib/coco/adminReviewTools';
import { changeCaseStatus } from '@/lib/cases/caseStatus';
import { TOOL_DEFINITIONS, MUTATING_TOOLS, isToolAllowedForRole } from '@/lib/coco/tools';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';

type Row = Record<string, unknown>;
type Call = { table: string; op: string; filters: [string, string, unknown][]; values?: Row };
const COMUNIDAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb';
const ADMIN = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const LISTING = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const actor = { id: ADMIN, role: 'admin', communityId: COMUNIDAD, name: 'Admin' };

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

    it('casos: administración y conserjería, no residentes', () => {
        for (const tool of ['list_open_cases', 'update_case_status']) {
            expect(nombres).toContain(tool);
            expect(isToolAllowedForRole(tool, 'admin')).toBe(true);
            expect(isToolAllowedForRole(tool, 'concierge')).toBe(true);
            expect(isToolAllowedForRole(tool, 'resident')).toBe(false);
        }
    });

    it('aprobaciones: solo administración, y piden confirmación', () => {
        for (const tool of ['list_pending_listings', 'review_listing', 'review_group_order']) {
            expect(nombres).toContain(tool);
            expect(isToolAllowedForRole(tool, 'admin')).toBe(true);
            expect(isToolAllowedForRole(tool, 'concierge')).toBe(false);
        }
        for (const tool of ['update_case_status', 'review_listing', 'review_group_order']) {
            expect(MUTATING_TOOLS.has(tool)).toBe(true);
            expect(cocoToolRisk(tool)).toBe('write_high');
        }
    });
});

describe('review_listing', () => {
    const pending = { id: LISTING, label: 'E-23', community_id: COMUNIDAD, status: 'pending_approval' };

    it('aprueba lo que espera aprobación, con quien aprueba', async () => {
        const { db, calls } = fakeDb({ parking_spots: [pending] });
        const result = await reviewListingForAdmin(db, actor, { kind: 'parking', listing_id: LISTING, approve: true }) as Row;
        expect(result.success).toBe(true);
        const update = calls.find(c => c.op === 'update');
        expect(update?.values).toMatchObject({ status: 'published', approved_by: ADMIN });
        expect(update?.filters).toContainEqual(['eq', 'status', 'pending_approval']);
    });

    it('rechazar exige motivo', async () => {
        const { db, calls } = fakeDb({ storage_units: [pending] });
        const result = await reviewListingForAdmin(db, actor, { kind: 'storage', listing_id: LISTING, approve: false }) as Row;
        expect(result.error).toMatch(/motivo/);
        expect(calls).toHaveLength(0);
    });

    it('no toca publicaciones de otra comunidad ni ya publicadas', async () => {
        const otra = fakeDb({ parking_spots: [{ ...pending, community_id: OTRA }] });
        expect((await reviewListingForAdmin(otra.db, actor, { kind: 'parking', listing_id: LISTING, approve: true }) as Row).error).toBeTruthy();
        expect(otra.calls.some(c => c.op === 'update')).toBe(false);
        const publicada = fakeDb({ parking_spots: [{ ...pending, status: 'published' }] });
        expect((await reviewListingForAdmin(publicada.db, actor, { kind: 'parking', listing_id: LISTING, approve: true }) as Row).error).toMatch(/no está esperando/);
        expect(publicada.calls.some(c => c.op === 'update')).toBe(false);
    });
});

describe('estado de casos', () => {
    const caso = { id: LISTING, title: 'Filtración', status: 'open', user_id: 'vecina', community_id: COMUNIDAD, metadata: {} };

    it('cambia el estado, avisa al residente y deja bitácora', async () => {
        const { db, calls } = fakeDb({ coco_cases: [caso] });
        const result = await changeCaseStatus(db, actor, LISTING, 'resolved', 'coco');
        expect('case' in result).toBe(true);
        expect(calls.some(c => c.table === 'notifications' && c.op === 'insert')).toBe(true);
        const event = calls.find(c => c.table === 'coco_case_events' && c.op === 'insert');
        expect(event?.values).toMatchObject({ from_status: 'open', to_status: 'resolved', actor_id: ADMIN, metadata: { source: 'coco' } });
    });

    it('rechaza estados inválidos, residentes y casos de otra comunidad', async () => {
        const { db } = fakeDb({ coco_cases: [{ ...caso, community_id: OTRA }] });
        expect(await changeCaseStatus(db, actor, LISTING, 'borrado', 'coco')).toMatchObject({ status: 400 });
        expect(await changeCaseStatus(db, { ...actor, role: 'resident' }, LISTING, 'resolved', 'coco')).toMatchObject({ status: 403 });
        expect(await changeCaseStatus(db, actor, LISTING, 'resolved', 'coco')).toMatchObject({ status: 403 });
    });

    it('CoCo exige un case_id real', async () => {
        const { db, calls } = fakeDb({});
        const result = await updateCaseStatusForStaff(db, actor, { case_id: 'la filtración', status: 'resolved' }) as Row;
        expect(result.error).toBeTruthy();
        expect(calls).toHaveLength(0);
    });
});
