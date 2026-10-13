/**
 * Ciclo agentico del Agent Center (agentLoop.ts).
 *
 * Anthropic esta simulado: cada test fija la secuencia de respuestas que
 * "decide" Claude. La persistencia (agent_runs, agent_tool_calls, agent_tasks,
 * agent_task_steps) corre contra un Supabase en memoria que SI aplica filtros,
 * asi que tambien se comprueba el aislamiento por comunidad de las tareas.
 * La ejecucion de herramientas se simula: aqui se prueba el ciclo, no las
 * herramientas (ver agent-center-agent-tools.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, fakeClient, type FakeDb } from '../fixtures/fakeSupabase';

type Params = { messages: Array<{ role: string; content: unknown }>; tools: Array<{ name: string }>; tool_choice?: unknown };

const mocks = vi.hoisted(() => ({
    db: null as unknown as FakeDb,
    responses: [] as Array<Record<string, unknown> | Error>,
    calls: [] as Params[],
    execute: vi.fn(),
    enforceAiBudget: vi.fn(async () => undefined),
    recordAiUsage: vi.fn(async () => undefined),
}));

vi.mock('@anthropic-ai/sdk', () => ({
    default: class {
        messages = {
            create: async (params: Params) => {
                // Copia profunda: el ciclo muta `messages` despues de la llamada.
                mocks.calls.push(JSON.parse(JSON.stringify(params)));
                const next = mocks.responses.shift();
                if (!next) throw new Error('Respuesta de Claude no programada en el test');
                if (next instanceof Error) throw next;
                return next;
            },
        };
    },
}));

vi.mock('@/lib/ai/budget', () => ({
    enforceAiBudget: mocks.enforceAiBudget,
    recordAiUsage: mocks.recordAiUsage,
    estimateAiCostCents: () => 1,
    estimateTokensFromMessages: () => 10,
    estimateTokensFromText: () => 10,
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => fakeClient(mocks.db),
    supabaseAdmin: new Proxy({}, { get: (_target, property) => (fakeClient(mocks.db) as Record<string | symbol, unknown>)[property] }),
}));

vi.mock('@/lib/agent-center/actionExecutor', () => ({
    executeAgentAction: (...args: unknown[]) => mocks.execute(...args),
}));

import { attachLoopProposal, cancelAgentLoopTask, continueAgentLoopAfterWrite, loopToolsFor, resumeAgentLoopTask, runAgentLoop } from '@/lib/agent-center/agentLoop';
import { MAX_AGENT_LOOP_STEPS, type AgentProfile } from '@/lib/agent-center/domain';

const COMMUNITY_A = '11111111-1111-4111-8111-111111111111';
const COMMUNITY_B = '22222222-2222-4222-8222-222222222222';
const TICKET = '33333333-3333-4333-8333-333333333333';
const PROVIDER = '44444444-4444-4444-8444-444444444444';

const admin: AgentProfile = { id: 'admin-a', name: 'Admin A', role: 'admin', community_id: COMMUNITY_A };
const adminOtherCommunity: AgentProfile = { id: 'admin-b', name: 'Admin B', role: 'admin', community_id: COMMUNITY_B };
const resident: AgentProfile = { id: 'resident-a', name: 'Vecina', role: 'resident', community_id: COMMUNITY_A };

let toolUseSeq = 0;
function toolUse(name: string, input: Record<string, unknown> = {}) {
    const id = `toolu_${++toolUseSeq}`;
    return { id, response: { content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use', usage: { input_tokens: 120, output_tokens: 30 } } };
}

function answer(text: string) {
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 200, output_tokens: 60 } };
}

function readResult(title: string, message: string, data: unknown = {}) {
    return { entityType: 'read', entityId: null, title, message, data };
}

function lastUserContent(params: Params) {
    return params.messages[params.messages.length - 1].content as Array<Record<string, unknown>>;
}

describe('Agent Center: ciclo agentico con tool use nativo', () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = 'test-key';
        mocks.db = createFakeDb();
        mocks.responses = [];
        mocks.calls = [];
        mocks.execute.mockReset();
        mocks.enforceAiBudget.mockClear();
        mocks.recordAiUsage.mockClear();
    });

    afterEach(() => {
        delete process.env.ANTHROPIC_API_KEY;
    });

    it('si Claude falla en la primera ronda no deja una corrida huerfana en la bitacora', async () => {
        // La ruta cae al respaldo deterministico / puente CoCo, que audita su
        // propia corrida. Una fila "Ciclo agentico" aqui taparia esa corrida.
        mocks.responses = [new Error('401 invalid x-api-key')];

        await expect(runAgentLoop({ message: 'Publica un aviso en el muro', profile: admin })).rejects.toThrow('401');

        expect(mocks.db.tables.agent_runs ?? []).toHaveLength(0);
        expect(mocks.db.tables.agent_tool_calls ?? []).toHaveLength(0);
        expect(mocks.db.tables.agent_tasks ?? []).toHaveLength(0);
    });

    it('encadena dos lecturas y responde sin pedir confirmacion', async () => {
        const backlog = toolUse('get_maintenance_backlog');
        const parking = toolUse('get_parking_status');
        mocks.responses = [backlog.response, parking.response, answer('Hay 3 tickets abiertos y 2 estacionamientos libres.')];
        mocks.execute
            .mockResolvedValueOnce(readResult('Backlog de mantencion revisado', '3 tickets abiertos'))
            .mockResolvedValueOnce(readResult('Estacionamientos revisados', '2 cupos disponibles'));

        const outcome = await runAgentLoop({ message: 'Como esta mantencion y hay estacionamiento libre?', profile: admin });

        expect(outcome?.kind).toBe('answer');
        if (outcome?.kind !== 'answer') return;
        expect(outcome.text).toContain('3 tickets');
        expect(outcome.stepLimitReached).toBe(false);
        // Las dos lecturas corrieron solas, en orden.
        expect(mocks.execute.mock.calls.map(call => (call[0] as { toolName: string }).toolName))
            .toEqual(['get_maintenance_backlog', 'get_parking_status']);
        // Claude recibio cada resultado como tool_result del tool_use correcto.
        expect(lastUserContent(mocks.calls[1])[0]).toMatchObject({ type: 'tool_result', tool_use_id: backlog.id });
        expect(String(lastUserContent(mocks.calls[1])[0].content)).toContain('3 tickets abiertos');
        expect(lastUserContent(mocks.calls[2])[0]).toMatchObject({ type: 'tool_result', tool_use_id: parking.id });
        // Herramientas reales y una sola por turno.
        expect(mocks.calls[0].tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true });
        // Sin escrituras no hay tarea ni tarjeta de aprobacion.
        expect(mocks.db.tables.agent_tasks ?? []).toHaveLength(0);
        expect((mocks.db.tables.agent_tool_calls ?? []).filter(row => row.status === 'proposed')).toHaveLength(0);
        // Auditoria: una corrida y una fila por herramienta.
        const calls = mocks.db.tables.agent_tool_calls ?? [];
        expect(calls.map(row => [row.tool_name, row.status])).toEqual([
            ['get_maintenance_backlog', 'executed'],
            ['get_parking_status', 'executed'],
        ]);
        expect(calls.every(row => row.community_id === COMMUNITY_A && row.run_id === outcome.runId)).toBe(true);
        expect(mocks.db.tables.agent_runs?.[0]).toMatchObject({ status: 'executed', intent: 'agent_loop' });
        // Presupuesto: se revisa en cada ronda y se registra el consumo.
        expect(mocks.enforceAiBudget).toHaveBeenCalledTimes(3);
        expect(mocks.recordAiUsage).toHaveBeenCalledTimes(1);
    });

    it('una escritura pausa la tarea en waiting_human y al confirmar el ciclo se reanuda', async () => {
        const backlog = toolUse('get_maintenance_backlog');
        const assign = toolUse('update_maintenance_ticket', { ticketId: TICKET, providerId: PROVIDER });
        mocks.responses = [backlog.response, assign.response];
        mocks.execute.mockResolvedValueOnce(readResult('Backlog de mantencion revisado', '1 ticket sin proveedor', { oldest: [{ ticketId: TICKET }] }));

        const paused = await runAgentLoop({ message: 'Asigna el ticket mas antiguo al gasfiter', profile: admin });

        expect(paused?.kind).toBe('pause');
        if (paused?.kind !== 'pause') return;
        // La escritura NO se ejecuto: solo la lectura.
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(paused.action).toMatchObject({
            toolName: 'update_maintenance_ticket',
            requiresConfirmation: true,
            agentTaskId: paused.taskId,
            args: { ticketId: TICKET, providerId: PROVIDER },
        });
        expect(paused.action.loopTrace?.[0]?.title).toBe('Backlog de mantencion revisado');

        const task = mocks.db.tables.agent_tasks[0];
        expect(task).toMatchObject({ id: paused.taskId, status: 'waiting_human', playbook_key: 'agentic_loop', community_id: COMMUNITY_A });
        const steps = mocks.db.tables.agent_task_steps.filter(step => step.task_id === paused.taskId);
        expect(steps.map(step => step.status)).toEqual(['completed', 'waiting_human']);

        // La ruta persiste la tarjeta y la liga a la tarea.
        await attachLoopProposal(admin, paused.taskId, 'proposal-1');

        // Confirmar desde otra comunidad no reanuda nada.
        await expect(continueAgentLoopAfterWrite({
            profile: adminOtherCommunity, taskId: paused.taskId, proposalId: 'proposal-1',
            result: { entityType: 'service_request', entityId: TICKET, title: 'Ticket actualizado', message: 'x' },
        })).rejects.toThrow('no existe en tu comunidad');
        // Ni con una tarjeta que no es la pendiente.
        await expect(continueAgentLoopAfterWrite({
            profile: admin, taskId: paused.taskId, proposalId: 'otra-tarjeta',
            result: { entityType: 'service_request', entityId: TICKET, title: 'Ticket actualizado', message: 'x' },
        })).rejects.toThrow('no corresponde');
        expect(mocks.calls).toHaveLength(2);

        mocks.responses = [answer('Listo: el ticket quedo asignado al gasfiter.')];
        const resumed = await continueAgentLoopAfterWrite({
            profile: admin, taskId: paused.taskId, proposalId: 'proposal-1',
            result: { entityType: 'service_request', entityId: TICKET, title: 'Ticket actualizado', message: 'Ticket asignado a Gasfiter Pro.' },
        });

        expect(resumed.kind).toBe('answer');
        if (resumed.kind !== 'answer') return;
        expect(resumed.text).toContain('asignado');
        // Claude recibio el resultado de la escritura confirmada como tool_result.
        const resultBlock = lastUserContent(mocks.calls[2]).find(block => block.tool_use_id === assign.id);
        expect(resultBlock).toMatchObject({ type: 'tool_result' });
        expect(String(resultBlock?.content)).toContain('confirmadoPorHumano');
        expect(String(resultBlock?.content)).toContain('Gasfiter Pro');
        // La tarea termino y el paso de la escritura quedo completado.
        expect(mocks.db.tables.agent_tasks[0].status).toBe('completed');
        expect(mocks.db.tables.agent_task_steps.find(step => step.task_id === paused.taskId && step.position === 1)?.status).toBe('completed');
    });

    it('si la API cae despues de confirmar, la tarea queda escalada y resume la continua', async () => {
        const assign = toolUse('update_maintenance_ticket', { ticketId: TICKET, status: 'accepted' });
        mocks.responses = [assign.response];
        const paused = await runAgentLoop({ message: 'Acepta el ticket', profile: admin });
        if (paused?.kind !== 'pause') throw new Error('se esperaba una pausa');
        await attachLoopProposal(admin, paused.taskId, 'proposal-2');

        mocks.responses = [new Error('overloaded')];
        await expect(continueAgentLoopAfterWrite({
            profile: admin, taskId: paused.taskId, proposalId: 'proposal-2',
            result: { entityType: 'service_request', entityId: TICKET, title: 'Ticket actualizado', message: 'Ticket aceptado.' },
        })).rejects.toThrow('overloaded');
        expect(mocks.db.tables.agent_tasks[0].status).toBe('escalated');

        mocks.responses = [answer('El ticket quedo aceptado.')];
        const resumed = await resumeAgentLoopTask(admin, paused.taskId);
        expect(resumed?.result.message).toBe('El ticket quedo aceptado.');
        // Retoma desde la transcripcion guardada: el resultado ya estaba incorporado.
        expect(String(lastUserContent(mocks.calls[mocks.calls.length - 1])[0].content)).toContain('Ticket aceptado.');
        expect(mocks.db.tables.agent_tasks[0].status).toBe('completed');
        // Otra comunidad no puede retomarla: para ella la tarea no existe.
        expect(await resumeAgentLoopTask(adminOtherCommunity, paused.taskId)).toBeNull();
    });

    it('rechazar la escritura cancela la tarea sin volver a llamar a Claude', async () => {
        mocks.responses = [toolUse('create_poll', { title: 'Pintura fachada', options: ['Si', 'No'], closesAt: '2099-01-01T12:00:00Z' }).response];
        const paused = await runAgentLoop({ message: 'Crea una votacion para pintar la fachada', profile: admin });
        if (paused?.kind !== 'pause') throw new Error('se esperaba una pausa');
        await attachLoopProposal(admin, paused.taskId, 'proposal-3');

        await cancelAgentLoopTask(admin, paused.taskId, 'proposal-3');

        expect(mocks.db.tables.agent_tasks[0].status).toBe('cancelled');
        expect(mocks.db.tables.agent_task_steps.at(-1)?.status).toBe('skipped');
        expect(mocks.calls).toHaveLength(1);
    });

    it(`respeta el tope de ${MAX_AGENT_LOOP_STEPS} pasos aunque Claude siga pidiendo herramientas`, async () => {
        mocks.responses = Array.from({ length: MAX_AGENT_LOOP_STEPS + 5 }, () => toolUse('get_active_polls').response);
        mocks.execute.mockResolvedValue(readResult('Votaciones revisadas', '1 votacion activa'));

        const outcome = await runAgentLoop({ message: 'revisa las votaciones una y otra vez', profile: admin });

        expect(outcome?.kind).toBe('answer');
        if (outcome?.kind !== 'answer') return;
        expect(outcome.stepLimitReached).toBe(true);
        expect(outcome.text).toContain(`limite de ${MAX_AGENT_LOOP_STEPS} pasos`);
        expect(mocks.calls).toHaveLength(MAX_AGENT_LOOP_STEPS);
        expect(mocks.enforceAiBudget).toHaveBeenCalledTimes(MAX_AGENT_LOOP_STEPS);
    });

    it('un residente no ve ni puede usar herramientas de administracion', async () => {
        const forbidden = toolUse('get_maintenance_backlog');
        mocks.responses = [forbidden.response, answer('No tengo acceso a esa informacion.')];

        const outcome = await runAgentLoop({ message: 'muestrame los tickets de todo el edificio', profile: resident });

        const offered = mocks.calls[0].tools.map(tool => tool.name);
        for (const adminTool of ['get_maintenance_backlog', 'update_maintenance_ticket', 'create_poll', 'find_resident_or_unit', 'get_resident_expenses', 'create_unit_expense', 'run_playbook', 'plan_mission']) {
            expect(offered).not.toContain(adminTool);
        }
        expect(offered).toEqual(expect.arrayContaining(['get_parking_status', 'get_active_polls', 'get_supermarket_orders_summary', 'create_parking_booking']));
        // Aunque Claude la nombre, no se ejecuta y queda auditado como rechazo.
        expect(mocks.execute).not.toHaveBeenCalled();
        expect(lastUserContent(mocks.calls[1])[0]).toMatchObject({ type: 'tool_result', tool_use_id: forbidden.id, is_error: true });
        expect(mocks.db.tables.agent_tool_calls.map(row => [row.tool_name, row.status])).toEqual([['get_maintenance_backlog', 'rejected']]);
        expect(outcome?.kind).toBe('answer');
    });

    it('solo ofrece herramientas de agentes activos', () => {
        const names = loopToolsFor(admin, { isAgentActive: agentKey => agentKey !== 'maintenance' }).map(tool => tool.name);
        expect(names).not.toContain('get_maintenance_backlog');
        expect(names).not.toContain('update_maintenance_ticket');
        expect(names).toContain('get_active_polls');
    });

    it('sin ANTHROPIC_API_KEY no intenta el ciclo (la ruta usa el respaldo deterministico)', async () => {
        delete process.env.ANTHROPIC_API_KEY;
        expect(await runAgentLoop({ message: 'hola', profile: admin })).toBeNull();
        expect(mocks.calls).toHaveLength(0);
    });
});
