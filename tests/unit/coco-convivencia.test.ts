/**
 * Convivencia por CoCo. Vigilan las reglas que en la pantalla pone RLS y aquí
 * se ponen a mano: toda propuesta nace pendiente a nombre propio, resolver una
 * solicitud es del coordinador o la administración, validar es solo de la
 * administración. Y que los errores de los triggers de la base lleguen al
 * vecino en palabras claras.
 */

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { joinInitiative, proposeInitiative, requestMediation, resolveParticipation, reviewInitiative } from '@/lib/coco/convivenciaTools';
import { TOOL_DEFINITIONS, MUTATING_TOOLS, isToolAllowedForRole } from '@/lib/coco/tools';
import { NEIGHBOR_MODE_BLOCKED_TOOLS } from '@/lib/neighborMode';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';

type Row = Record<string, unknown>;
type Call = { table: string; op: string; filters: [string, string, unknown][]; values?: Row };
const COMUNIDAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VECINA = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const COORD = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const INIT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const vecina = { id: VECINA, role: 'resident', communityId: COMUNIDAD, name: 'Ana' };
const admin = { id: COORD, role: 'admin', communityId: COMUNIDAD, name: 'Admin' };

function fakeDb(tables: Record<string, Row[]>, insertError: { code?: string; message: string } | null = null) {
    const calls: Call[] = [];
    const from = (table: string) => {
        const call: Call = { table, op: 'select', filters: [] };
        calls.push(call);
        const b: Record<string, unknown> = {};
        b.eq = (col: string, val: unknown) => { call.filters.push(['eq', col, val]); return b; };
        for (const op of ['select', 'order', 'limit', 'or']) b[op] = () => b;
        b.insert = (values: Row) => { call.op = 'insert'; call.values = values; return b; };
        b.update = (values: Row) => { call.op = 'update'; call.values = values; return b; };
        b.maybeSingle = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
        b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: call.op === 'select' ? tables[table] ?? [] : null, error: call.op === 'insert' ? insertError : null }).then(ok);
        return b;
    };
    return { db: { from } as unknown as SupabaseClient, calls };
}

describe('cableado', () => {
    const nombres = (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name);
    const residente = ['list_community_initiatives', 'propose_initiative', 'join_initiative', 'resolve_participation', 'request_mediation'];

    it.each(residente)('%s: residente, bloqueada en modo vecino', (tool) => {
        expect(nombres).toContain(tool);
        expect(isToolAllowedForRole(tool, 'resident')).toBe(true);
        expect(NEIGHBOR_MODE_BLOCKED_TOOLS.has(tool)).toBe(true);
    });

    it('validar iniciativas es solo de la administración', () => {
        expect(isToolAllowedForRole('review_initiative', 'admin')).toBe(true);
        expect(isToolAllowedForRole('review_initiative', 'resident')).toBe(false);
    });

    it('las que escriben piden confirmación', () => {
        for (const tool of ['propose_initiative', 'join_initiative', 'resolve_participation', 'review_initiative', 'request_mediation']) {
            expect(MUTATING_TOOLS.has(tool)).toBe(true);
            expect(cocoToolRisk(tool)).toBe('write_high');
        }
    });
});

describe('proponer y sumarse', () => {
    it('la propuesta nace pendiente y a nombre propio, aunque el modelo pida otra cosa', async () => {
        const { db, calls } = fakeDb({ profiles: [{ name: 'Ana', department_number: '504' }] });
        await proposeInitiative(db, vecina, { type: 'community_project', title: 'Huerto', description: 'Un huerto en la azotea', governance_status: 'approved', creator_id: COORD });
        const insert = calls.find(c => c.op === 'insert');
        expect(insert?.values).toMatchObject({ governance_status: 'pending', creator_id: VECINA, community_id: COMUNIDAD });
    });

    it('una compra colectiva sin fecha de cierre no se propone', async () => {
        const { db, calls } = fakeDb({ profiles: [{ name: 'Ana' }] });
        const result = await proposeInitiative(db, vecina, { type: 'collective_purchase', title: 'Agua', supplier: 'Bidones SA' }) as Row;
        expect(result.error).toMatch(/fecha/);
        expect(calls.some(c => c.op === 'insert')).toBe(false);
    });

    it('traduce el rechazo del trigger: iniciativa no aprobada', async () => {
        const { db } = fakeDb({}, { message: 'initiative-not-approved' });
        const result = await joinInitiative(db, vecina, { type: 'time_bank', initiative_id: INIT }) as Row;
        expect(result.error).toMatch(/todavía no está aprobada/);
    });
});

describe('coordinar y validar', () => {
    it('resolver una solicitud es del coordinador o la administración', async () => {
        const { db, calls } = fakeDb({ community_participation_requests: [{ id: INIT, community_id: COMUNIDAD, coordinator_id: COORD, status: 'pending' }] });
        const result = await resolveParticipation(db, vecina, { request_id: INIT, accept: true }) as Row;
        expect(result.error).toMatch(/coordina/);
        expect(calls.some(c => c.op === 'update')).toBe(false);
    });

    it('rechazar o pedir cambios exige motivo', async () => {
        const { db, calls } = fakeDb({ time_bank_offers: [{ id: INIT, skill: 'Inglés', profile_id: VECINA, community_id: COMUNIDAD }] });
        const result = await reviewInitiative(db, admin, { type: 'time_bank', initiative_id: INIT, decision: 'rejected' }) as Row;
        expect(result.error).toMatch(/motivo/);
        expect(calls.some(c => c.op === 'update')).toBe(false);
    });

    it('aprobar deja como coordinador a quien la propuso', async () => {
        const { db, calls } = fakeDb({ time_bank_offers: [{ id: INIT, skill: 'Inglés', profile_id: VECINA, community_id: COMUNIDAD }] });
        await reviewInitiative(db, admin, { type: 'time_bank', initiative_id: INIT, decision: 'approved' });
        expect(calls.find(c => c.op === 'update')?.values).toMatchObject({ governance_status: 'approved', coordinator_id: VECINA, validated_by: COORD });
    });

    it('un residente no valida', async () => {
        const { db, calls } = fakeDb({});
        expect((await reviewInitiative(db, vecina, { type: 'time_bank', initiative_id: INIT, decision: 'approved' }) as Row).error).toBeTruthy();
        expect(calls).toHaveLength(0);
    });
});

describe('mediación', () => {
    it('pide las cinco partes y arma el borrador', async () => {
        const incompleta = fakeDb({});
        expect((await requestMediation(incompleta.db, vecina, { target_unit: '302' }) as Row).error).toBeTruthy();
        const { db, calls } = fakeDb({ profiles: [{ name: 'Ana' }] });
        const result = await requestMediation(db, vecina, { target_unit: '302', observation: 'Música fuerte después de las 23', feeling: 'cansada', need: 'descansar', request: 'bajar el volumen después de las 23' }) as Row;
        expect(result.success).toBe(true);
        expect(String(result.borrador)).toContain('bajar el volumen');
        expect(calls.find(c => c.op === 'insert')?.values).toMatchObject({ reporter_id: VECINA, status: 'drafted' });
    });
});
