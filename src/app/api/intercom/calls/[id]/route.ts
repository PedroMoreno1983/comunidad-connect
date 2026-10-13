import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { requireCommunityMember } from '@/lib/finance/httpAuth';
import {
    admitIntercomVisitor,
    answerIntercomCall,
    cancelIntercomCall,
    getIntercomCall,
    IntercomError,
    listIntercomCalls,
} from '@/lib/operations/intercomService';

export const runtime = 'nodejs';

const STAFF = new Set(['concierge', 'admin']);

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
    const limited = await enforceDistributedRateLimit(req, 'intercom.status', { limit: 120, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const auth = await requireCommunityMember();
        if (auth.error) return auth.error;
        const { id } = await params;
        if (STAFF.has(auth.profile.role)) {
            return NextResponse.json({ call: await getIntercomCall(auth.communityId, id.slice(0, 60)) });
        }
        // Un residente solo ve llamadas que suenan en su unidad.
        const mine = await listIntercomCalls(auth.communityId, { role: 'resident', unitId: auth.profile.unit_id ?? null, id: auth.profile.id });
        const call = mine.find(item => item.id === id);
        if (!call) return NextResponse.json({ error: 'Esa llamada ya no está activa.' }, { status: 404 });
        return NextResponse.json({ call });
    } catch (error) {
        if (error instanceof IntercomError) return NextResponse.json({ error: error.message }, { status: error.status });
        return apiErrorResponse(req, '/api/intercom/calls/[id]', error, { publicMessage: 'No se pudo cargar la llamada.' });
    }
}

export async function POST(req: NextRequest, { params }: Params) {
    const limited = await enforceDistributedRateLimit(req, 'intercom.answer', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const auth = await requireCommunityMember();
        if (auth.error) return auth.error;
        const { id } = await params;
        const callId = id.slice(0, 60);
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const action = typeof body.action === 'string' ? body.action : '';
        const staff = STAFF.has(auth.profile.role);

        if ((action === 'approve' || action === 'reject') && !staff) {
            const call = await answerIntercomCall(
                auth.communityId,
                { id: auth.profile.id, unitId: auth.profile.unit_id ?? null },
                callId,
                action === 'approve' ? 'approved' : 'rejected',
            );
            return NextResponse.json({ call });
        }
        if (action === 'cancel' && staff) {
            return NextResponse.json({ call: await cancelIntercomCall(auth.communityId, callId) });
        }
        if (action === 'admit' && staff) {
            return NextResponse.json({ call: await admitIntercomVisitor(auth.communityId, auth.profile.id, callId) });
        }
        return NextResponse.json({ error: 'Acción no permitida.' }, { status: 403 });
    } catch (error) {
        if (error instanceof IntercomError) return NextResponse.json({ error: error.message }, { status: error.status });
        return apiErrorResponse(req, '/api/intercom/calls/[id]', error, { publicMessage: 'No se pudo responder la llamada.' });
    }
}
