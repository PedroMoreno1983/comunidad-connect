import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { CoverPhotoError, resetCommunityCoverPhoto, setCommunityCoverPhoto } from '@/lib/community/coverPhoto';

export const runtime = 'nodejs';

/** Foto de portada del condominio. Solo la administración de esa comunidad. */
async function adminCommunity() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 401 }) };
    if (profile.role !== 'admin' || !profile.community_id) {
        return { error: NextResponse.json({ error: 'Solo la administración puede cambiar la portada.' }, { status: 403 }) };
    }
    return { communityId: profile.community_id };
}

function failure(error: unknown) {
    if (error instanceof CoverPhotoError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[community-cover]', error);
    return NextResponse.json({ error: 'No se pudo guardar la portada. Intenta de nuevo.' }, { status: 500 });
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.community_cover', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const access = await adminCommunity();
    if ('error' in access) return access.error;
    try {
        const form = await req.formData();
        const file = form.get('file');
        if (!(file instanceof File)) throw new CoverPhotoError('Elige una foto.');
        return NextResponse.json({ url: await setCommunityCoverPhoto(access.communityId, file) });
    } catch (error) {
        return failure(error);
    }
}

export async function DELETE() {
    const access = await adminCommunity();
    if ('error' in access) return access.error;
    try {
        await resetCommunityCoverPhoto(access.communityId);
        return NextResponse.json({ url: null });
    } catch (error) {
        return failure(error);
    }
}
