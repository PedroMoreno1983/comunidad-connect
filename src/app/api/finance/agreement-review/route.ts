import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { decideAgreementReview, listAgreementsForReviewer } from '@/lib/finance/agreementService';

export const runtime = 'nodejs';

async function requireResident() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) throw new BillingError('unauthorized', 'Inicia sesión.', 401);
    if (profile.role !== 'resident' || !profile.community_id) throw new BillingError('forbidden', 'Solo un integrante residente puede revisar.', 403);
    return profile;
}

function respondError(req: NextRequest, error: unknown) {
    if (error instanceof BillingError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiErrorResponse(req, '/api/finance/agreement-review', error, { publicMessage: 'No se pudo gestionar la revisión del convenio.' });
}

export async function GET(req: NextRequest) {
    try {
        const profile = await requireResident();
        return NextResponse.json({ agreements: await listAgreementsForReviewer(profile.community_id!, profile.id) });
    } catch (error) { return respondError(req, error); }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'finance.agreement.review.decide', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const profile = await requireResident();
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        if (body.decision !== 'approved' && body.decision !== 'rejected') throw new BillingError('bad_decision', 'Elige aprobar o rechazar.');
        return NextResponse.json(await decideAgreementReview(profile.community_id!, profile.id,
            typeof body.agreementId === 'string' ? body.agreementId.slice(0, 60) : '',
            body.decision, typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''));
    } catch (error) { return respondError(req, error); }
}
