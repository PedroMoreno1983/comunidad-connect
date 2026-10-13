import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { requireCommunityAdmin } from '@/lib/finance/httpAuth';
import { configureAccessGate, getAccessGate, IntercomError } from '@/lib/operations/intercomService';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireCommunityAdmin();
        if (auth.error) return auth.error;
        return NextResponse.json(await getAccessGate(auth.communityId));
    } catch (error) {
        return apiErrorResponse(req, '/api/admin/access-gate', error, { publicMessage: 'No se pudo cargar el portón.' });
    }
}

/** Guarda la dirección del controlador del portón y entrega un secreto nuevo, una sola vez. */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.access_gate', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const auth = await requireCommunityAdmin();
        if (auth.error) return auth.error;
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const url = typeof body.url === 'string' && body.url.trim() ? body.url.trim().slice(0, 500) : null;
        return NextResponse.json(await configureAccessGate(auth.communityId, url));
    } catch (error) {
        if (error instanceof IntercomError) return NextResponse.json({ error: error.message }, { status: error.status });
        return apiErrorResponse(req, '/api/admin/access-gate', error, { publicMessage: 'No se pudo guardar el portón.' });
    }
}
