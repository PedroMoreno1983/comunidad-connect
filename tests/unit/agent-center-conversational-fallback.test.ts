import { describe, expect, it, vi, beforeEach } from 'vitest';
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

import { upgradeClarificationWithCoCo, conversationalCoCoReply } from '@/lib/agent-center/conversationalFallback';

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

    it('responde con CoCo las consultas de snapshot e investigacion, no solo clarify_intent', async () => {
        askCoCoMock.mockResolvedValue({ reply: 'Hay 4 unidades con mas de 2 cuotas vencidas.', updatedHistory: [] });
        const snapshot: AgentAction = {
            agentKey: 'finance',
            toolName: 'get_community_snapshot',
            args: { focus: 'finance' },
            requiresConfirmation: false,
            title: 'Indicadores de comunidad',
            summary: 'CoCo revisará indicadores operacionales reales.',
            targetHref: '/admin',
        };
        const result = await upgradeClarificationWithCoCo(
            'como viene la morosidad y quienes deben mas de 2 cuotas?',
            profile,
            snapshot,
        );
        expect(askCoCoMock).toHaveBeenCalledTimes(1);
        expect(result.toolName).toBe('clarify_intent');
        expect(result.title).toBe('CoCo');
        expect(result.summary).toBe('Hay 4 unidades con mas de 2 cuotas vencidas.');
        expect(result.requiresConfirmation).toBe(false);
    });

    it('responde con CoCo las investigaciones de comunidad (answer_community_question)', async () => {
        askCoCoMock.mockResolvedValue({ reply: 'El quincho esta reservado el sabado 10-14.', updatedHistory: [] });
        const research: AgentAction = {
            agentKey: 'community',
            toolName: 'answer_community_question',
            args: { question: 'quien reservo el quincho?' },
            requiresConfirmation: false,
            title: 'Investigar comunidad',
            summary: 'CoCo investigara en las fuentes del edificio.',
            targetHref: '/agent-center',
        };
        const result = await upgradeClarificationWithCoCo('quien reservo el quincho?', profile, research);
        expect(askCoCoMock).toHaveBeenCalledTimes(1);
        expect(result.toolName).toBe('clarify_intent');
        expect(result.summary).toBe('El quincho esta reservado el sabado 10-14.');
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

    it('NO persiste cuando CoCo deja una accion pendiente (evita bloquear el proximo mensaje)', async () => {
        askCoCoMock.mockResolvedValue({
            reply: 'Confirma para emitir el cobro.',
            updatedHistory: [{ role: 'assistant', content: 'tool_use...' }],
            pendingActions: [{ toolUseId: 't1', name: 'create_expense', input: {}, title: 'Cobro', summary: '...' }],
        });
        const reply = await conversationalCoCoReply('emite un cobro', profile);
        expect(reply).toBe('Confirma para emitir el cobro.');
        expect(saveSessionMock).not.toHaveBeenCalled();
    });

    it('devuelve cadena vacia ante un error en vez de propagarlo', async () => {
        askCoCoMock.mockRejectedValue(new Error('boom'));
        const reply = await conversationalCoCoReply('hola', profile);
        expect(reply).toBe('');
    });
});
