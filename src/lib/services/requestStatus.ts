import type { SupabaseClient } from '@supabase/supabase-js';
import { recordOperationEvent } from '@/lib/operations/audit';
import { serviceRequestTransitionError, validServiceSchedule } from '@/lib/services/requestLifecycle';
import type { ServiceRequestStatus } from '@/lib/types';

/**
 * Cambiar el estado de una solicitud de servicio (aceptar, reprogramar,
 * marcar realizada, completar, cancelar). Lo usan la pantalla
 * (/api/service-requests/[id]/status) y CoCo (update_service_request_status):
 * mismas transiciones (serviceRequestTransitionError), mismo bloqueo
 * optimista sobre el estado anterior y misma bitácora.
 */

export const SERVICE_REQUEST_STATUSES = ['pending', 'accepted', 'awaiting_confirmation', 'completed', 'cancelled'] as const;

export type ServiceRequestActor = { id: string; role: string; communityId: string | null };
export type ServiceRequestChange = { status: string; preferredDate?: string; preferredTime?: string };
export type ServiceRequestStatusResult =
    | { request: Record<string, unknown> }
    | { error: string; status: 400 | 403 | 404 | 409; cause?: unknown };

export function serviceRequestStatusLabel(status: ServiceRequestStatus) {
    switch (status) {
        case 'accepted': return 'aceptada';
        case 'awaiting_confirmation': return 'realizada; confirma su finalización';
        case 'completed': return 'completada';
        case 'cancelled': return 'cancelada';
        default: return 'pendiente';
    }
}

export async function changeServiceRequestStatus(
    admin: SupabaseClient,
    actor: ServiceRequestActor,
    requestId: string,
    change: ServiceRequestChange,
    requestIdForAudit?: string,
): Promise<ServiceRequestStatusResult> {
    const status = change.status as ServiceRequestStatus;
    if (!SERVICE_REQUEST_STATUSES.includes(status as typeof SERVICE_REQUEST_STATUSES[number])) return { error: 'Estado no valido', status: 400 };
    const preferredDate = (change.preferredDate ?? '').trim();
    const preferredTime = (change.preferredTime ?? '').trim();
    const wantsReschedule = Boolean(preferredDate || preferredTime);

    const { data: request, error: requestError } = await admin
        .from('service_requests')
        .select('id, provider_id, user_id, preferred_date, preferred_time, description, status, community_id, created_at')
        .eq('id', requestId)
        .single();
    if (requestError || !request) return { error: 'Solicitud no encontrada', status: 404 };
    if (!actor.communityId || request.community_id !== actor.communityId) return { error: 'Solicitud pertenece a otra comunidad', status: 403 };

    const { data: provider } = request.provider_id
        ? await admin.from('service_providers').select('id, name, user_id, community_id').eq('id', request.provider_id).single()
        : { data: null };

    const isStaff = ['admin', 'concierge'].includes(actor.role);
    const isProviderOwner = provider?.user_id === actor.id;
    const isRequester = request.user_id === actor.id;
    const transitionError = serviceRequestTransitionError({
        current: request.status, next: status, requester: isRequester,
        manager: isStaff || isProviderOwner, reschedule: wantsReschedule,
    });
    if (transitionError) return { error: transitionError, status: 409 };
    if (wantsReschedule && !validServiceSchedule(preferredDate, preferredTime)) return { error: 'Indica una fecha y hora válidas.', status: 400 };
    if (provider?.community_id && provider.community_id !== request.community_id) return { error: 'Proveedor pertenece a otra comunidad', status: 403 };

    const patch: Record<string, string> = { status };
    if (wantsReschedule) {
        if (preferredDate) patch.preferred_date = preferredDate;
        if (preferredTime) patch.preferred_time = preferredTime;
    }

    const { data: updated, error: updateError } = await admin
        .from('service_requests')
        .update(patch)
        .eq('id', requestId)
        .eq('community_id', actor.communityId)
        .eq('status', request.status)
        .select('id, provider_id, user_id, preferred_date, preferred_time, description, status, created_at')
        .single();
    if (updateError || !updated) return { error: 'La solicitud cambió. Actualiza la página antes de reintentar.', status: 409, cause: updateError };

    await recordOperationEvent({
        communityId: request.community_id || actor.communityId,
        actorId: actor.id,
        actorRole: actor.role,
        action: 'service_request.status_changed',
        entityType: 'service_request',
        entityId: updated.id,
        severity: status === 'cancelled' ? 'warning' : 'success',
        status: status === 'completed' ? 'success' : status === 'cancelled' ? 'blocked' : 'pending',
        summary: `Solicitud ${serviceRequestStatusLabel(status)}`,
        metadata: { previousStatus: request.status, nextStatus: status, providerId: provider?.id || null },
        requestId: requestIdForAudit,
    });

    return { request: updated as Record<string, unknown> };
}
