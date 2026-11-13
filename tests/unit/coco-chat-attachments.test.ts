/**
 * Imágenes del chat para el perfil de un maestro: un GIF no se guarda y CoCo
 * lo sabe; la limpieza borra solo lo de más de un día.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const removed: string[][] = [];
const now = Date.parse('2026-11-14T12:00:00Z');
const storage = {
    list: vi.fn(async (path: string) => {
        if (path === 'chat') return { data: [{ name: '11111111-1111-4111-8111-111111111111' }, { name: 'no-es-uuid' }] };
        return { data: [
            { name: 'viejo.jpg', created_at: '2026-11-12T12:00:00Z' },
            { name: 'nuevo.jpg', created_at: '2026-11-14T11:00:00Z' },
        ] };
    }),
    remove: vi.fn(async (paths: string[]) => { removed.push(paths); return { data: null, error: null }; }),
    upload: vi.fn(),
};
vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => ({ storage: { from: () => storage } }) }));

describe('adjuntos del chat', () => {
    it('un GIF no se guarda y la nota se lo dice a CoCo', async () => {
        const { attachmentNote, stashChatImage } = await import('@/lib/coco/chatAttachments');
        const stash = await stashChatImage('11111111-1111-4111-8111-111111111111', { mediaType: 'image/gif', data: 'R0lG' });
        expect(stash).toEqual({ status: 'unsupported' });
        expect(storage.upload).not.toHaveBeenCalled();
        expect(attachmentNote(stash)).toMatch(/GIF/);
        expect(attachmentNote({ status: 'stored', id: 'abc' })).toMatch(/adjunto_id=abc/);
    });

    it('la limpieza programada borra lo de más de un día', async () => {
        const { purgeStaleChatAttachments } = await import('@/lib/coco/chatAttachments');
        expect(await purgeStaleChatAttachments(now)).toEqual({ removed: 1 });
        expect(removed).toEqual([['chat/11111111-1111-4111-8111-111111111111/viejo.jpg']]);
    });
});
