import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordAiEvent } from '@/lib/ai/telemetry';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';

import type { ServiceRequestStatus } from '@/lib/types';
import { serviceRequestTransitionError, validServiceSchedule } from '@/lib/services/requestLifecycle';
const VALID_STATUSES = ['pending', 'accepted', 'awaiting_confirmation', 'completed', 'cancelled'] as const;

async function getSupabaseUserClient() {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: () => {},
            },
        }
    );
}

function statusLabel(status: ServiceRequestStatus) {
    switch (status) {
        case 'accepted':
            return 'aceptada';
        case 'awaiting_confirmation':
            return 'realizada; confirma su finalización';
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
        const preferredDate = typeof body.preferred_date === 'string' ? body.preferred_date.trim() : '';
        const preferredTime = typeof body.preferred_time === 'string' ? body.preferred_time.trim() : '';
        const wantsReschedule = Boolean(preferredDate || preferredTime);

        if (!VALID_STATUSES.includes(status)) {
            return NextResponse.json({ error: 'Estado no valido' }, { status: 400 });
        }

        const supabaseUser = await getSupabaseUserClient();
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const [{ data: actorProfile, error: profileError }, { data: request, error: requestError }] = await Promise.all([
            supabaseAdmin
                .from('profiles')
                .select('id, role, community_id, name, email')
                .eq('id', user.id)
                .single(),
            supabaseAdmin
                .from('service_requests')
                .select('id, provider_id, user_id, preferred_date, preferred_time, description, status, community_id, created_at')
                .eq('id', id)
                .single(),
        ]);

        if (profileError || !actorProfile) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
        }


        if (requestError || !request) {
            return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
        }

        if (!actorProfile.community_id || request.community_id !== actorProfile.community_id) {
            return NextResponse.json({ error: 'Solicitud pertenece a otra comunidad' }, { status: 403 });
        }

        const { data: provider } = request.provider_id
            ? await supabaseAdmin
                .from('service_providers')
                .select('id, name, user_id, community_id')
                .eq('id', request.provider_id)
                .single()
            : { data: null };

        const isStaff = ['admin', 'concierge'].includes(actorProfile.role);
        const isProviderOwner = provider?.user_id === actorProfile.id;
        const isRequester = request.user_id === actorProfile.id;
        const transitionError = serviceRequestTransitionError({
            current: request.status, next: status, requester: isRequester,
            manager: isStaff || isProviderOwner, reschedule: wantsReschedule,
        });
        if (transitionError) return NextResponse.json({ error: transitionError }, { status: 409 });
        if (wantsReschedule && !validServiceSchedule(preferredDate, preferredTime)) {
            return NextResponse.json({ error: 'Indica una fecha y hora válidas.' }, { status: 400 });
        }
        if (provider?.community_id && provider.community_id !== request.community_id) {
            return NextResponse.json({ error: 'Proveedor pertenece a otra comunidad' }, { status: 403 });
        }

        const patch: Record<string, string> = { status };
        if (wantsReschedule) {
            if (preferredDate) patch.preferred_date = preferredDate;
            if (preferredTime) patch.preferred_time = preferredTime;
        }

        const { data: updatedRequest, error: updateError } = await supabaseAdmin
            .from('service_requests')
            .update(patch)
            .eq('id', id)
            .eq('community_id', actorProfile.community_id)
            .eq('status', request.status)
            .select('id, provider_id, user_id, preferred_date, preferred_time, description, status, created_at')
            .single();

        if (updateError || !updatedRequest) {
            recordAiEvent({
                provider: 'system',
                feature: 'service_request.status',
                status: 'error',
                model: 'api-v1',
                latencyMs: Date.now() - started,
                error: updateError,
            });
            console.error('[service request status] update failed', updateError);
            return NextResponse.json({ error: 'La solicitud cambió. Actualiza la página antes de reintentar.' }, { status: 409 });
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
