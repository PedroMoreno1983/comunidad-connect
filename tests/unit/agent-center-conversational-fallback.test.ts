import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ACTION_SUMMARY_MAX, CONVERSATIONAL_SUMMARY_MAX, summaryLimitFor } from '@/lib/agent-center/domain';
import type { AgentAction, AgentProfile } from '@/lib/agent-center/domain';

// askCoCo se mockea para no llamar a la API real: probamos el wiring, no el LLM.
const askCoCoMock = vi.fn();
vi.mock('@/lib/coco/agent', () => ({
    askCoCo: (...args: unknown[]) => askCoCoMock(...args),
}));

// La sesion tambien se mockea: probamos que la memoria se persista de forma
// segura, sin tocar Supabase.
const getSessionMock = vi.fn();
const saveSessionMock = vi.fn();
vi.mock('@/lib/coco/session-store', () => ({
    getSession: (...args: unknown[]) => getSessionMock(...args),
    saveSession: (...args: unknown[]) => saveSessionMock(...args),
}));

import { upgradeClarificationWithCoCo, conversationalCoCoReply, buildCoCoAction, resumeCoCoAction, rejectCoCoAction } from '@/lib/agent-center/conversationalFallback';

const profile: AgentProfile = {
    id: 'user-1',
    name: 'Ana Admin',
    email: 'ana@demo.cl',
    role: 'admin',
    unit_id: null,
    community_id: 'community-1',
};

function clarifyAction(): AgentAction {
    return {
        agentKey: 'finance',
        toolName: 'clarify_intent',
        args: { requestedText: 'hola, que puedes hacer?' },
        requiresConfirmation: false,
        title: 'Necesito mas detalle',
        summary: 'Necesito que aclares que deseas consultar o ejecutar. No realice ningun cambio.',
        targetHref: '/agent-center',
    };
}

function resetMocks() {
    askCoCoMock.mockReset();
    getSessionMock.mockReset();
    saveSessionMock.mockReset();
    getSessionMock.mockResolvedValue(null);
    saveSessionMock.mockResolvedValue(undefined);
}

describe('upgradeClarificationWithCoCo', () => {
    beforeEach(resetMocks);

    it('NO sobreescribe la tarjeta curada de capacidades (args.capabilities) ni llama a CoCo', async () => {
        const capabilities: AgentAction = {
            agentKey: 'community',
            toolName: 'clarify_intent',
            args: { requestedText: 'hola', capabilities: true },
            requiresConfirmation: false,
            title: 'Esto es lo que puedo preparar para ti',
            summary: 'lista curada...',
            targetHref: '/agent-center',
        };
        const result = await upgradeClarificationWithCoCo('hola', profile, capabilities);
        expect(result).toEqual(capabilities);
        expect(askCoCoMock).not.toHaveBeenCalled();
    });

    it('reemplaza el stonewall de clarify_intent por la respuesta real de CoCo', async () => {
        askCoCoMock.mockResolvedValue({ reply: 'Puedo revisar morosidad, preparar cobranzas y emitir comunicados.', updatedHistory: [] });
        const result = await upgradeClarificationWithCoCo('hola, que puedes hacer?', profile, clarifyAction());
        expect(result.toolName).toBe('clarify_intent');
        expect(result.summary).toBe('Puedo revisar morosidad, preparar cobranzas y emitir comunicados.');
        expect(result.title).toBe('CoCo');
        expect(askCoCoMock).toHaveBeenCalledTimes(1);
    });

    it('conserva la clarificacion original si CoCo devuelve vacio', async () => {
        askCoCoMock.mockResolvedValue({ reply: '   ', updatedHistory: [] });
        const original = clarifyAction();
        const result = await upgradeClarificationWithCoCo('hola', profile, original);
        expect(result.summary).toBe(original.summary);
        expect(result.title).toBe(original.title);
    });

    it('conserva la clarificacion original si askCoCo lanza (red de seguridad)', async () => {
        askCoCoMock.mockRejectedValue(new Error('sin ANTHROPIC_API_KEY'));
        const original = clarifyAction();
        const result = await upgradeClarificationWithCoCo('hola', profile, original);
        expect(result.summary).toBe(original.summary);
        expect(result).toEqual(original);
    });

    it('NO toca acciones reconocidas: no invoca a CoCo y pasa la accion intacta', async () => {
        const announcement: AgentAction = {
            agentKey: 'community',
            toolName: 'create_announcement',
            args: { title: 'Corte de agua', content: 'Manana 9-12h.' },
            requiresConfirmation: true,
            title: 'Publicar comunicado',
            summary: 'Se publicara en el feed tras tu aprobacion.',
            targetHref: '/comunicaciones',
        };
        const result = await upgradeClarificationWithCoCo('publica un comunicado de corte de agua', profile, announcement);
        expect(result).toEqual(announcement);
        expect(askCoCoMock).not.toHaveBeenCalled();
    });
});

describe('conversationalCoCoReply', () => {
    beforeEach(resetMocks);

    it('carga la sesion del Agent Center, mapea el perfil y devuelve el reply', async () => {
        const priorSession = { conversation: [{ role: 'user', content: 'antes' }], user_context: {} };
        getSessionMock.mockResolvedValue(priorSession);
        askCoCoMock.mockResolvedValue({ reply: 'Hola, soy CoCo.', updatedHistory: [{ role: 'assistant', content: 'Hola' }] });
        const reply = await conversationalCoCoReply('hola', profile);
        expect(reply).toBe('Hola, soy CoCo.');
        const [message, session, ctx] = askCoCoMock.mock.calls[0];
        expect(message).toBe('hola');
        expect(session).toBe(priorSession); // usa memoria: la sesion cargada
        expect(ctx).toMatchObject({ user_id: 'user-1', role: 'admin', community_id: 'community-1', currentPage: '/agent-center' });
        // clave de sesion propia del Agent Center, separada del chat
        expect(getSessionMock).toHaveBeenCalledWith('agentcoco:web:user-1');
    });

    it('persiste memoria en turnos LIMPIOS (sin acciones pendientes)', async () => {
        askCoCoMock.mockResolvedValue({ reply: 'ok', updatedHistory: [{ role: 'assistant', content: 'ok' }] });
        await conversationalCoCoReply('cuenta cuantas unidades hay', profile);
        expect(saveSessionMock).toHaveBeenCalledTimes(1);
        expect(saveSessionMock).toHaveBeenCalledWith('agentcoco:web:user-1', expect.objectContaining({
            conversation: [{ role: 'assistant', content: 'ok' }],
        }));
    });

    it('persiste tambien cuando hay accion pendiente (necesario para poder reanudar y ejecutar)', async () => {
        askCoCoMock.mockResolvedValue({
            reply: 'Confirma para emitir el cobro.',
            updatedHistory: [{ role: 'assistant', content: 'tool_use...' }],
            pendingActions: [{ toolUseId: 't1', name: 'create_expense', input: {}, title: 'Cobro', summary: '...' }],
        });
        const reply = await conversationalCoCoReply('emite un cobro', profile);
        expect(reply).toBe('Confirma para emitir el cobro.');
        expect(saveSessionMock).toHaveBeenCalledTimes(1);
    });

    it('devuelve cadena vacia ante un error en vez de propagarlo', async () => {
        askCoCoMock.mockRejectedValue(new Error('boom'));
        const reply = await conversationalCoCoReply('hola', profile);
        expect(reply).toBe('');
    });
});

describe('puente coco_action (Fase 3)', () => {
    beforeEach(resetMocks);

    const pending = [{ toolUseId: 'tool_1', name: 'create_expense', input: { amount: 50000 }, title: 'Emitir cobro depto 504', summary: '$50.000' }];

    it('upgradeClarificationWithCoCo devuelve una coco_action aprobable cuando CoCo propone una mutacion', async () => {
        askCoCoMock.mockResolvedValue({
            reply: 'Voy a emitir el cobro, confirma.',
            updatedHistory: [{ role: 'assistant', content: 'tool_use' }],
            pendingActions: pending,
        });
        const result = await upgradeClarificationWithCoCo('cobra $50.000 al depto 504', profile, clarifyAction());
        expect(result.toolName).toBe('coco_action');
        expect(result.requiresConfirmation).toBe(true);
        expect(result.title).toBe('Emitir cobro depto 504');
        expect((result.args.pending as unknown[])).toHaveLength(1);
        // La clave de sesion NO viaja en los args (se deriva del perfil al ejecutar).
        expect(result.args.sessionKey).toBeUndefined();
    });

    it('buildCoCoAction resume el reply + los pasos en el summary', () => {
        const action = buildCoCoAction({ reply: 'Listo para emitir.', pending });
        expect(action.summary).toContain('Listo para emitir.');
        expect(action.summary).toContain('Emitir cobro depto 504');
    });

    it('emite el summary en markdown, con los pasos separados del reply', () => {
        const action = buildCoCoAction({ reply: 'Listo para emitir.', pending });
        // La tarjeta de aprobacion renderiza markdown: los pasos van como lista y
        // separados por una linea en blanco, o se leen como una frase corrida.
        expect(action.summary).toContain('- **Emitir cobro depto 504**');
        expect(action.summary).toContain('Listo para emitir.\n\n-');
    });

    it('el summary de coco_action no se recorta como una etiqueta de accion', () => {
        // Regresion: normalizeAction capaba todo summary a 280 caracteres, y el de
        // coco_action lleva la explicacion completa de CoCo, no una etiqueta.
        expect(summaryLimitFor('coco_action')).toBe(CONVERSATIONAL_SUMMARY_MAX);
        expect(summaryLimitFor('coco_action')).toBeGreaterThan(ACTION_SUMMARY_MAX);
    });

    it('resumeCoCoAction reanuda la sesion (derivada del perfil) con resolutions=approved y devuelve el resultado', async () => {
        getSessionMock.mockResolvedValue({ conversation: [{ role: 'assistant', content: 'tool_use' }], user_context: {} });
        askCoCoMock.mockResolvedValue({ reply: 'Cobro emitido.', updatedHistory: [{ role: 'assistant', content: 'ok' }] });
        const action: AgentAction = {
            agentKey: 'community', toolName: 'coco_action',
            args: { pending, reply: 'x' }, requiresConfirmation: true,
            title: 'Emitir cobro', summary: '...', targetHref: '/agent-center',
        };
        const result = await resumeCoCoAction(action, profile);
        expect(result.message).toBe('Cobro emitido.');
        expect(result.entityType).toBe('coco_action');
        expect(getSessionMock).toHaveBeenCalledWith('agentcoco:web:user-1'); // derivada del perfil
        const [msg, , , options] = askCoCoMock.mock.calls[0];
        expect(msg).toBe('');
        expect(options).toEqual({ resolutions: { tool_1: 'approved' } });
    });

    it('resumeCoCoAction lanza si la sesion expiro', async () => {
        getSessionMock.mockResolvedValue(null);
        const action: AgentAction = {
            agentKey: 'community', toolName: 'coco_action',
            args: { pending, reply: 'x' }, requiresConfirmation: true,
            title: 'Emitir cobro', summary: '...', targetHref: '/agent-center',
        };
        await expect(resumeCoCoAction(action, profile)).rejects.toThrow(/expiro|resuelta/i);
    });

    it('rejectCoCoAction reanuda con resolutions=rejected (best-effort, no lanza)', async () => {
        getSessionMock.mockResolvedValue({ conversation: [{ role: 'assistant', content: 'tool_use' }], user_context: {} });
        askCoCoMock.mockResolvedValue({ reply: 'Cancelado.', updatedHistory: [] });
        const action: AgentAction = {
            agentKey: 'community', toolName: 'coco_action',
            args: { pending, reply: 'x' }, requiresConfirmation: true,
            title: 'Emitir cobro', summary: '...', targetHref: '/agent-center',
        };
        await rejectCoCoAction(action, profile);
        const [, , , options] = askCoCoMock.mock.calls[0];
        expect(options).toEqual({ resolutions: { tool_1: 'rejected' } });
    });
});
