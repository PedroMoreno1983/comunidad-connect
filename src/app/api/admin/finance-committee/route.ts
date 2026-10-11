import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { appointCommitteeMember, endCommitteeMembership, listCommitteeMembers } from '@/lib/finance/committeeMembers';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export const runtime = 'nodejs';

async function requireAdmin() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) throw new BillingError('unauthorized', 'Inicia sesión.', 401);
    if (profile.role !== 'admin' || !profile.community_id) throw new BillingError('forbidden', 'Solo administración gestiona el comité.', 403);
    return profile;
}

function respondError(req: NextRequest, error: unknown) {
    if (error instanceof BillingError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiErrorResponse(req, '/api/admin/finance-committee', error, { publicMessage: 'No se pudo gestionar el comité.' });
}

export async function GET(req: NextRequest) {
    try {
        const profile = await requireAdmin();
        const admin = getSupabaseAdmin();
        const [members, residents] = await Promise.all([
            listCommitteeMembers(profile.community_id!),
            admin.from('profiles').select('id, name, email').eq('community_id', profile.community_id!)
                .eq('role', 'resident').order('name'),
        ]);
        if (residents.error) throw residents.error;
        return NextResponse.json({ members, residents: (residents.data ?? []).map(row => ({
            id: String(row.id), name: String(row.name || row.email || 'Residente'), email: String(row.email || ''),
        })) });
    } catch (error) { return respondError(req, error); }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.finance.committee', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const profile = await requireAdmin();
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        if (body.action === 'end') {
            const membershipId = typeof body.membershipId === 'string' ? body.membershipId.slice(0, 60) : '';
            return NextResponse.json(await endCommitteeMembership(profile.community_id!, profile.id, membershipId));
        }
        const residentId = typeof body.residentId === 'string' ? body.residentId.slice(0, 60) : '';
        return NextResponse.json(await appointCommitteeMember(profile.community_id!, profile.id, residentId), { status: 201 });
    } catch (error) { return respondError(req, error); }
}
