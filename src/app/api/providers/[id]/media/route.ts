import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { mediaFailure, requireProviderManager } from '@/lib/server/providerAccess';
import { deleteWorkPhoto, listWorkPhotos, uploadProviderPhoto } from '@/lib/services/providerMedia';

export const runtime = 'nodejs';

/** Fotos de trabajos del proveedor, para quien lo gestiona. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const manager = await requireProviderManager(id);
    if (manager instanceof NextResponse) return manager;
    try {
        return NextResponse.json({ photos: await listWorkPhotos(manager.providerId) }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return mediaFailure(error);
    }
}

/** Foto de perfil (kind=profile) o de un trabajo (kind=work), multipart con `file`. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const limited = enforceRateLimit(request, 'providers.media.write', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const { id } = await params;
    const manager = await requireProviderManager(id);
    if (manager instanceof NextResponse) return manager;
    try {
        const form = await request.formData();
        const kind = form.get('kind') === 'profile' ? 'profile' : 'work';
        const file = form.get('file');
        const caption = typeof form.get('caption') === 'string' ? String(form.get('caption')) : null;
        return NextResponse.json(await uploadProviderPhoto(manager.providerId, kind, file instanceof File ? file : null, caption, manager.actor), { status: 201 });
    } catch (error) {
        return mediaFailure(error);
    }
}

/** Borra una foto de trabajo: ?photoId=… */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const manager = await requireProviderManager(id);
    if (manager instanceof NextResponse) return manager;
    try {
        await deleteWorkPhoto(manager.providerId, request.nextUrl.searchParams.get('photoId') || '', manager.actor);
        return NextResponse.json({ ok: true });
    } catch (error) {
        return mediaFailure(error);
    }
}
