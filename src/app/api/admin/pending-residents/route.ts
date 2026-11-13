import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { NeighborBuildingError, decidePendingResident, listPendingResidents } from '@/lib/onboarding/neighborBuildings';

export const runtime = 'nodejs';

async function requireAdmin() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (profile.role !== 'admin') return { error: NextResponse.json({ error: 'Solo la administración valida vecinos.' }, { status: 403 }) };
    return { profile: { id: profile.id, communityId: profile.community_id } };
}

/** Vecinos que entraron sin código antes de que la administración tomara el edificio. */
export async function GET() {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    return NextResponse.json({ residents: await listPendingResidents(auth.profile.communityId) }, { headers: { 'Cache-Control': 'no-store' } });
}

/** { profileId, approve }: validar o quitar (no vive en el edificio). */
export async function PATCH(request: NextRequest) {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const body = await request.json().catch(() => null) as { profileId?: unknown; approve?: unknown } | null;
    if (!body || typeof body.approve !== 'boolean') return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 });
    try {
        await decidePendingResident(auth.profile.communityId, auth.profile.id, String(body.profileId || ''), body.approve);
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (error instanceof NeighborBuildingError) return NextResponse.json({ error: error.message }, { status: error.status });
        return NextResponse.json({ error: 'No se pudo guardar.' }, { status: 500 });
    }
}
