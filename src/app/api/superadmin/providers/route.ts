import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { requireSuperAdmin } from '@/lib/security/superadminAuth';
import { ProviderNetworkError, createNetworkProvider, listProviderNetwork } from '@/lib/services/providerNetworkAdmin';
import type { NetworkProviderInput } from '@/lib/types';

export const runtime = 'nodejs';

function failure(error: unknown) {
    if (error instanceof ProviderNetworkError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[superadmin providers]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'No se pudo completar la operación.' }, { status: 500 });
}

/** Red Convive de maestros y los maestros de cada comunidad (candidatos). */
export async function GET(request: NextRequest) {
    const limited = enforceRateLimit(request, 'superadmin.providers.read', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    try {
        return NextResponse.json(await listProviderNetwork(request.nextUrl.searchParams.get('q')), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return failure(error);
    }
}

/** Registra un maestro directo en la red. */
export async function POST(request: NextRequest) {
    const limited = enforceRateLimit(request, 'superadmin.providers.write', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    const body = await request.json().catch(() => null) as NetworkProviderInput | null;
    if (!body) return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 });
    try {
        return NextResponse.json(await createNetworkProvider(body, { id: auth.user.id, email: auth.user.email }), { status: 201 });
    } catch (error) {
        return failure(error);
    }
}
