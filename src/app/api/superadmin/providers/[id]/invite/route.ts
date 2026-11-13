import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { requireSuperAdmin } from '@/lib/security/superadminAuth';
import { ProviderPortalError } from '@/lib/services/providerPortal';
import { ProviderNetworkError, createNetworkInvite } from '@/lib/services/providerNetworkAdmin';

export const runtime = 'nodejs';

/** Enlace del portal para un maestro de la red (revoca el anterior). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const limited = enforceRateLimit(request, 'superadmin.providers.invite', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    const { id } = await params;
    try {
        return NextResponse.json(await createNetworkInvite(id, { id: auth.user.id, email: auth.user.email }), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        if (error instanceof ProviderNetworkError || error instanceof ProviderPortalError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json({ error: 'No se pudo crear el enlace.' }, { status: 500 });
    }
}
