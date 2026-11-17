import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { requestAgreementConversation } from '@/lib/finance/agreementRequest';

export const runtime = 'nodejs';

/**
 * El residente pide conversar un convenio desde "Lo próximo a la vista".
 * La lógica vive en requestAgreementConversation, compartida con CoCo
 * (request_payment_agreement).
 */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'resident.agreement_request', { limit: 5, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        const result = await requestAgreementConversation(getSupabaseAdmin(), {
            id: profile.id, role: profile.role, communityId: profile.community_id ?? null, unitId: profile.unit_id ?? null,
        }, 'resident_home');
        if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json({ requested: true, message: result.message });
    } catch (error) {
        return apiErrorResponse(req, '/api/resident/agreement-request', error, {
            publicMessage: 'No pudimos enviar tu solicitud. Vuelve a intentarlo en un momento.',
        });
    }
}
