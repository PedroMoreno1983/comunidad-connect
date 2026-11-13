import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { ProviderPortalError, updateRequestViaPortal } from '@/lib/services/providerPortal';
import type { ServiceRequestStatus } from '@/lib/types';

export const runtime = 'nodejs';

const STATUSES: ServiceRequestStatus[] = ['pending', 'accepted', 'awaiting_confirmation', 'completed', 'cancelled'];

/** El maestro externo acepta, reagenda, marca como realizada o cancela una solicitud. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ token: string; requestId: string }> }) {
    const limited = await enforceDistributedRateLimit(request, 'provider_portal.write', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { token, requestId } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const status = body.status as ServiceRequestStatus;
    if (!STATUSES.includes(status)) return NextResponse.json({ error: 'Estado no válido.' }, { status: 400 });
    try {
        const updated = await updateRequestViaPortal(token, requestId, {
            status,
            preferredDate: typeof body.preferredDate === 'string' ? body.preferredDate.trim() : undefined,
            preferredTime: typeof body.preferredTime === 'string' ? body.preferredTime.trim() : undefined,
        });
        return NextResponse.json({ request: updated });
    } catch (error) {
        if (error instanceof ProviderPortalError) return NextResponse.json({ error: error.message }, { status: error.status });
        return NextResponse.json({ error: 'No se pudo actualizar la solicitud.' }, { status: 500 });
    }
}
