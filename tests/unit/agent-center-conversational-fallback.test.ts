import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AgentAction, AgentProfile } from '@/lib/agent-center/domain';

// askCoCo se mockea para no llamar a la API real: probamos el wiring, no el LLM.
const askCoCoMock = vi.fn();
vi.mock('@/lib/coco/agent', () => ({
    askCoCo: (...args: unknown[]) => askCoCoMock(...args),
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

describe('upgradeClarificationWithCoCo', () => {
    beforeEach(() => {
        askCoCoMock.mockReset();
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
    beforeEach(() => {
        askCoCoMock.mockReset();
    });

    it('mapea AgentProfile a CoCoUserContext y llama sin sesion', async () => {
        askCoCoMock.mockResolvedValue({ reply: 'Hola, soy CoCo.', updatedHistory: [] });
        const reply = await conversationalCoCoReply('hola', profile);
        expect(reply).toBe('Hola, soy CoCo.');
        const [message, session, ctx] = askCoCoMock.mock.calls[0];
        expect(message).toBe('hola');
        expect(session).toBeNull();
        expect(ctx).toMatchObject({ user_id: 'user-1', role: 'admin', community_id: 'community-1', currentPage: '/agent-center' });
    });

    it('devuelve cadena vacia ante un error en vez de propagarlo', async () => {
        askCoCoMock.mockRejectedValue(new Error('boom'));
        const reply = await conversationalCoCoReply('hola', profile);
        expect(reply).toBe('');
    });
});
