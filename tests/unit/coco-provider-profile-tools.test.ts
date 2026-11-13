/**
 * CoCo y el perfil del maestro: valorar, revisar documentos y guardar una
 * imagen del chat. Quién puede hacer qué, y que no cruce de comunidad.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, fakeClient, type FakeDb } from '../fixtures/fakeSupabase';

vi.mock('server-only', () => ({}));
const state: { db: FakeDb } = { db: createFakeDb() };
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => fakeClient(state.db),
    supabaseAdmin: new Proxy({}, { get: (_target, key) => (fakeClient(state.db) as unknown as Record<string | symbol, unknown>)[key] }),
}));
const media = vi.hoisted(() => ({
    uploadProviderPhoto: vi.fn(async () => ({ url: 'https://x/p.jpg' })),
    uploadProviderDocument: vi.fn(async () => ({ id: 'd1', verdict: 'needs_review' })),
    reviewProviderDocument: vi.fn(async () => undefined),
    listProviderDocuments: vi.fn(async () => []),
}));
vi.mock('@/lib/services/providerMedia', () => ({ ...media, ProviderMediaError: class extends Error {} }));
const attachments = vi.hoisted(() => ({
    takeChatImage: vi.fn(async () => ({ file: new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }), path: 'chat/u/a.jpg' })),
    discardChatImage: vi.fn(async () => undefined),
}));
vi.mock('@/lib/coco/chatAttachments', () => attachments);
const reviews = vi.hoisted(() => ({ submitProviderReview: vi.fn(async () => ({ review: {}, providerName: 'Juan', verifiedService: true })) }));
vi.mock('@/lib/services/providerReviews', () => ({ ...reviews, ProviderReviewError: class extends Error {} }));
vi.setConfig({ testTimeout: 60_000 });

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const OWNER = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
    vi.clearAllMocks();
    state.db = createFakeDb({
        service_providers: [
            { id: 'p-local', name: 'Juan Pérez', community_id: A, user_id: OWNER },
            { id: 'p-red', name: 'Ana Red', community_id: null, user_id: null },
            { id: 'p-otra', name: 'Pedro Otro', community_id: B, user_id: null },
        ],
    });
});

describe('valorar', () => {
    it('valora a un maestro de la comunidad o de la red, no de otra comunidad', async () => {
        const { rateProviderForUser } = await import('@/lib/coco/providerProfileTools');
        expect(await rateProviderForUser('u1', A, { provider_name: 'juan', rating: '5', comment: 'Excelente' })).toMatchObject({ success: true });
        expect(reviews.submitProviderReview).toHaveBeenCalledWith('u1', { providerId: 'p-local', rating: 5, comment: 'Excelente' });
        expect(await rateProviderForUser('u1', A, { provider_name: 'Ana Red', rating: '4', comment: 'Bien' })).toMatchObject({ success: true });
        expect(await rateProviderForUser('u1', A, { provider_name: 'Pedro Otro', rating: '4', comment: 'Bien' })).toHaveProperty('error');
    });
});

describe('documentos (administración)', () => {
    it('revisa los de su comunidad; los de la red los revisa Convive', async () => {
        const { reviewProviderDocumentForAdmin } = await import('@/lib/coco/providerProfileTools');
        expect(await reviewProviderDocumentForAdmin(A, ADMIN, { provider_name: 'Juan Pérez', document_id: 'd1', decision: 'approve' })).toMatchObject({ success: true });
        expect(media.reviewProviderDocument).toHaveBeenCalledWith('p-local', 'd1', true, null, { id: ADMIN, role: 'admin' });
        const network = await reviewProviderDocumentForAdmin(A, ADMIN, { provider_name: 'Ana Red', document_id: 'd2', decision: 'approve' });
        expect(String((network as { error?: string }).error)).toMatch(/Convive/);
        expect(media.reviewProviderDocument).toHaveBeenCalledTimes(1);
    });
});

describe('guardar la imagen del chat', () => {
    it('el propio maestro y la administración de su comunidad pueden; otros no', async () => {
        const { saveProviderAttachment } = await import('@/lib/coco/providerProfileTools');
        const input = { attachment_id: 'x', provider_name: 'Juan Pérez', kind: 'work_photo', caption: 'Calefont' };
        expect(await saveProviderAttachment({ id: OWNER, role: 'resident', communityId: A }, input)).toMatchObject({ success: true });
        expect(await saveProviderAttachment({ id: ADMIN, role: 'admin', communityId: A }, input)).toMatchObject({ success: true });
        expect(await saveProviderAttachment({ id: 'vecino', role: 'resident', communityId: A }, input)).toHaveProperty('error');
        expect(await saveProviderAttachment({ id: ADMIN, role: 'admin', communityId: A }, { ...input, provider_name: 'Ana Red' })).toHaveProperty('error');
        expect(media.uploadProviderPhoto).toHaveBeenCalledTimes(2);
        expect(attachments.discardChatImage).toHaveBeenCalledTimes(2);
    });

    it('un documento queda pendiente y avisa el chequeo', async () => {
        const { saveProviderAttachment } = await import('@/lib/coco/providerProfileTools');
        const result = await saveProviderAttachment({ id: ADMIN, role: 'admin', communityId: A }, { attachment_id: 'x', provider_name: 'Juan Pérez', kind: 'identity' });
        expect(result).toMatchObject({ success: true });
        expect(String((result as { message: string }).message)).toMatch(/revisarlo a mano/);
        expect(media.uploadProviderDocument).toHaveBeenCalledWith('p-local', 'identity', expect.any(File), { id: ADMIN, role: 'admin' }, 'coco_chat');
    });

    it('sin la imagen adjunta no hace nada', async () => {
        attachments.takeChatImage.mockResolvedValueOnce(null as never);
        const { saveProviderAttachment } = await import('@/lib/coco/providerProfileTools');
        expect(await saveProviderAttachment({ id: OWNER, role: 'resident', communityId: A }, { attachment_id: 'x', provider_name: 'Juan Pérez', kind: 'profile_photo' })).toHaveProperty('error');
        expect(media.uploadProviderPhoto).not.toHaveBeenCalled();
    });
});

describe('roles y confirmación', () => {
    it('revisar documentos es solo de administración; todo lo que escribe pide confirmación', async () => {
        const { isToolAllowedForRole, MUTATING_TOOLS } = await import('@/lib/coco/tools');
        expect(isToolAllowedForRole('rate_provider', 'resident')).toBe(true);
        expect(isToolAllowedForRole('save_provider_attachment', 'resident')).toBe(true);
        for (const tool of ['list_provider_documents', 'review_provider_document']) {
            expect(isToolAllowedForRole(tool, 'admin')).toBe(true);
            expect(isToolAllowedForRole(tool, 'resident')).toBe(false);
            expect(isToolAllowedForRole(tool, 'concierge')).toBe(false);
        }
        for (const tool of ['rate_provider', 'review_provider_document', 'save_provider_attachment']) expect(MUTATING_TOOLS.has(tool)).toBe(true);
        expect(MUTATING_TOOLS.has('list_provider_documents')).toBe(false);
    });
});
