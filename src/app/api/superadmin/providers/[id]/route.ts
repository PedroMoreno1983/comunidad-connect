import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { requireSuperAdmin } from '@/lib/security/superadminAuth';
import { ProviderNetworkError, moveProvider, setNetworkProviderVerified } from '@/lib/services/providerNetworkAdmin';
import type { NetworkProviderAction } from '@/lib/types';

export const runtime = 'nodejs';

/** Sumar a la red, devolver a una comunidad o verificar a un maestro de la red. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const limited = enforceRateLimit(request, 'superadmin.providers.write', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    const { id } = await params;
    const body = await request.json().catch(() => null) as NetworkProviderAction | null;
    const actor = { id: auth.user.id, email: auth.user.email };
    try {
        if (body?.action === 'to_network') await moveProvider(id, null, actor);
        else if (body?.action === 'to_community' && typeof body.communityId === 'string') await moveProvider(id, body.communityId, actor);
        else if (body?.action === 'verify' && typeof body.verified === 'boolean') await setNetworkProviderVerified(id, body.verified, actor);
        else return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (error instanceof ProviderNetworkError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('[superadmin providers]', error instanceof Error ? error.message : error);
        return NextResponse.json({ error: 'No se pudo completar la operación.' }, { status: 500 });
    }
}
