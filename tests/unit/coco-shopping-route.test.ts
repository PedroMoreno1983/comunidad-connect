import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
    session: null as { conversation: { role: 'user' | 'assistant'; content: string | object[] }[]; user_context: Record<string, string> } | null,
    askCoCo: vi.fn(),
}));

vi.mock('@/lib/coco/session-store', () => ({
    getSession: vi.fn(async () => state.session),
    saveDeliveredTurn: vi.fn(async (_key: string, session: typeof state.session) => { state.session = session; }),
    checkRateLimit: vi.fn(() => true),
}));
vi.mock('@/lib/security/rateLimit', () => ({ enforceRateLimit: vi.fn(() => null) }));
vi.mock('@/lib/server/agentIdentity', () => ({
    getAuthenticatedAgentProfile: vi.fn(async () => ({
        id: '8bca3842-a85c-4746-89d4-d2a3d45c3b9e',
        name: 'Andrea', role: 'resident', community_id: '0ec125f4-770a-42ec-9327-6a694af69787', unit_id: 'unit-1',
    })),
}));
vi.mock('@/lib/coco/agent', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/coco/agent')>();
    return { ...actual, askCoCo: state.askCoCo };
});

import { POST } from '@/app/api/coco/route';

describe('CoCo guarda una lista desde el chat', () => {
    beforeEach(() => {
        state.session = {
            conversation: [{ role: 'assistant', content: '¿Quieres buscar arroz en el Supermercado a domicilio?' }],
            user_context: { community_id: '0ec125f4-770a-42ec-9327-6a694af69787', user_id: '8bca3842-a85c-4746-89d4-d2a3d45c3b9e', role: 'resident' },
        };
        state.askCoCo.mockReset();
        state.askCoCo.mockResolvedValue({ reply: 'Guardé 5 productos.', updatedHistory: [] });
    });

    it('ofrece confirmar los cinco productos y reanuda la acción aprobada', async () => {
        const first = await POST(new NextRequest('http://localhost/api/coco', {
            method: 'POST', body: JSON.stringify({ message: 'arroz, pan, lechuga, garbanzos, leche', currentPage: '/chat' }),
        }));
        expect(first.status).toBe(200);
        const proposal = await first.json();
        expect(proposal.pendingActions).toHaveLength(1);
        expect(proposal.pendingActions[0].name).toBe('save_shopping_list');
        expect(proposal.pendingActions[0].input.body).toBe('arroz, pan, lechuga, garbanzos, leche');
        expect(state.askCoCo).not.toHaveBeenCalled();

        const second = await POST(new NextRequest('http://localhost/api/coco', {
            method: 'POST', body: JSON.stringify({ resolutions: { [proposal.pendingActions[0].toolUseId]: 'approved' } }),
        }));
        expect(second.status).toBe(200);
        expect(state.askCoCo).toHaveBeenCalledWith(
            '', expect.objectContaining({ conversation: expect.arrayContaining([
                expect.objectContaining({ role: 'assistant', content: expect.arrayContaining([
                    expect.objectContaining({ type: 'tool_use', name: 'save_shopping_list' }),
                ]) }),
            ]) }), expect.any(Object), expect.objectContaining({ resolutions: { [proposal.pendingActions[0].toolUseId]: 'approved' } }),
        );
    });
});
