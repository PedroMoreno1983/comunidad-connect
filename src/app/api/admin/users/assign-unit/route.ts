import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { AssignUnitError, assignResidentUnit } from '@/lib/units/assignResidentUnit';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function requireAdmin() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (profile.role !== 'admin') {
        return { error: NextResponse.json({ error: 'Solo la administracion puede asignar unidades.' }, { status: 403 }) };
    }
    if (!profile.community_id) {
        return { error: NextResponse.json({ error: 'Tu cuenta no esta asociada a una comunidad.' }, { status: 400 }) };
    }
    return { profile, communityId: profile.community_id };
}

/** La lógica vive en assignResidentUnit, compartida con CoCo (assign_resident_unit). */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.users.assign-unit', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const result = await assignResidentUnit(getSupabaseAdmin(), auth.communityId, cleanText(body.profileId, 60), cleanText(body.unitNumber, 40));
        return NextResponse.json({ ok: true, unitId: result.unitId, unitNumber: result.unitNumber });
    } catch (error) {
        if (error instanceof AssignUnitError) return NextResponse.json({ error: error.message }, { status: error.status });
        return apiErrorResponse(req, '/api/admin/users/assign-unit', error, {
            publicMessage: 'No se pudo asignar la unidad.',
        });
    }
}
