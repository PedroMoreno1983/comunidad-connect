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
    listProviderDocuments: vi.fn(async () => [{ id: 'd1', kind: 'identity', fileName: 'c.jpg', status: 'pending', createdAt: '2026-11-14T10:00:00Z', reviewedAt: null, reviewNote: null }]),
}));
vi.mock('@/lib/services/providerMedia', () => ({ ...media, ProviderMediaError: class extends Error {} }));
const attachments = vi.hoisted(() => ({
    takeChatImage: vi.fn(async () => ({ file: new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }), path: 'chat/u/claimed-a.jpg', originalPath: 'chat/u/a.jpg' })),
    discardChatImage: vi.fn(async () => undefined),
    releaseChatImage: vi.fn(async () => undefined),
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
            { id: 'p-local', name: 'Juan Pérez', community_id: A, user_id: OWNER, category: 'plumbing' },
            { id: 'p-red', name: 'Ana Red', community_id: null, user_id: null },
            { id: 'p-otra', name: 'Pedro Otro', community_id: B, user_id: null },
        ],
    });
});

describe('valorar', () => {
    it('valora a un maestro de la comunidad o de la red, no de otra comunidad', async () => {
        const { rateProviderForUser } = await import('@/lib/coco/providerProfileTools');
        expect(await rateProviderForUser('u1', A, { provider_name: 'juan', rating: '5', comment: 'Excelente' })).toMatchObject({ success: true });
        expect(reviews.submitProviderReview).toHaveBeenCalledWith('u1', { providerId: 'p-local', rating: 5, comment: 'Excelente', serviceType: 'plumbing' });
        expect(await rateProviderForUser('u1', A, { provider_name: 'Ana Red', rating: '4', comment: 'Bien' })).toMatchObject({ success: true });
        expect(await rateProviderForUser('u1', A, { provider_name: 'Pedro Otro', rating: '4', comment: 'Bien' })).toHaveProperty('error');
    });
});

describe('documentos (administración)', () => {
    it('revisa los de su comunidad; los de la red los revisa Convive', async () => {
        const { reviewProviderDocumentForAdmin } = await import('@/lib/coco/providerProfileTools');
        const doc = { document_id: 'd1', document_kind: 'identity', uploaded_at: '2026-11-14 07:00' };
        expect(await reviewProviderDocumentForAdmin(A, ADMIN, { provider_name: 'Juan Pérez', ...doc, document_kind: 'background_certificate', decision: 'approve' })).toHaveProperty('error');
        expect(await reviewProviderDocumentForAdmin(A, ADMIN, { provider_name: 'Juan Pérez', ...doc, uploaded_at: '2026-11-14 08:00', decision: 'approve' })).toHaveProperty('error');
        expect(media.reviewProviderDocument).not.toHaveBeenCalled();
        expect(await reviewProviderDocumentForAdmin(A, ADMIN, { provider_name: 'Juan Pérez', ...doc, decision: 'approve' })).toMatchObject({ success: true });
        expect(media.reviewProviderDocument).toHaveBeenCalledWith('p-local', 'd1', true, null, { id: ADMIN, role: 'admin' });
        const network = await reviewProviderDocumentForAdmin(A, ADMIN, { provider_name: 'Ana Red', ...doc, decision: 'approve' });
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

describe('lo confirmado es lo que se ejecuta', () => {
    it('un ID de otro maestro que el nombre confirmado no hace nada', async () => {
        const { rateProviderForUser, saveProviderAttachment } = await import('@/lib/coco/providerProfileTools');
        expect(await rateProviderForUser('u1', A, { provider_id: 'p-red', provider_name: 'Juan', rating: '5', comment: 'x' })).toHaveProperty('error');
        expect(await saveProviderAttachment({ id: ADMIN, role: 'admin', communityId: A }, { attachment_id: 'x', provider_id: 'p-local', kind: 'profile_photo' })).toHaveProperty('error');
        expect(reviews.submitProviderReview).not.toHaveBeenCalled();
        expect(media.uploadProviderPhoto).not.toHaveBeenCalled();
    });
});

describe('documentos en el chat', () => {
    it('el chequeo llega sin RUT, nombre ni folio', async () => {
        const { redactedCheck } = await import('@/lib/coco/providerProfileTools');
        const check = redactedCheck('background_certificate', {
            verdict: 'looks_ok', findings: ['RUT 12.345.678-5 válido.'],
            extracted: { documentType: 'background_certificate', fullName: 'JUAN PÉREZ SOTO', rut: '12.345.678-5', issueDate: '2026-11-01', expiryDate: null, hasRecords: false, verificationCode: 'FOLIO-99' },
        }, 'Juan Pérez');
        expect(check).toMatchObject({ verdict: 'looks_ok', rut_valid: true, name_matches_profile: true, no_records: true });
        const serialized = JSON.stringify(check);
        for (const secret of ['12.345.678', 'SOTO', 'FOLIO-99']) expect(serialized).not.toContain(secret);
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

describe('fecha civil de Chile', () => {
    it('una cédula que vence hoy en Chile no aparece vencida aunque en UTC ya sea mañana', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-15T02:00:00Z')); // 23:00 del 14 en Chile
        const { redactedCheck } = await import('@/lib/coco/providerProfileTools');
        const check = redactedCheck('identity', {
            verdict: 'looks_ok', findings: [],
            extracted: { documentType: 'identity', fullName: 'Juan Pérez', rut: '11111111-1', issueDate: null, expiryDate: '2026-11-14', hasRecords: null, verificationCode: null },
        }, 'Juan Pérez');
        expect(check).toMatchObject({ expired: false });
        vi.useRealTimers();
    });
});

describe('ronda 6', () => {
    it('"Juan" no confirma a "Juana": el nombre se compara por palabras completas', async () => {
        state.db.tables.service_providers.push({ id: 'p-juana', name: 'Juana Soto', community_id: A, user_id: null, category: 'cleaning' });
        const { rateProviderForUser } = await import('@/lib/coco/providerProfileTools');
        expect(await rateProviderForUser('u1', A, { provider_id: 'p-juana', provider_name: 'Juan', rating: '5', comment: 'x' })).toHaveProperty('error');
        expect(await rateProviderForUser('u1', A, { provider_id: 'p-juana', provider_name: 'juana', rating: '5', comment: 'x' })).toMatchObject({ success: true });
    });

    it('entre homónimos se elige por oficio y alcance', async () => {
        state.db.tables.service_providers.push({ id: 'p-juan-red', name: 'Juan Pérez', community_id: null, user_id: null, category: 'electrical' });
        const { rateProviderForUser } = await import('@/lib/coco/providerProfileTools');
        const ambiguous = await rateProviderForUser('u1', A, { provider_name: 'Juan Pérez', rating: '5', comment: 'x' }) as { candidates?: { provider_trade: string; provider_scope: string }[] };
        expect(ambiguous.candidates?.map(item => `${item.provider_trade}/${item.provider_scope}`).sort()).toEqual(['electrical/network', 'plumbing/community']);
        expect(await rateProviderForUser('u1', A, { provider_name: 'Juan Pérez', provider_trade: 'electrical', provider_scope: 'network', rating: '5', comment: 'x' })).toMatchObject({ success: true });
        expect(reviews.submitProviderReview).toHaveBeenLastCalledWith('u1', expect.objectContaining({ providerId: 'p-juan-red' }));
    });

    it('si la subida falla, la imagen vuelve a quedar disponible', async () => {
        media.uploadProviderPhoto.mockRejectedValueOnce(new Error('storage caído'));
        const { saveProviderAttachment } = await import('@/lib/coco/providerProfileTools');
        expect(await saveProviderAttachment({ id: OWNER, role: 'resident', communityId: A }, { attachment_id: 'x', provider_name: 'Juan Pérez', kind: 'profile_photo' })).toHaveProperty('error');
        expect(attachments.releaseChatImage).toHaveBeenCalledWith('chat/u/claimed-a.jpg', 'chat/u/a.jpg');
        expect(attachments.discardChatImage).not.toHaveBeenCalled();
    });

    it('por WhatsApp no se ofrece guardar imágenes', async () => {
        const { isToolOfferedFor } = await import('@/lib/coco/tools');
        expect(isToolOfferedFor('save_provider_attachment', 'admin', 'whatsapp')).toBe(false);
        expect(isToolOfferedFor('save_provider_attachment', 'admin', 'web')).toBe(true);
        expect(isToolOfferedFor('rate_provider', 'resident', 'whatsapp')).toBe(true);
    });
});
