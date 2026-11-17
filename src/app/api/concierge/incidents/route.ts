import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { registerIncident } from '@/lib/concierge/incidents';

export const runtime = 'nodejs';

/**
 * Permite al conserje (o admin) REPORTAR una incidencia del edificio.
 * La lógica vive en registerIncident, compartida con CoCo (register_incident).
 */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'concierge.incident', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const result = await registerIncident(getSupabaseAdmin(), {
            id: profile.id, role: profile.role, communityId: profile.community_id ?? null,
        }, { title: body.title, description: body.description, urgency: body.urgency }, 'concierge_panel');
        if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json({ incident: result.incident }, { status: 201 });
    } catch (error) {
        return apiErrorResponse(req, '/api/concierge/incidents', error, {
            publicMessage: 'No se pudo registrar la incidencia.',
        });
    }
}
