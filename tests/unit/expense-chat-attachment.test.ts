/**
 * 18-11-2026: la administración manda por WhatsApp (o el chat web) la foto de
 * una boleta de bencina y CoCo la carga como egreso. La foto tiene que quedar
 * como respaldo, igual que si se subiera en la pantalla de Egresos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const COMMUNITY = '07212377-00de-4153-aa98-ab036661b662';
const USER = '64d3e619-2a9f-41b3-aee0-d81632ba77db';
const ATTACHMENT = '3f1c2b9e-1111-4222-8333-944455556666';

const state = vi.hoisted(() => ({
    duplicate: null as null | { id: string; month: string; label: string },
    uploads: [] as string[],
    removed: [] as string[],
    addInputs: [] as Array<Record<string, unknown>>,
    addFails: false,
    image: null as null | { file: File; path: string; originalPath: string },
    released: [] as string[],
    discarded: [] as string[],
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({
        from: () => {
            const query = { select: () => query, eq: () => query, limit: () => query, maybeSingle: async () => ({ data: state.duplicate, error: null }) };
            return query;
        },
        storage: { from: () => ({
            upload: async (path: string) => { state.uploads.push(path); return { error: null }; },
            remove: async (paths: string[]) => { state.removed.push(...paths); return { error: null }; },
        }) },
    }),
}));

vi.mock('@/lib/coco/chatAttachments', () => ({
    takeChatImage: vi.fn(async () => state.image),
    releaseChatImage: vi.fn(async (claimed: string) => { state.released.push(claimed); }),
    discardChatImage: vi.fn(async (path: string) => { state.discarded.push(path); }),
}));

vi.mock('@/lib/finance/billingService', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/finance/billingService')>();
    return {
        ...actual,
        addCommunityExpense: vi.fn(async (_community: string, _user: string, input: Record<string, unknown>) => {
            state.addInputs.push(input);
            if (state.addFails) throw new actual.BillingError('issued', 'El mes ya está emitido.', 409);
            return { id: 'exp-1', label: input.label, amount: input.amount, month: input.month };
        }),
    };
});

import { addCommunityExpenseWithChatImage } from '@/lib/finance/expenseChatAttachment';

const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], `${ATTACHMENT}.jpg`, { type: 'image/jpeg' });
const input = { month: '2026-11', label: 'Bencina generador', amount: 45000, category: 'other' };

beforeEach(() => {
    Object.assign(state, { duplicate: null, uploads: [], removed: [], addInputs: [], addFails: false, released: [], discarded: [],
        image: { file: jpeg(), path: `u/claimed-${ATTACHMENT}.jpg`, originalPath: `u/${ATTACHMENT}.jpg` } });
});

describe('egreso con la foto de la boleta como respaldo', () => {
    it('guarda la foto en el bucket de respaldos con su hash y borra la del chat', async () => {
        await addCommunityExpenseWithChatImage(COMMUNITY, USER, ATTACHMENT, input);
        expect(state.uploads).toHaveLength(1);
        expect(state.uploads[0]).toMatch(new RegExp(`^${COMMUNITY}/[0-9a-f-]+\\.jpg$`));
        expect(state.addInputs[0]).toMatchObject({ label: 'Bencina generador', documentPath: state.uploads[0] });
        expect(String(state.addInputs[0].documentSha256)).toMatch(/^[0-9a-f]{64}$/);
        expect(state.discarded).toEqual([`u/claimed-${ATTACHMENT}.jpg`]);
    });

    it('la misma foto no se carga dos veces', async () => {
        state.duplicate = { id: 'exp-0', month: '2026-11', label: 'Bencina generador' };
        await expect(addCommunityExpenseWithChatImage(COMMUNITY, USER, ATTACHMENT, input)).rejects.toThrow('ya es el respaldo');
        expect(state.uploads).toHaveLength(0);
        expect(state.addInputs).toHaveLength(0);
    });

    it('si el egreso falla, se borra el respaldo y la foto vuelve a estar disponible', async () => {
        state.addFails = true;
        await expect(addCommunityExpenseWithChatImage(COMMUNITY, USER, ATTACHMENT, input)).rejects.toThrow('emitido');
        expect(state.removed).toEqual(state.uploads);
        expect(state.released).toEqual([`u/claimed-${ATTACHMENT}.jpg`]);
        expect(state.discarded).toHaveLength(0);
    });

    it('sin la foto no carga nada y lo dice', async () => {
        state.image = null;
        await expect(addCommunityExpenseWithChatImage(COMMUNITY, USER, ATTACHMENT, input)).rejects.toThrow('No encontré la foto');
        expect(state.addInputs).toHaveLength(0);
    });
});
