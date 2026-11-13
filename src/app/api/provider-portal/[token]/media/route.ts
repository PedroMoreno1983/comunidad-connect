import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { mediaFailure } from '@/lib/server/providerAccess';
import { resolvePortalProvider } from '@/lib/services/providerPortal';
import { deleteWorkPhoto, uploadProviderPhoto } from '@/lib/services/providerMedia';

export const runtime = 'nodejs';

const ACTOR = { id: null, role: 'external_provider' };

/** El maestro, con su enlace, sube su foto de perfil (kind=profile) o de un trabajo (kind=work). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const limited = await enforceDistributedRateLimit(request, 'provider_portal.media', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { token } = await params;
    try {
        const { providerId } = await resolvePortalProvider(token);
        const form = await request.formData();
        const kind = form.get('kind') === 'profile' ? 'profile' : 'work';
        const file = form.get('file');
        const caption = typeof form.get('caption') === 'string' ? String(form.get('caption')) : null;
        return NextResponse.json(await uploadProviderPhoto(providerId, kind, file instanceof File ? file : null, caption, ACTOR), { status: 201 });
    } catch (error) {
        return mediaFailure(error);
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const limited = await enforceDistributedRateLimit(request, 'provider_portal.media', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { token } = await params;
    try {
        const { providerId } = await resolvePortalProvider(token);
        await deleteWorkPhoto(providerId, request.nextUrl.searchParams.get('photoId') || '', ACTOR);
        return NextResponse.json({ ok: true });
    } catch (error) {
        return mediaFailure(error);
    }
}
