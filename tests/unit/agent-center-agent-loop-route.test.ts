/**
 * Ciclo agentico de punta a punta a traves de la ruta real `/api/agent-center`:
 * mensaje -> Claude lee el backlog -> propone asignar un ticket -> la ruta
 * persiste la tarjeta ligada a la tarea en waiting_human -> la persona confirma
 * -> la escritura se ejecuta (herramienta real contra Supabase en memoria) ->
 * el ciclo se reanuda y Claude responde.
 *
 * Solo Anthropic, la sesion y la identidad estan simulados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, fakeClient, type FakeDb } from '../fixtures/fakeSupabase';

type Params = { messages: Array<{ role: string; content: unknown }> };

const COMMUNITY = '11111111-1111-4111-8111-111111111111';
const OTHER_COMMUNITY = '22222222-2222-4222-8222-222222222222';
const TICKET = '00000000-0000-4000-8000-000000000001';
const PROVIDER = '00000000-0000-4000-8000-000000000003';

const mocks = vi.hoisted(() => ({
    db: null as unknown as FakeDb,
    responses: [] as Array<Record<string, unknown>>,
    calls: [] as Params[],
    profile: null as Record<string, unknown> | null,
}));

vi.mock('@anthropic-ai/sdk', () => ({
    default: class {
        messages = {
            create: async (params: Params) => {
                mocks.calls.push(JSON.parse(JSON.stringify(params)));
                const next = mocks.responses.shift();
                if (!next) throw new Error('Respuesta de Claude no programada');
                return next;
            },
        };
    },
}));
vi.mock('@/lib/ai/budget', () => ({
    enforceAiBudget: async () => undefined,
    recordAiUsage: async () => undefined,
    estimateAiCostCents: () => 1,
    estimateTokensFromMessages: () => 10,
    estimateTokensFromText: () => 10,
}));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => fakeClient(mocks.db),
    supabaseAdmin: new Proxy({}, { get: (_target, property) => (fakeClient(mocks.db) as Record<string | symbol, unknown>)[property] }),
}));
vi.mock('@/lib/security/rateLimit', () => ({ enforceRateLimit: () => null }));
vi.mock('@/lib/server/agentIdentity', () => ({ getAuthenticatedAgentProfile: async () => mocks.profile }));
vi.mock('@/lib/coco/session-store', () => ({
    getSession: async () => null,
    saveSession: async () => undefined,
    deleteSession: async () => undefined,
}));
vi.mock('@/lib/coco/agent', () => ({ askCoCo: async () => { throw new Error('CoCo no deberia intervenir'); } }));

import { POST } from '@/app/api/agent-center/route';

function post(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/agent-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function toolUse(id: string, name: string, input: Record<string, unknown> = {}) {
    return { content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 20 } };
}

describe('ruta /api/agent-center con ciclo agentico', () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = 'test-key';
        mocks.calls = [];
        mocks.profile = { id: 'admin-1', name: 'Admin', email: 'admin@a.cl', role: 'admin', unit_id: null, community_id: COMMUNITY };
        mocks.db = createFakeDb({
            service_requests: [
                { id: TICKET, community_id: COMMUNITY, status: 'pending', provider_id: null, user_id: 'resident-1', description: 'Filtracion en bodega', created_at: new Date(Date.now() - 20 * 86_400_000).toISOString() },
            ],
            service_providers: [{ id: PROVIDER, community_id: COMMUNITY, name: 'Gasfiter Pro', verified: true }],
        });
    });

    afterEach(() => {
        delete process.env.ANTHROPIC_API_KEY;
    });

    it('lee, propone, espera confirmacion humana, ejecuta y continua el ciclo', async () => {
        mocks.responses = [
            toolUse('toolu_read', 'get_maintenance_backlog'),
            toolUse('toolu_write', 'update_maintenance_ticket', { ticketId: TICKET, providerId: PROVIDER }),
        ];

        const first = await (await POST(post({ message: 'asigna el ticket mas antiguo al gasfiter' }))).json();

        expect(first.status).toBe('awaiting_confirmation');
        expect(first.action).toMatchObject({ toolName: 'update_maintenance_ticket', requiresConfirmation: true });
        expect(first.action.proposalId).toBeTruthy();
        // La lectura del ciclo se muestra antes que la tarjeta.
        expect(first.steps[0].title).toBe('Backlog de mantencion revisado');
        // Nada se escribio todavia.
        expect(mocks.db.tables.service_requests[0].provider_id).toBeNull();
        const task = mocks.db.tables.agent_tasks[0];
        expect(task.status).toBe('waiting_human');
        expect((task.context as { loop: { pending: { proposalId: string } } }).loop.pending.proposalId).toBe(first.action.proposalId);

        mocks.responses = [{ content: [{ type: 'text', text: 'Listo, Gasfiter Pro quedo a cargo de la filtracion.' }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 } }];
        // El cliente no puede redirigir la confirmacion a otra tarea: se lee de la auditoria.
        const confirmed = await (await POST(post({ confirmed: true, action: { ...first.action, agentTaskId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' } }))).json();

        expect(confirmed.status).toBe('executed');
        expect(confirmed.reply).toContain('Gasfiter Pro');
        expect(confirmed.reply).toContain('Listo');
        expect(mocks.db.tables.service_requests[0].provider_id).toBe(PROVIDER);
        expect(mocks.db.tables.agent_tasks[0].status).toBe('completed');
        // Claude recibio el resultado de la escritura para continuar.
        const lastMessage = mocks.calls.at(-1)!.messages.at(-1)!.content as Array<{ tool_use_id: string; content: string }>;
        expect(lastMessage.find(block => block.tool_use_id === 'toolu_write')?.content).toContain('confirmadoPorHumano');
        expect(mocks.db.tables.agent_action_approvals?.[0]).toMatchObject({ decision: 'approved' });
    });

    it('tras confirmar, Claude puede proponer la siguiente escritura del mismo objetivo', async () => {
        mocks.responses = [toolUse('toolu_assign', 'update_maintenance_ticket', { ticketId: TICKET, providerId: PROVIDER })];
        const first = await (await POST(post({ message: 'asigna el ticket al gasfiter y crea una votacion para cambiar la bomba' }))).json();
        expect(first.status).toBe('awaiting_confirmation');

        mocks.responses = [toolUse('toolu_poll', 'create_poll', { title: 'Cambio de bomba', options: ['Si', 'No'], closesAt: '2099-01-01T12:00:00Z' })];
        const second = await (await POST(post({ confirmed: true, action: first.action }))).json();

        expect(second.status).toBe('awaiting_confirmation');
        expect(second.reply).toContain('Gasfiter Pro');
        expect(second.action).toMatchObject({ toolName: 'create_poll', requiresConfirmation: true });
        expect(second.action.proposalId).toBeTruthy();
        expect(second.action.proposalId).not.toBe(first.action.proposalId);
        const task = mocks.db.tables.agent_tasks[0];
        expect(task.status).toBe('waiting_human');
        expect((task.context as { loop: { pending: { proposalId: string } } }).loop.pending.proposalId).toBe(second.action.proposalId);
        expect(mocks.db.tables.polls ?? []).toHaveLength(0);
    });

    it('un administrador de otra comunidad no puede confirmar la tarjeta', async () => {
        mocks.responses = [toolUse('toolu_write', 'update_maintenance_ticket', { ticketId: TICKET, providerId: PROVIDER })];
        const first = await (await POST(post({ message: 'asigna el ticket al gasfiter' }))).json();
        expect(first.status).toBe('awaiting_confirmation');

        mocks.profile = { ...mocks.profile!, id: 'admin-2', community_id: OTHER_COMMUNITY };
        const response = await POST(post({ confirmed: true, action: first.action }));
        expect(response.status).toBe(500);
        expect((await response.json()).error).toContain('otra comunidad');
        expect(mocks.db.tables.service_requests[0].provider_id).toBeNull();
        expect(mocks.db.tables.agent_tasks[0].status).toBe('waiting_human');
    });
});
