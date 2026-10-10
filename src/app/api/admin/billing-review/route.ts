import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { adminCommitteeReview, requestCommitteeReview } from '@/lib/finance/committeeReviewService';

export const runtime = 'nodejs';

async function requireAdmin() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) throw new BillingError('unauthorized', 'Inicia sesión.', 401);
    if (profile.role !== 'admin' || !profile.community_id) throw new BillingError('forbidden', 'Solo administración puede solicitar la revisión.', 403);
    return profile;
}

function respondError(req: NextRequest, error: unknown) {
    if (error instanceof BillingError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiErrorResponse(req, '/api/admin/billing-review', error, { publicMessage: 'No se pudo gestionar la revisión.' });
}

export async function GET(req: NextRequest) {
    try {
        const profile = await requireAdmin();
        return NextResponse.json(await adminCommitteeReview(profile.community_id!, req.nextUrl.searchParams.get('month') || '', profile.id));
    } catch (error) { return respondError(req, error); }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.billing.review.request', { limit: 5, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const profile = await requireAdmin();
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        return NextResponse.json(await requestCommitteeReview(profile.community_id!, profile.id, {
            month: typeof body.month === 'string' ? body.month.slice(0, 7) : '',
            dueDate: typeof body.dueDate === 'string' ? body.dueDate.slice(0, 10) : '',
            reviewerId: typeof body.reviewerId === 'string' ? body.reviewerId.slice(0, 60) : '',
            quotaAmount: body.quotaAmount, quotaMethod: body.quotaMethod,
        }), { status: 201 });
    } catch (error) { return respondError(req, error); }
}
