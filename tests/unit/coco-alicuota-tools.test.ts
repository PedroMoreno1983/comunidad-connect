/**
 * Herramientas de alícuotas de CoCo (`create_unit`, `set_unit_alicuota`,
 * `distribute_alicuotas_equally`) en **%** desde el PR #178.
 *
 * Cuidan que:
 * 1. CoCo reciba y devuelva porcentaje (‰ = % × 10 solo en la base), y que el
 *    parámetro viejo en ‰ se siga aceptando y convirtiendo.
 * 2. La validación sea la de `unitRights.ts` (> 0 %, ≤ 100 %, suma 100 % ± 0,05).
 * 3. Las escrituras pasen por el servicio de derechos (PR #175): carga completa
 *    por `save_unit_rights` con revisión auditable, bloqueo si hay una votación
 *    abierta y provisorio sin fuente.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
    db: {} as Record<string, Row[]>,
    updates: [] as { table: string; values: Row; filters: Row }[],
    inserts: [] as { table: string; values: Row }[],
    rpcCalls: [] as { fn: string; args: Row }[],
    events: [] as Row[],
}));

vi.mock('@/lib/operations/audit', () => ({
    recordOperationEvent: async (event: Row) => { mocks.events.push(event); },
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => {
    const from = (table: string) => {
        const filters: Row = {};
        let op: 'select' | 'update' | 'insert' = 'select';
        let payload: Row = {};
        const rows = () => (mocks.db[table] ?? []).filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
        const result = () => {
            if (op === 'update') {
                mocks.updates.push({ table, values: payload, filters: { ...filters } });
                for (const row of rows()) Object.assign(row, payload);
                return rows();
            }
            if (op === 'insert') {
                const row = { id: `new-${(mocks.db[table] ?? []).length + 1}`, ...payload };
                mocks.inserts.push({ table, values: payload });
                (mocks.db[table] ??= []).push(row);
                return [row];
            }
            return rows();
        };
        const builder: Record<string, unknown> = {
            select: () => builder,
            update: (values: Row) => { op = 'update'; payload = values; return builder; },
            insert: (values: Row) => { op = 'insert'; payload = values; return builder; },
            eq: (key: string, value: unknown) => { filters[key] = value; return builder; },
            maybeSingle: async () => ({ data: result()[0] ?? null, error: null }),
            single: async () => ({ data: result()[0] ?? null, error: null }),
            then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve({ data: result(), error: null }).then(ok, err),
        };
        for (const method of ['neq', 'in', 'order', 'limit', 'gte', 'lte', 'is', 'not']) builder[method] = () => builder;
        return builder;
    };
    const client = {
        from,
        rpc: async (fn: string, args: Row) => {
            mocks.rpcCalls.push({ fn, args });
            const values = args.p_values as { unit_id: string; permille: number }[];
            for (const value of values) {
                const unit = (mocks.db.units ?? []).find(row => row.id === value.unit_id);
                if (unit) unit.share_permille = value.permille;
            }
            const revision = {
                id: `rev-${mocks.rpcCalls.length}`, community_id: args.p_community_id, method: args.p_method, verified: String(args.p_source_note || '').length > 0,
                source_note: args.p_source_note, saved_by_name: args.p_saved_by_name, saved_at: '2026-10-15T12:00:00Z',
                total_permille: 1000, units_count: values.length, previous_values: [], new_values: [],
            };
            (mocks.db.unit_rights_revisions ??= []).unshift(revision);
            return { data: revision, error: null };
        },
    };
    return { supabaseAdmin: client, getSupabaseAdmin: () => client };
});

import { TOOL_DEFINITIONS, describePendingAction, executeTool } from '@/lib/coco/tools';
import { COCO_SYSTEM_PROMPT } from '@/lib/coco/system-prompt';
import { describeAlicuotaInput, readAlicuotaInput } from '@/lib/coco/alicuotaInput';

const COMUNIDAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UNIT_A = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb';
const UNIT_B = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const admin = { user_id: 'admin-1', role: 'admin', community_id: COMUNIDAD, name: 'Administradora' };

function seed(shares: [number | null, number | null], { openVote = false } = {}) {
    mocks.db = {
        units: [
            { id: UNIT_A, community_id: COMUNIDAD, number: '101', tower: 'A', share_permille: shares[0] },
            { id: UNIT_B, community_id: COMUNIDAD, number: '102', tower: 'A', share_permille: shares[1] },
        ],
        assemblies: openVote ? [{ id: 'asm-1', community_id: COMUNIDAD, status: 'in_progress', title: 'Asamblea ordinaria' }] : [],
        assembly_agenda_items: openVote ? [{ id: 'item-1', assembly_id: 'asm-1', voting_status: 'open' }] : [],
        unit_rights_revisions: [],
        billing_runs: [],
    };
    mocks.updates = [];
    mocks.inserts = [];
    mocks.rpcCalls = [];
    mocks.events = [];
}

const definition = (name: string) => (TOOL_DEFINITIONS as ReadonlyArray<{ name: string; description: string; input_schema: { properties: Record<string, { description?: string }>; required: readonly string[] } }>)
    .find(tool => tool.name === name)!;

describe('alícuotas de CoCo: entrada en %', () => {
    it('lee el porcentaje con coma decimal y lo pasa a ‰ (× 10)', () => {
        expect(readAlicuotaInput('set_unit_alicuota', { alicuota_porcentaje: '0,8333' })).toEqual({ ok: true, permille: 8.333, legacy: false });
        expect(readAlicuotaInput('set_unit_alicuota', { alicuota_porcentaje: '12,5 %' })).toEqual({ ok: true, permille: 125, legacy: false });
        expect(readAlicuotaInput('create_unit', {})).toEqual({ ok: true, permille: null, legacy: false });
    });

    it('acepta el parámetro viejo en ‰ y lo convierte; el % manda si vienen ambos', () => {
        expect(readAlicuotaInput('set_unit_alicuota', { permille: '8,333' })).toEqual({ ok: true, permille: 8.333, legacy: true });
        expect(readAlicuotaInput('create_unit', { share_permille: '500' })).toEqual({ ok: true, permille: 500, legacy: true });
        expect(readAlicuotaInput('set_unit_alicuota', { alicuota_porcentaje: '50', permille: '8' })).toEqual({ ok: true, permille: 500, legacy: false });
    });

    it('rechaza 0 %, más de 100 % y textos ilegibles con mensajes en %', () => {
        const cero = readAlicuotaInput('set_unit_alicuota', { alicuota_porcentaje: '0' });
        expect(cero.ok).toBe(false);
        expect(!cero.ok && cero.error).toMatch(/mayores que 0 %/);
        expect(readAlicuotaInput('set_unit_alicuota', { alicuota_porcentaje: '120' }).ok).toBe(false);
        expect(readAlicuotaInput('set_unit_alicuota', { permille: '1500' }).ok).toBe(false);
        const ilegible = readAlicuotaInput('set_unit_alicuota', { alicuota_porcentaje: 'ocho' });
        expect(!ilegible.ok && ilegible.error).toMatch(/porcentaje válido/);
    });

    it('la confirmación muestra el valor en %', () => {
        expect(describeAlicuotaInput('set_unit_alicuota', { permille: '8,333' })).toBe('0,8333 %');
        expect(describePendingAction('set_unit_alicuota', { unit_id: '101', alicuota_porcentaje: '0,8333' }).summary).toContain('0,8333 %');
        expect(describePendingAction('create_unit', { number: '805', alicuota_porcentaje: '1,25' }).summary).toContain('alícuota 1,25 %');
        expect(describePendingAction('distribute_alicuotas_equally', {}).summary).toContain('100 %');
    });
});

describe('alícuotas de CoCo: schema y prompt en %', () => {
    it('las herramientas piden alicuota_porcentaje y no hablan en ‰', () => {
        for (const name of ['create_unit', 'set_unit_alicuota', 'distribute_alicuotas_equally']) {
            const tool = definition(name);
            expect(JSON.stringify(tool)).not.toMatch(/‰|tanto por mil|1000/);
            expect(tool.input_schema.properties).not.toHaveProperty('permille');
            expect(tool.input_schema.properties).not.toHaveProperty('share_permille');
        }
        expect(definition('create_unit').input_schema.properties.alicuota_porcentaje.description).toMatch(/PORCENTAJE/);
        expect(definition('set_unit_alicuota').input_schema.required).toContain('alicuota_porcentaje');
        expect(definition('distribute_alicuotas_equally').description).toMatch(/100 %/);
    });

    it('el prompt pide hablar siempre en % y sumar 100 %', () => {
        expect(COCO_SYSTEM_PROMPT).toMatch(/habla SIEMPRE en %/);
        expect(COCO_SYSTEM_PROMPT).toMatch(/suma de todas debe dar 100 %/);
        expect(COCO_SYSTEM_PROMPT).not.toMatch(/1000‰|tanto por mil que paga/);
    });
});

describe('alícuotas de CoCo: escriben por el servicio de derechos', () => {
    beforeEach(() => seed([null, null]));

    it('set_unit_alicuota parcial: escribe esa unidad en ‰ (el trigger la registra como direct) y avisa que falta', async () => {
        const result = await executeTool('set_unit_alicuota', { unit_id: UNIT_A, alicuota_porcentaje: '50' }, admin) as Row;
        expect(result.success).toBe(true);
        expect(result.alicuota_porcentaje).toBe('50 %');
        expect(result.provisorio).toBe(true);
        expect(result.derechos_completos).toBe(false);
        expect(mocks.rpcCalls).toHaveLength(0);
        expect(mocks.updates).toEqual([{ table: 'units', values: { share_permille: 500 }, filters: { id: UNIT_A, community_id: COMUNIDAD } }]);
        expect(JSON.stringify(result.advertencias)).toMatch(/Faltan los derechos/);
        expect(mocks.events[0]).toMatchObject({ action: 'assembly.unit_rights_saved', metadata: { method: 'direct', verified: false, channel: 'coco' } });
    });

    it('set_unit_alicuota que completa el 100 %: carga completa por save_unit_rights, provisoria sin fuente', async () => {
        seed([500, null]);
        const result = await executeTool('set_unit_alicuota', { unit_id: '102', alicuota_porcentaje: '50' }, admin) as Row;
        expect(result.success).toBe(true);
        expect(result.derechos_completos).toBe(true);
        expect(result.provisorio).toBe(true);
        expect(result.suma_actual_porcentaje).toBe('100 %');
        expect(mocks.updates.filter(update => update.table === 'units')).toHaveLength(0);
        expect(mocks.rpcCalls).toHaveLength(1);
        expect(mocks.rpcCalls[0].fn).toBe('save_unit_rights');
        expect(mocks.rpcCalls[0].args).toMatchObject({
            p_community_id: COMUNIDAD, p_method: 'manual', p_source_note: '', p_saved_by: 'admin-1', p_saved_by_name: 'Administradora (vía CoCo)',
            p_values: [{ unit_id: UNIT_A, permille: 500 }, { unit_id: UNIT_B, permille: 500 }],
        });
    });

    it('con fuente, la carga completa queda verificada', async () => {
        seed([500, null]);
        const result = await executeTool('set_unit_alicuota', { unit_id: UNIT_B, alicuota_porcentaje: '50', fuente: 'Reglamento de copropiedad, art. 5' }, admin) as Row;
        expect(result.provisorio).toBe(false);
        expect(result.estado_derechos).toBe('verificados');
        expect(mocks.rpcCalls[0].args.p_source_note).toBe('Reglamento de copropiedad, art. 5');
    });

    it('acepta el parámetro viejo permille (‰) y responde en %', async () => {
        const result = await executeTool('set_unit_alicuota', { unit_id: UNIT_A, permille: '8,333' }, admin) as Row;
        expect(result.alicuota_porcentaje).toBe('0,8333 %');
        expect(mocks.updates[0].values).toEqual({ share_permille: 8.333 });
    });

    it('si la suma no cuadra, informa la diferencia en %', async () => {
        seed([500, 400]);
        const result = await executeTool('set_unit_alicuota', { unit_id: UNIT_B, alicuota_porcentaje: '49' }, admin) as Row;
        expect(result.derechos_completos).toBe(false);
        expect(result.suma_actual_porcentaje).toBe('99 %');
        expect(JSON.stringify(result.advertencias)).toContain('falta 1 %');
    });

    it('rechaza valores fuera de rango sin escribir', async () => {
        const result = await executeTool('set_unit_alicuota', { unit_id: UNIT_A, alicuota_porcentaje: '0' }, admin) as Row;
        expect(result.error).toMatch(/mayores que 0 %/);
        expect(mocks.updates).toHaveLength(0);
        expect(mocks.rpcCalls).toHaveLength(0);
    });

    it('bloquea si hay una votación abierta', async () => {
        seed([500, null], { openVote: true });
        const result = await executeTool('set_unit_alicuota', { unit_id: UNIT_B, alicuota_porcentaje: '50' }, admin) as Row;
        expect(result.error).toMatch(/votación abierta/);
        expect(result.bloqueado_por_votacion).toBe(true);
        expect(mocks.updates).toHaveLength(0);
        expect(mocks.rpcCalls).toHaveLength(0);
    });

    it('distribute_alicuotas_equally: 100 % exacto por save_unit_rights, provisorio y en %', async () => {
        const result = await executeTool('distribute_alicuotas_equally', {}, admin) as Row;
        expect(result.success).toBe(true);
        expect(result.alicuota_porcentaje).toBe('50 %');
        expect(result.suma_porcentaje).toBe('100 %');
        expect(result.provisorio).toBe(true);
        expect(String(result.message)).not.toMatch(/‰/);
        const values = mocks.rpcCalls[0].args.p_values as { permille: number }[];
        expect(values.reduce((sum, value) => sum + value.permille, 0)).toBe(1000);
        expect(mocks.rpcCalls[0].args.p_method).toBe('manual');
        expect(mocks.events.at(-1)).toMatchObject({ metadata: { method: 'manual', channel: 'coco', verified: false } });
    });

    it('distribute_alicuotas_equally bloquea si hay una votación abierta', async () => {
        seed([null, null], { openVote: true });
        const result = await executeTool('distribute_alicuotas_equally', {}, admin) as Row;
        expect(result.error).toMatch(/votación abierta/);
        expect(mocks.rpcCalls).toHaveLength(0);
    });

    it('create_unit crea la unidad sin derechos y la alícuota entra por el servicio, en %', async () => {
        const result = await executeTool('create_unit', { number: '103', alicuota_porcentaje: '0,5' }, admin) as Row;
        expect(result.success).toBe(true);
        expect(mocks.inserts[0].values).not.toHaveProperty('share_permille');
        expect(mocks.updates[0].values).toEqual({ share_permille: 5 });
        expect(result.alicuota_porcentaje).toBe('0,5 %');
        expect(result.provisorio).toBe(true);
    });

    it('create_unit no crea nada si hay una votación abierta y viene alícuota', async () => {
        seed([null, null], { openVote: true });
        const result = await executeTool('create_unit', { number: '103', share_permille: '5' }, admin) as Row;
        expect(result.error).toMatch(/votación abierta/);
        expect(mocks.inserts).toHaveLength(0);
    });

    it('create_unit sin alícuota no toca derechos', async () => {
        const result = await executeTool('create_unit', { number: '103' }, admin) as Row;
        expect(result.success).toBe(true);
        expect(mocks.updates).toHaveLength(0);
        expect(mocks.rpcCalls).toHaveLength(0);
    });

    it('solo administración', async () => {
        const result = await executeTool('set_unit_alicuota', { unit_id: UNIT_A, alicuota_porcentaje: '50' }, { ...admin, role: 'resident' }) as Row;
        expect(result.error).toBeTruthy();
        expect(mocks.updates).toHaveLength(0);
    });
});
