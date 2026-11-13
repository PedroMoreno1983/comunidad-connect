import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { requireSuperAdmin } from '@/lib/security/superadminAuth';
import { NeighborBuildingError, activateBuilding, listUnmanagedBuildings } from '@/lib/onboarding/neighborBuildings';

export const runtime = 'nodejs';

function failure(error: unknown) {
    if (error instanceof NeighborBuildingError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[superadmin buildings]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'No se pudo completar la operación.' }, { status: 500 });
}

/** Edificios sin administrar, ordenados por vecinos: los prospectos comerciales. */
export async function GET(request: NextRequest) {
    const limited = enforceRateLimit(request, 'superadmin.buildings.read', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    try {
        return NextResponse.json({ buildings: await listUnmanagedBuildings() }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return failure(error);
    }
}

/** Entregar un edificio a su administración: { communityId }. Devuelve el código de administración. */
export async function POST(request: NextRequest) {
    const limited = enforceRateLimit(request, 'superadmin.buildings.write', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    const body = await request.json().catch(() => null) as { communityId?: unknown } | null;
    try {
        const result = await activateBuilding(String(body?.communityId || ''), { id: auth.user.id, email: auth.user.email });
        return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return failure(error);
    }
}
