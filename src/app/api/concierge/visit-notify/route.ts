import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Avisa al residente que su visita ingresó. Se llama después de registrar la
 * visita (manual o por QR): la notificación es para OTRO usuario (el dueño de la
 * unidad), así que la escribe el servidor con rol de servicio; desde el cliente
 * del conserje chocaría con RLS. Best-effort: si falla, la visita ya quedó
 * registrada igual.
 */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'concierge.visit_notify', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (profile.role !== 'concierge' && profile.role !== 'admin') {
            return NextResponse.json({ error: 'Solo conserjería o administración.' }, { status: 403 });
        }
        if (!profile.community_id) return NextResponse.json({ notified: false });

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        // El registro manual manda el UUID de la unidad; el QR manda el número.
        const unitId = cleanText(body.unitId, 60);
        const unitNumber = cleanText(body.unitNumber, 40);
        const visitorName = cleanText(body.visitorName, 120) || 'Tu visita';
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(unitId);
        if (!isUuid && !unitNumber) return NextResponse.json({ notified: false });

        const admin = getSupabaseAdmin();
        const query = admin
            .from('units')
            .select('owner_id, number')
            .eq('community_id', profile.community_id);
        const { data: unit } = await (isUuid
            ? query.eq('id', unitId).maybeSingle()
            : query.eq('number', unitNumber).maybeSingle());

        // Sin dueño asignado no hay a quién avisar; no es un error.
        if (!unit?.owner_id) return NextResponse.json({ notified: false });

        const time = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        const { error } = await admin.from('notifications').insert({
            user_id: String(unit.owner_id),
            type: 'info',
            category: 'visitor_arrival',
            title: 'Tu visita ingresó al edificio',
            body: `Conserjería registró el ingreso de ${visitorName} a tu unidad ${unit.number ?? ''} a las ${time}.`,
            link: '/resident/invitations',
            community_id: profile.community_id,
        });
        if (error) throw error;

        return NextResponse.json({ notified: true });
    } catch (error) {
        return apiErrorResponse(req, '/api/concierge/visit-notify', error, { publicMessage: 'ignored' });
    }
}
