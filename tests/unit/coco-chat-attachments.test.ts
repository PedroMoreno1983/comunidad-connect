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

describe('adjunto en la sesión, no en el mensaje', () => {
    it('vale por un día', async () => {
        const { currentChatAttachment } = await import('@/lib/coco/chatAttachments');
        const state = { status: 'stored' as const, id: 'abc', at: '2026-11-14T00:00:00Z' };
        expect(currentChatAttachment(state, Date.parse('2026-11-14T20:00:00Z'))).toEqual(state);
        expect(currentChatAttachment(state, Date.parse('2026-11-15T01:00:00Z'))).toBeUndefined();
        expect(currentChatAttachment(undefined)).toBeUndefined();
    });
});

describe('navegación al perfil de un maestro', () => {
    it('acepta /services/provider/<uuid> y nada más dinámico', async () => {
        const { getSafeCoCoNavigation } = await import('@/lib/coco/navigation');
        expect(getSafeCoCoNavigation('/services/provider/11111111-1111-4111-8111-111111111111')).toBe('/services/provider/11111111-1111-4111-8111-111111111111');
        expect(getSafeCoCoNavigation('/services/provider/../../admin')).toBeUndefined();
        expect(getSafeCoCoNavigation('/services/provider/abc')).toBeUndefined();
    });
});

describe('consumo del adjunto', () => {
    it('solo una aprobación puede reclamar la imagen', async () => {
        const files = new Map<string, Blob>([['chat/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg', new Blob([new Uint8Array([1])])]]);
        storage.list.mockImplementation(async (path: string) => ({
            data: [...files.keys()].filter(key => key.startsWith(`${path}/`)).map(key => ({ name: key.slice(path.length + 1) })),
        }) as never);
        Object.assign(storage, {
            move: vi.fn(async (from: string, to: string) => {
                const blob = files.get(from);
                if (!blob) return { error: new Error('no existe') };
                files.delete(from);
                files.set(to, blob);
                return { error: null };
            }),
            download: vi.fn(async (path: string) => ({ data: files.get(path) ?? null, error: files.has(path) ? null : new Error('no') })),
        });
        const { takeChatImage } = await import('@/lib/coco/chatAttachments');
        const user = '11111111-1111-4111-8111-111111111111';
        const id = '22222222-2222-4222-8222-222222222222';
        const [first, second] = await Promise.all([takeChatImage(user, id), takeChatImage(user, id)]);
        expect([first, second].filter(Boolean)).toHaveLength(1);
        expect(await takeChatImage(user, id)).toBeNull();
    });

    it('la limpieza recorre más de una página', async () => {
        const many = Array.from({ length: 1000 }, (_, index) => ({ name: `f${index}.jpg`, created_at: '2026-11-01T00:00:00Z' }));
        storage.list.mockImplementation(async (path: string, options?: { offset?: number }) => {
            if (path === 'chat') return { data: options?.offset ? [] : [{ name: '11111111-1111-4111-8111-111111111111' }] };
            return { data: options?.offset ? [{ name: 'ultimo.jpg', created_at: '2026-11-01T00:00:00Z' }] : many };
        });
        const { purgeStaleChatAttachments } = await import('@/lib/coco/chatAttachments');
        expect(await purgeStaleChatAttachments(now)).toEqual({ removed: 1001 });
    });
});

describe('limpieza que falla', () => {
    it('si Storage no borra, lo informa como fallo y no como borrado', async () => {
        storage.list.mockImplementation(async (path: string) => (path === 'chat'
            ? { data: [{ name: '11111111-1111-4111-8111-111111111111' }] }
            : { data: [{ name: 'viejo.jpg', created_at: '2026-11-01T00:00:00Z' }] }) as never);
        storage.remove.mockResolvedValueOnce({ data: null, error: new Error('sin permiso') } as never);
        const { purgeStaleChatAttachments } = await import('@/lib/coco/chatAttachments');
        expect(await purgeStaleChatAttachments(now)).toEqual({ removed: 0, failed: 1 });
    });
});

describe('listado fallido', () => {
    it('la limpieza falla si Storage no puede listar', async () => {
        storage.list.mockResolvedValueOnce({ data: null, error: new Error('sin permiso') } as never);
        const { purgeStaleChatAttachments } = await import('@/lib/coco/chatAttachments');
        await expect(purgeStaleChatAttachments(now)).rejects.toThrow(/listar/);
    });
});
