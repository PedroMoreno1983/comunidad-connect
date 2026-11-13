import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { mediaFailure, requireProviderManager } from '@/lib/server/providerAccess';
import { listProviderDocuments, reviewProviderDocument, uploadProviderDocument } from '@/lib/services/providerMedia';

export const runtime = 'nodejs';

/** Documentos del maestro. La administración ve además el chequeo y el archivo. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const manager = await requireProviderManager(id);
    if (manager instanceof NextResponse) return manager;
    try {
        return NextResponse.json({ documents: await listProviderDocuments(manager.providerId, manager.isReviewer) }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return mediaFailure(error);
    }
}

/** Sube un documento (multipart: kind, file). Se lee automáticamente y queda pendiente de revisión. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const limited = enforceRateLimit(request, 'providers.documents.write', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const { id } = await params;
    const manager = await requireProviderManager(id);
    if (manager instanceof NextResponse) return manager;
    try {
        const form = await request.formData();
        const file = form.get('file');
        return NextResponse.json(await uploadProviderDocument(
            manager.providerId, String(form.get('kind') || ''), file instanceof File ? file : null, manager.actor, manager.isReviewer ? 'admin' : 'provider_account',
        ), { status: 201 });
    } catch (error) {
        return mediaFailure(error);
    }
}

/** Solo la administración de la comunidad: { documentId, approve, note }. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const manager = await requireProviderManager(id);
    if (manager instanceof NextResponse) return manager;
    if (!manager.isReviewer) return NextResponse.json({ error: 'Solo la administración revisa documentos.' }, { status: 403 });
    const body = await request.json().catch(() => null) as { documentId?: unknown; approve?: unknown; note?: unknown } | null;
    if (!body || typeof body.approve !== 'boolean') return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 });
    try {
        await reviewProviderDocument(manager.providerId, String(body.documentId || ''), body.approve, typeof body.note === 'string' ? body.note : null, manager.actor);
        return NextResponse.json({ ok: true });
    } catch (error) {
        return mediaFailure(error);
    }
}
