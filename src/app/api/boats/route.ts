import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { BoatError, createBoat, deleteBoat, listBoats } from '@/lib/community/boats';

export const runtime = 'nodejs';

/** Embarcaciones de la comunidad (módulo "Vida junto al lago"). */
async function member() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return null;
    return { id: profile.id, role: String(profile.role || 'resident'), communityId: profile.community_id, unitId: profile.unit_id ?? null };
}

function failure(error: unknown) {
    if (error instanceof BoatError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[boats]', error);
    return NextResponse.json({ error: 'No se pudo guardar. Intenta de nuevo.' }, { status: 500 });
}

export async function GET() {
    const user = await member();
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    try {
        return NextResponse.json({ boats: await listBoats(user), canSeeAll: user.role === 'admin' });
    } catch (error) {
        return failure(error);
    }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'boats', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const user = await member();
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    try {
        const body = await req.json().catch(() => ({}));
        return NextResponse.json({ boat: await createBoat(user, body) }, { status: 201 });
    } catch (error) {
        return failure(error);
    }
}

export async function DELETE(req: NextRequest) {
    const user = await member();
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    try {
        const id = req.nextUrl.searchParams.get('id') || '';
        if (!id) throw new BoatError('Falta la embarcación.');
        await deleteBoat(user, id);
        return NextResponse.json({ ok: true });
    } catch (error) {
        return failure(error);
    }
}
