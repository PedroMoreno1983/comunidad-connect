import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';

export const runtime = 'nodejs';

const URGENCIES = new Set(['baja', 'media', 'alta', 'emergencia']);

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Permite al conserje (o admin) REPORTAR una incidencia del edificio.
 * Hasta ahora la sección de Incidencias solo mostraba las que generaba CoCo por
 * chat: el conserje no tenía forma de registrar una, y por eso se veía vacía
 * ("no funciona"). Escribe en coco_cases, la misma fuente que ya lee el panel.
 */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'concierge.incident', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (profile.role !== 'concierge' && profile.role !== 'admin') {
            return NextResponse.json({ error: 'Solo conserjería o administración pueden reportar incidencias.' }, { status: 403 });
        }
        if (!profile.community_id) {
            return NextResponse.json({ error: 'Tu cuenta no está asociada a una comunidad.' }, { status: 400 });
        }

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const title = cleanText(body.title, 160);
        const description = cleanText(body.description, 2000);
        const urgency = URGENCIES.has(cleanText(body.urgency, 20)) ? cleanText(body.urgency, 20) : 'media';

        if (!title) return NextResponse.json({ error: 'Escribe una descripción breve de la incidencia.' }, { status: 400 });

        const { data, error } = await getSupabaseAdmin()
            .from('coco_cases')
            .insert({
                community_id: profile.community_id,
                user_id: profile.id,
                role: profile.role,
                channel: 'concierge',
                type: 'incidencia',
                category: 'incidencia',
                urgency,
                action: 'registrar',
                title,
                description: description || title,
                reason: 'Reportada manualmente por conserjería.',
                source_message: title,
                status: 'open',
                metadata: { reportedBy: 'concierge_panel' },
            })
            .select('id, title, category, urgency, status, created_at')
            .single();
        if (error) throw error;

        return NextResponse.json({ incident: data }, { status: 201 });
    } catch (error) {
        return apiErrorResponse(req, '/api/concierge/incidents', error, {
            publicMessage: 'No se pudo registrar la incidencia.',
        });
    }
}
