import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { findOrCreateCommunityUnit } from '@/lib/units/resolveCommunityUnit';

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

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.users.assign-unit', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const profileId = cleanText(body.profileId, 60);
        const unitNumber = cleanText(body.unitNumber, 40);
        if (!profileId) return NextResponse.json({ error: 'Falta el usuario.' }, { status: 400 });
        if (!unitNumber) return NextResponse.json({ error: 'Ingresa el numero de unidad o departamento.' }, { status: 400 });

        const admin = getSupabaseAdmin();
        const { data: target, error: targetError } = await admin
            .from('profiles')
            .select('id, role, community_id')
            .eq('id', profileId)
            .maybeSingle();
        if (targetError) throw targetError;
        if (!target) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
        if (target.community_id !== auth.communityId) {
            return NextResponse.json({ error: 'El usuario no pertenece a tu comunidad.' }, { status: 403 });
        }
        if (target.role !== 'resident') {
            return NextResponse.json({ error: 'Solo se asigna unidad a residentes.' }, { status: 400 });
        }

        const unitId = await findOrCreateCommunityUnit(admin, auth.communityId, unitNumber);
        const { error: updateError } = await admin
            .from('profiles')
            .update({
                unit_id: unitId,
                department_number: unitNumber,
            })
            .eq('id', profileId);
        if (updateError) throw updateError;

        const { data: unitRow } = await admin.from('units').select('owner_id').eq('id', unitId).maybeSingle();
        if (unitRow && !unitRow.owner_id) {
            await admin.from('units').update({ owner_id: profileId }).eq('id', unitId);
        }

        return NextResponse.json({ ok: true, unitId, unitNumber });
    } catch (error) {
        return apiErrorResponse(req, '/api/admin/users/assign-unit', error, {
            publicMessage: 'No se pudo asignar la unidad.',
        });
    }
}
