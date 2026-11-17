import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cambiar el estado de un caso de CoCo (reclamo o solicitud de un residente).
 * Lo usan el panel (/api/coco/cases/[id]/status) y CoCo (update_case_status):
 * mismas validaciones, mismo aviso al residente y misma bitácora.
 */

export const CASE_STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'cancelled'] as const;
export type CaseStatus = typeof CASE_STATUSES[number];

export type CaseActor = { id: string; role: string; communityId: string | null; name: string | null };
export type CaseStatusResult =
    | { case: Record<string, unknown> }
    | { error: string; status: 400 | 403 | 404 | 500; cause?: unknown };

export function caseStatusLabel(status: CaseStatus) {
    switch (status) {
        case 'in_progress': return 'en revisión';
        case 'resolved': return 'resuelto';
        case 'closed': return 'cerrado';
        case 'cancelled': return 'cancelado';
        default: return 'recibido';
    }
}

export async function changeCaseStatus(
    admin: SupabaseClient,
    actor: CaseActor,
    caseId: string,
    status: string,
    source: 'admin_dashboard' | 'coco',
): Promise<CaseStatusResult> {
    if (!CASE_STATUSES.includes(status as CaseStatus)) return { error: 'Estado no valido', status: 400 };
    if (!['admin', 'concierge'].includes(actor.role)) return { error: 'Permisos insuficientes', status: 403 };
    const next = status as CaseStatus;

    const { data: currentCase, error: caseError } = await admin
        .from('coco_cases')
        .select('id, title, status, user_id, community_id, metadata')
        .eq('id', caseId)
        .single();
    if (caseError || !currentCase) return { error: 'Caso no encontrado', status: 404 };
    if (currentCase.community_id && currentCase.community_id !== actor.communityId) {
        return { error: 'Caso pertenece a otra comunidad', status: 403 };
    }

    const { data: updatedCase, error: updateError } = await admin
        .from('coco_cases')
        .update({
            status: next,
            metadata: {
                ...(typeof currentCase.metadata === 'object' && currentCase.metadata ? currentCase.metadata : {}),
                last_status_change: { from: currentCase.status, to: next, by: actor.id, by_role: actor.role, at: new Date().toISOString() },
            },
        })
        .eq('id', caseId)
        .select('id, title, type, category, urgency, action, status, reason, source_message, assistant_reply, unit_label, created_at')
        .single();
    if (updateError || !updatedCase) return { error: 'No se pudo actualizar el caso.', status: 500, cause: updateError };

    const communityId = currentCase.community_id || actor.communityId;
    if (currentCase.user_id && currentCase.user_id !== actor.id) {
        // Un aviso fallido no deshace el cambio de estado: el residente lo ve igual en sus casos.
        await admin.from('notifications').insert({
            user_id: currentCase.user_id,
            type: next === 'resolved' || next === 'closed' ? 'success' : 'info',
            category: 'coco_case',
            title: `Tu caso CoCo esta ${caseStatusLabel(next)}`,
            body: updatedCase.title,
            link: '/resident/cases',
            community_id: communityId,
        });
    }
    await admin.from('coco_case_events').insert({
        case_id: currentCase.id,
        community_id: communityId,
        actor_id: actor.id,
        actor_role: actor.role,
        event_type: 'status_changed',
        from_status: currentCase.status,
        to_status: next,
        body: `${actor.name || 'Equipo'} cambio el caso a ${caseStatusLabel(next)}.`,
        metadata: { source },
    });

    return { case: updatedCase as Record<string, unknown> };
}
