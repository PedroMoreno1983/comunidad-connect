import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    upsert: vi.fn(),
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    supabaseAdmin: {
        from: () => ({ upsert: mocks.upsert }),
    },
}));

import { saveDeliveredTurn, saveSession } from '@/lib/coco/session-store';

const session = {
    conversation: [{ role: 'assistant' as const, content: 'hola' }],
    user_context: { channel: 'web' },
};

describe('saveDeliveredTurn', () => {
    beforeEach(() => {
        mocks.upsert.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('entrega la respuesta de texto aunque Supabase falle', async () => {
        mocks.upsert.mockResolvedValue({ error: { message: 'db down' } });
        await expect(saveDeliveredTurn('web:user:thread', session, false)).resolves.toBeUndefined();
    });

    it('no ofrece una confirmación que no quedó guardada', async () => {
        mocks.upsert.mockResolvedValue({ error: { message: 'db down' } });
        await expect(saveDeliveredTurn('web:user:thread', session, true)).rejects.toEqual({ message: 'db down' });
    });

    it('sigue fallando al guardar estado que el cliente no puede ver', async () => {
        mocks.upsert.mockResolvedValue({ error: { message: 'db down' } });
        await expect(saveSession('web:user:thread', session)).rejects.toEqual({ message: 'db down' });
    });

    it('guarda cuando la base responde bien', async () => {
        mocks.upsert.mockResolvedValue({ error: null });
        await expect(saveDeliveredTurn('web:user:thread', session, false)).resolves.toBeUndefined();
        expect(mocks.upsert).toHaveBeenCalledOnce();
    });
});
