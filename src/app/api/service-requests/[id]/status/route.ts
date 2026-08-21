import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { recordAiEvent } from '@/lib/ai/telemetry';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';
import { insertCommunityNotification } from '@/lib/server/data/notifications';
import { getServiceProviderById } from '@/lib/server/data/serviceProviders';
import { getServiceRequestById, updateServiceRequestStatus } from '@/lib/server/data/serviceRequests';

const VALID_STATUSES = ['pending', 'accepted', 'completed', 'cancelled'] as const;
type ServiceRequestStatus = typeof VALID_STATUSES[number];

function statusLabel(status: ServiceRequestStatus) {
    switch (status) {
        case 'accepted':
            return 'aceptada';
        case 'completed':
            return 'completada';
        case 'cancelled':
            return 'cancelada';
        default:
            return 'pendiente';
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const started = Date.now();
    const { id } = await params;

    try {
        const body = await req.json();
        const status = body.status as ServiceRequestStatus;

        if (!VALID_STATUSES.includes(status)) {
            return NextResponse.json({ error: 'Estado no valido' }, { status: 400 });
        }

        const actorProfile = await getAuthenticatedAgentProfile();
        if (!actorProfile) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const request = await getServiceRequestById(supabaseAdmin, id);
        if (!request) {
            return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
        }

        if (!actorProfile.community_id || request.community_id !== actorProfile.community_id) {
            return NextResponse.json({ error: 'Solicitud pertenece a otra comunidad' }, { status: 403 });
        }

        const provider = request.provider_id
            ? await getServiceProviderById(supabaseAdmin, request.provider_id)
            : null;

        const isStaff = ['admin', 'concierge'].includes(actorProfile.role);
        const isProviderOwner = provider?.user_id === actorProfile.id;

        if (!isStaff && !isProviderOwner) {
            return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
        }

        if (provider && provider.community_id !== actorProfile.community_id) {
            return NextResponse.json({ error: 'Proveedor pertenece a otra comunidad' }, { status: 403 });
        }

        const updatedRequest = await updateServiceRequestStatus(supabaseAdmin, id, status);
        if (!updatedRequest) {
            recordAiEvent({
                provider: 'system',
                feature: 'service_request.status',
                status: 'error',
                model: 'api-v1',
                latencyMs: Date.now() - started,
                error: 'update returned null',
            });
            console.error('[service request status] update failed');
            return NextResponse.json({ error: 'No se pudo actualizar la solicitud.' }, { status: 500 });
        }

        if (updatedRequest.user_id && updatedRequest.user_id !== actorProfile.id) {
            await insertCommunityNotification(supabaseAdmin, {
                userId: updatedRequest.user_id,
                type: status === 'completed' ? 'success' : status === 'cancelled' ? 'warning' : 'info',
                category: 'service_request',
                title: `Tu solicitud fue ${statusLabel(status)}`,
                body: provider?.name
                    ? `${provider.name}: ${updatedRequest.description.slice(0, 160)}`
                    : updatedRequest.description.slice(0, 180),
                link: '/services/my-requests',
                communityId: request.community_id || actorProfile.community_id,
            });
        }

        if (provider?.user_id && provider.user_id !== actorProfile.id && provider.user_id !== updatedRequest.user_id) {
            await insertCommunityNotification(supabaseAdmin, {
                userId: provider.user_id,
                type: 'info',
                category: 'service_request',
                title: `Solicitud ${statusLabel(status)}`,
                body: updatedRequest.description.slice(0, 180),
                link: `/services/provider/${provider.id}`,
                communityId: request.community_id || actorProfile.community_id,
            });
        }

        recordAiEvent({
            provider: 'system',
            feature: 'service_request.status',
            status: 'success',
            model: 'api-v1',
            latencyMs: Date.now() - started,
            outputChars: updatedRequest.description.length,
        });

        await recordOperationEvent({
            communityId: request.community_id || actorProfile.community_id,
            actorId: actorProfile.id,
            actorRole: actorProfile.role,
            action: 'service_request.status_changed',
            entityType: 'service_request',
            entityId: updatedRequest.id,
            severity: status === 'cancelled' ? 'warning' : 'success',
            status: status === 'completed' ? 'success' : status === 'cancelled' ? 'blocked' : 'pending',
            summary: `Solicitud ${statusLabel(status)}`,
            metadata: {
                previousStatus: request.status,
                nextStatus: status,
                providerId: provider?.id || null,
            },
            requestId: getRequestId(req),
        });

        return NextResponse.json({ request: updatedRequest }, { status: 200 });
    } catch (error) {
        recordAiEvent({
            provider: 'system',
            feature: 'service_request.status',
            status: 'error',
            model: 'api-v1',
            latencyMs: Date.now() - started,
            error,
        });
        return NextResponse.json(
            { error: 'No se pudo actualizar la solicitud.' },
            { status: 500 }
        );
    }
}
