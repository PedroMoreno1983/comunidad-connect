/**
 * El checklist de QA del PR #68 pedia probar el puente `coco_action` a mano,
 * logueado como admin: proponer, aprobar, rechazar, y confirmar que una accion
 * reconocida de siempre sigue igual. Eso nunca se corrio. Aqui estan los mismos
 * cuatro pasos contra el route handler real, con Supabase y askCoCo simulados.
 *
 * Se ejercita el flujo completo de la ruta: routing -> delegacion en CoCo ->
 * tarjeta de aprobacion persistida -> confirmacion -> reanudacion de la sesion
 * de CoCo -> bitacora. Los tests unitarios del puente ya cubrian las piezas por
 * separado; lo que faltaba era verificar que encajan.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
    profile: {
        id: 'admin-1',
        name: 'Administracion',
        email: 'admin@condominio.cl',
        role: 'admin',
        unit_id: null,
        community_id: 'community-1',
    } as Row | null,
    askCoCo: vi.fn(),
    plannerAction: null as Row | null,
    session: null as Row | null,
    savedSessions: [] as { key: string; payload: Row }[],
    deletedSessions: [] as string[],
    tables: {} as Record<string, Row[]>,
    inserts: [] as { table: string; payload: Row }[],
    updates: [] as { table: string; payload: Row; filters: [string, unknown][] }[],
    seq: {} as Record<string, number>,
}));

// ── Supabase admin simulado ──────────────────────────────────────────────────
// Constructor encadenable: cualquier filtro devuelve el mismo builder y la
// resolucion depende de la tabla y de la operacion. Registra inserts y updates
// para poder afirmar sobre la bitacora.
function createFrom() {
    return function from(table: string) {
        const op = {
            kind: 'select' as 'select' | 'insert' | 'update' | 'delete' | 'upsert',
            payload: null as Row | null,
            filters: [] as [string, unknown][],
            recorded: false,
        };

        const recordUpdate = () => {
            if (op.kind !== 'update' || op.recorded) return;
            op.recorded = true;
            mocks.updates.push({ table, payload: op.payload ?? {}, filters: op.filters });
        };

        const rows = () => mocks.tables[table] ?? [];

        const resolveSingle = () => {
            recordUpdate();
            if (op.kind === 'insert' || op.kind === 'upsert') {
                const n = (mocks.seq[table] = (mocks.seq[table] ?? 0) + 1);
                return { data: { id: `${table}-${n}` }, error: null };
            }
            return { data: rows()[0] ?? null, error: null };
        };

        const resolveList = () => {
            recordUpdate();
            return { data: rows(), error: null, count: rows().length };
        };

        const builder: Record<string, unknown> = {
            select: () => builder,
            insert: (payload: Row) => {
                op.kind = 'insert';
                op.payload = payload;
                mocks.inserts.push({ table, payload });
                return builder;
            },
            upsert: () => {
                op.kind = 'upsert';
                return builder;
            },
            update: (payload: Row) => {
                op.kind = 'update';
                op.payload = payload;
                return builder;
            },
            delete: () => {
                op.kind = 'delete';
                return builder;
            },
            maybeSingle: async () => resolveSingle(),
            single: async () => resolveSingle(),
            then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
                Promise.resolve(resolveList()).then(onOk, onErr),
        };

        for (const method of ['eq', 'neq', 'in', 'gte', 'lte', 'gt', 'lt', 'is', 'not', 'or', 'ilike', 'order', 'limit', 'range', 'contains']) {
            builder[method] = (column?: unknown, value?: unknown) => {
                if (typeof column === 'string') op.filters.push([column, value]);
                return builder;
            };
        }

        return builder;
    };
}

vi.mock('@/lib/security/rateLimit', () => ({
    enforceRateLimit: () => null,
}));

vi.mock('@/lib/server/agentIdentity', () => ({
    getAuthenticatedAgentProfile: async () => mocks.profile,
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({ from: createFrom(), rpc: async () => ({ data: null, error: null }) }),
}));

vi.mock('@/lib/coco/session-store', () => ({
    getSession: async () => mocks.session,
    saveSession: async (key: string, payload: Row) => {
        mocks.savedSessions.push({ key, payload });
    },
    deleteSession: async (key: string) => {
        mocks.deletedSessions.push(key);
    },
}));

vi.mock('@/lib/coco/agent', () => ({
    askCoCo: (...args: unknown[]) => mocks.askCoCo(...args),
}));

vi.mock('@/lib/agent-center/planner', () => ({
    planAgentAction: async () => mocks.plannerAction,
    getAgentPlannerModel: () => 'test-model',
}));

import { POST } from '@/app/api/agent-center/route';

function post(body: Row) {
    return new NextRequest('http://localhost/api/agent-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const PENDING_STEP = {
    toolUseId: 'toolu_abc123',
    name: 'update_unit_data',
    input: { unit_number: '504', field: 'phone', value: '+56911112222' },
    title: 'Actualizar telefono del depto 504',
    summary: 'Deja el telefono +56911112222 en la unidad 504.',
};

// Mensaje que el router operativo NO reconoce (no es cobranza, comunicado,
// reserva ni visita) pero que CoCo si sabe resolver con sus tools.
const UNRECOGNIZED_MESSAGE = 'actualiza el telefono de contacto del departamento 504';

describe('puente coco_action end-to-end (checklist de QA del PR #68)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.profile = {
            id: 'admin-1',
            name: 'Administracion',
            email: 'admin@condominio.cl',
            role: 'admin',
            unit_id: null,
            community_id: 'community-1',
        };
        mocks.plannerAction = null;
        mocks.session = { conversation: [{ role: 'assistant', content: 'tool_use pendiente' }], user_context: {} };
        mocks.savedSessions = [];
        mocks.deletedSessions = [];
        mocks.inserts = [];
        mocks.updates = [];
        mocks.seq = {};
        mocks.tables = {
            agent_policies: [],
            // Una sola corrida: sirve de fila para loadPersistedProposal y deja el
            // contador de acciones diarias muy por debajo del tope (80).
            agent_runs: [{
                id: 'run-1',
                user_id: 'admin-1',
                community_id: 'community-1',
                agent_key: 'community',
                user_message: UNRECOGNIZED_MESSAGE,
                summary: 'Accion propuesta por CoCo',
                metadata: { targetHref: '/agent-center' },
            }],
            agent_tool_calls: [{
                id: 'toolcall-1',
                run_id: 'run-1',
                user_id: 'admin-1',
                community_id: 'community-1',
                tool_name: 'coco_action',
                args: { pending: [PENDING_STEP], reply: 'Puedo actualizarlo.' },
                requires_confirmation: true,
                status: 'proposed',
            }],
        };
    });

    // ── Paso 1 del checklist ────────────────────────────────────────────────
    it('un mensaje que el router no reconoce y CoCo si, produce una TARJETA de aprobacion (no solo texto)', async () => {
        mocks.askCoCo.mockResolvedValue({
            reply: 'Puedo actualizarlo, confirmame.',
            pendingActions: [PENDING_STEP],
            updatedHistory: [{ role: 'assistant', content: 'tool_use' }],
        });

        const response = await POST(post({ message: UNRECOGNIZED_MESSAGE }));
        const data = await response.json();

        expect(data.status).toBe('awaiting_confirmation');
        expect(data.action.toolName).toBe('coco_action');
        expect(data.action.requiresConfirmation).toBe(true);
        // La tarjeta queda persistida y auditable: sin proposalId no se puede aprobar.
        expect(data.action.proposalId).toBeTruthy();
        expect(data.action.runId).toBeTruthy();
        // Los pasos que CoCo va a ejecutar viajan en los args, no se pierden.
        expect(data.action.args.pending[0].toolUseId).toBe('toolu_abc123');
        // El texto de CoCo llega completo y como markdown renderizable.
        expect(data.action.summary).toContain('Puedo actualizarlo, confirmame.');
        expect(data.action.summary).toContain('- **Actualizar telefono del depto 504**');
        // Nada se ejecuto todavia.
        expect(mocks.askCoCo).toHaveBeenCalledTimes(1);
    });

    it('la sesion de CoCo se guarda bajo una clave derivada del perfil, nunca del cliente', async () => {
        mocks.askCoCo.mockResolvedValue({
            reply: 'Puedo actualizarlo.',
            pendingActions: [PENDING_STEP],
            updatedHistory: [{ role: 'assistant', content: 'tool_use' }],
        });

        await POST(post({ message: UNRECOGNIZED_MESSAGE, sessionKey: 'agentcoco:web:otro-admin' }));

        const cocoSession = mocks.savedSessions.find(s => s.key.startsWith('agentcoco:web:'));
        expect(cocoSession?.key).toBe('agentcoco:web:admin-1');
        expect(mocks.savedSessions.some(s => s.key.includes('otro-admin'))).toBe(false);
    });

    // ── Paso 2 del checklist ────────────────────────────────────────────────
    it('aprobar reanuda la sesion de CoCo con resolutions=approved, ejecuta y deja bitacora', async () => {
        mocks.askCoCo.mockResolvedValue({
            reply: 'Listo, telefono actualizado.',
            pendingActions: [],
            updatedHistory: [{ role: 'assistant', content: 'hecho' }],
        });

        const response = await POST(post({
            confirmed: true,
            action: {
                agentKey: 'community',
                toolName: 'coco_action',
                args: { pending: [PENDING_STEP], reply: 'Puedo actualizarlo.' },
                requiresConfirmation: true,
                title: 'Actualizar telefono del depto 504',
                summary: 'Puedo actualizarlo.',
                targetHref: '/agent-center',
                proposalId: 'toolcall-1',
                runId: 'run-1',
            },
        }));
        const data = await response.json();

        expect(data.status).toBe('executed');
        expect(data.reply).toContain('telefono actualizado');

        // Se reanudo la sesion de CoCo con la confirmacion humana del paso exacto.
        const [, , , options] = mocks.askCoCo.mock.calls[0] as [string, unknown, unknown, { resolutions: Record<string, string> }];
        expect(options.resolutions).toEqual({ toolu_abc123: 'approved' });

        // Bitacora: la propuesta queda ejecutada y la aprobacion registrada.
        expect(mocks.updates.some(u => u.table === 'agent_tool_calls' && u.payload.status === 'executed')).toBe(true);
        expect(mocks.updates.some(u => u.table === 'agent_runs' && u.payload.status === 'executed')).toBe(true);
        const approval = mocks.inserts.find(i => i.table === 'agent_action_approvals');
        expect(approval?.payload.decision).toBe('approved');
        expect(mocks.inserts.some(i => i.table === 'agent_activity_log')).toBe(true);
    });

    it('si la sesion de CoCo expiro, aprobar falla con un mensaje entendible y no inventa una ejecucion', async () => {
        mocks.session = null;

        const response = await POST(post({
            confirmed: true,
            action: {
                agentKey: 'community',
                toolName: 'coco_action',
                args: { pending: [PENDING_STEP], reply: 'Puedo actualizarlo.' },
                requiresConfirmation: true,
                title: 'Actualizar telefono',
                summary: 'Puedo actualizarlo.',
                targetHref: '/agent-center',
                proposalId: 'toolcall-1',
                runId: 'run-1',
            },
        }));
        const data = await response.json();

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(String(data.error)).toContain('expiro');

        // La propuesta queda marcada como fallida. Ojo con el orden: primero
        // `claimPersistedProposal` la pone en 'executed' como lock optimista (para
        // que dos solicitudes simultaneas no la ejecuten dos veces) y recien
        // despues corre la ejecucion. Lo que importa es el estado FINAL.
        const toolCallStates = mocks.updates
            .filter(u => u.table === 'agent_tool_calls')
            .map(u => u.payload.status);
        expect(toolCallStates.at(-1)).toBe('failed');
        expect(mocks.updates.some(u => u.table === 'agent_runs' && u.payload.status === 'failed')).toBe(true);
        // Y no se registro ninguna aprobacion, porque nunca se ejecuto.
        expect(mocks.inserts.some(i => i.table === 'agent_action_approvals')).toBe(false);
    });

    // ── Paso 3 del checklist ────────────────────────────────────────────────
    it('rechazar no ejecuta nada, limpia el pending de CoCo y no bloquea el proximo mensaje', async () => {
        mocks.askCoCo.mockResolvedValue({
            reply: 'Entendido, lo descarto.',
            pendingActions: [],
            updatedHistory: [{ role: 'assistant', content: 'descartado' }],
        });

        const response = await POST(post({
            rejected: true,
            action: {
                agentKey: 'community',
                toolName: 'coco_action',
                args: { pending: [PENDING_STEP], reply: 'Puedo actualizarlo.' },
                requiresConfirmation: true,
                title: 'Actualizar telefono',
                summary: 'Puedo actualizarlo.',
                targetHref: '/agent-center',
                proposalId: 'toolcall-1',
                runId: 'run-1',
            },
        }));
        const data = await response.json();

        expect(data.status).toBe('rejected');

        // Se reanudo la sesion con rechazo: sin esto, el tool_use pendiente queda
        // colgado y bloquea el siguiente mensaje del administrador.
        const [, , , options] = mocks.askCoCo.mock.calls[0] as [string, unknown, unknown, { resolutions: Record<string, string> }];
        expect(options.resolutions).toEqual({ toolu_abc123: 'rejected' });

        // La sesion limpia queda persistida.
        expect(mocks.savedSessions.some(s => s.key === 'agentcoco:web:admin-1')).toBe(true);

        // Nada quedo marcado como ejecutado.
        expect(mocks.updates.some(u => u.table === 'agent_tool_calls' && u.payload.status === 'rejected')).toBe(true);
        expect(mocks.updates.some(u => u.table === 'agent_tool_calls' && u.payload.status === 'executed')).toBe(false);
        const approval = mocks.inserts.find(i => i.table === 'agent_action_approvals');
        expect(approval?.payload.decision).toBe('rejected');
    });

    // ── Paso 4 del checklist ────────────────────────────────────────────────
    it('una accion reconocida de siempre (comunicado) sigue su flujo y NO pasa por CoCo', async () => {
        mocks.askCoCo.mockResolvedValue({ reply: 'no deberia llamarse', pendingActions: [], updatedHistory: [] });

        const response = await POST(post({
            message: 'publica un comunicado: corte de agua programado para el martes en todo el edificio',
        }));
        const data = await response.json();

        expect(data.status).toBe('awaiting_confirmation');
        expect(data.action.toolName).toBe('create_announcement');
        // El puente no se mete en el camino de las acciones ya reconocidas.
        expect(mocks.askCoCo).not.toHaveBeenCalled();
    });

    it('cuando CoCo solo responde (sin mutacion) el Agent Center muestra el texto, no una tarjeta', async () => {
        mocks.askCoCo.mockResolvedValue({
            reply: 'La morosidad de mayo suma $437.900 en tres unidades.',
            pendingActions: [],
            updatedHistory: [{ role: 'assistant', content: 'respuesta' }],
        });

        const response = await POST(post({ message: '¿como viene la morosidad de mayo?' }));
        const data = await response.json();

        expect(data.action.toolName).not.toBe('coco_action');
        expect(data.action.summary).toContain('$437.900');
    });
});
