import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordAiEvent } from '@/lib/ai/telemetry';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';

const VALID_STATUSES = ['pending', 'accepted', 'completed', 'cancelled'] as const;
type ServiceRequestStatus = typeof VALID_STATUSES[number];

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
        let status = body.status as ServiceRequestStatus;
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
        const openForRequester = ['pending', 'accepted'].includes(request.status);

        if (!isStaff && !isProviderOwner) {
            if (!isRequester) {
                return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
            }
            if (!openForRequester) {
                return NextResponse.json({ error: 'Esta solicitud ya no se puede modificar' }, { status: 400 });
            }
            if (status === 'cancelled') {
                // residente puede cancelar pendiente o aceptada
            } else if (wantsReschedule) {
                // reagendar deja la solicitud pendiente para que el proveedor confirme
                status = 'pending';
            } else {
                return NextResponse.json({ error: 'Solo puedes cancelar o reagendar tu solicitud' }, { status: 403 });
            }
        }

        if (provider && provider.community_id !== actorProfile.community_id) {
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
            return NextResponse.json({ error: 'No se pudo actualizar la solicitud.' }, { status: 500 });
        }

        if (updatedRequest.user_id && updatedRequest.user_id !== actorProfile.id) {
            await supabaseAdmin.from('notifications').insert({
                user_id: updatedRequest.user_id,
                type: status === 'completed' ? 'success' : status === 'cancelled' ? 'warning' : 'info',
                category: 'service_request',
                title: `Tu solicitud fue ${statusLabel(status)}`,
                body: provider?.name
                    ? `${provider.name}: ${updatedRequest.description.slice(0, 160)}`
                    : updatedRequest.description.slice(0, 180),
                link: '/services/my-requests',
                community_id: request.community_id || actorProfile.community_id,
            });
        }

        if (provider?.user_id && provider.user_id !== actorProfile.id && provider.user_id !== updatedRequest.user_id) {
            await supabaseAdmin.from('notifications').insert({
                user_id: provider.user_id,
                type: 'info',
                category: 'service_request',
                title: `Solicitud ${statusLabel(status)}`,
                body: updatedRequest.description.slice(0, 180),
                link: '/services/provider-dashboard',
                community_id: request.community_id || actorProfile.community_id,
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
