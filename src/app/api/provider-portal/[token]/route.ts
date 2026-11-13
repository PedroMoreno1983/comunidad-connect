import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { ProviderPortalError, getProviderPortal, updateProviderProfileViaPortal } from '@/lib/services/providerPortal';

export const runtime = 'nodejs';

/** Portal del maestro externo: ver perfil y solicitudes (GET) y editar el perfil (PATCH). */

function failure(error: unknown) {
    if (error instanceof ProviderPortalError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'No se pudo completar la acción.' }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const limited = await enforceDistributedRateLimit(request, 'provider_portal.read', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const { token } = await params;
    try {
        return NextResponse.json(await getProviderPortal(token), { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        return failure(error);
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const limited = await enforceDistributedRateLimit(request, 'provider_portal.write', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { token } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    try {
        await updateProviderProfileViaPortal(token, body);
        return NextResponse.json({ ok: true });
    } catch (error) {
        return failure(error);
    }
}
