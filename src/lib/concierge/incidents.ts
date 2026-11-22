import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Conserjería (o administración) reporta una incidencia del edificio. Escribe
 * en coco_cases, la misma fuente que lee el panel, y avisa a la
 * administración: sin el aviso nadie se entera hasta entrar a Mantenimiento.
 *
 * Lo usan el panel (/api/concierge/incidents) y CoCo (register_incident).
 */

export const INCIDENT_URGENCIES = ['baja', 'media', 'alta', 'emergencia'] as const;

export type IncidentReporter = { id: string; role: string; communityId: string | null };
export type IncidentInput = { title: unknown; description?: unknown; urgency?: unknown };
export type IncidentResult =
    | { incident: Record<string, unknown> }
    | { error: string; status: 400 | 403 };

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export async function registerIncident(
    admin: SupabaseClient,
    reporter: IncidentReporter,
    input: IncidentInput,
    source: 'concierge_panel' | 'coco',
): Promise<IncidentResult> {
    if (reporter.role !== 'concierge' && reporter.role !== 'admin') {
        return { error: 'Solo conserjería o administración pueden reportar incidencias.', status: 403 };
    }
    if (!reporter.communityId) return { error: 'Tu cuenta no está asociada a una comunidad.', status: 400 };

    const title = clean(input.title, 160);
    const description = clean(input.description, 2000);
    const rawUrgency = clean(input.urgency, 20);
    const urgency = (INCIDENT_URGENCIES as readonly string[]).includes(rawUrgency) ? rawUrgency : 'media';
    if (!title) return { error: 'Escribe una descripción breve de la incidencia.', status: 400 };

    const { data, error } = await admin
        .from('coco_cases')
        .insert({
            community_id: reporter.communityId,
            user_id: reporter.id,
            role: reporter.role,
            channel: 'concierge',
            // 22-11-2026: 'registrar' y la categoría 'incidencia' no existen en los CHECK de coco_cases
            // (017_coco_cases.sql): toda incidencia fallaba al guardarse, en el panel y en CoCo.
            type: 'incidencia',
            category: 'otro',
            urgency,
            action: 'crear_ticket',
            title,
            description: description || title,
            reason: source === 'coco' ? 'Reportada por conserjería a través de CoCo.' : 'Reportada manualmente por conserjería.',
            source_message: title,
            status: 'open',
            metadata: { reportedBy: source },
        })
        .select('id, title, category, urgency, status, created_at')
        .single();
    if (error) throw error;

    const { data: admins } = await admin
        .from('profiles')
        .select('id')
        .eq('community_id', reporter.communityId)
        .eq('role', 'admin');
    const recipients = (admins || []).filter(row => row.id !== reporter.id);
    if (recipients.length) {
        const urgencyLabel = urgency === 'emergencia' ? 'Emergencia' : urgency === 'alta' ? 'Alta' : 'Incidencia';
        await admin.from('notifications').insert(recipients.map(row => ({
            user_id: row.id,
            type: urgency === 'emergencia' || urgency === 'alta' ? 'alert' : 'warning',
            category: 'coco_case',
            title: `${urgencyLabel} reportada por conserjería`,
            body: `${title}${description && description !== title ? ` — ${description.slice(0, 180)}` : ''}`,
            link: '/admin/mantenimiento',
            community_id: reporter.communityId,
        })));
    }

    return { incident: data as Record<string, unknown> };
}
