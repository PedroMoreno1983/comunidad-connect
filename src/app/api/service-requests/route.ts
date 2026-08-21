import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';
import { insertCommunityNotification } from '@/lib/server/data/notifications';
import { getServiceProviderById } from '@/lib/server/data/serviceProviders';
import { createServiceRequest } from '@/lib/server/data/serviceRequests';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(req: NextRequest) {
    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await req.json();
        const providerId = cleanText(body.provider_id, 80);
        const preferredDate = cleanText(body.preferred_date, 20);
        const preferredTime = cleanText(body.preferred_time, 20);
        const description = cleanText(body.description, 1200);

        if (!providerId || !preferredDate || !preferredTime || !description) {
            return NextResponse.json({ error: 'Faltan datos para crear la solicitud' }, { status: 400 });
        }

        const provider = await getServiceProviderById(supabaseAdmin, providerId);
        if (!provider) {
            return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });
        }

        if (provider.community_id && provider.community_id !== profile.community_id) {
            return NextResponse.json({ error: 'Proveedor pertenece a otra comunidad' }, { status: 403 });
        }

        const request = await createServiceRequest(supabaseAdmin, {
            providerId: provider.id,
            userId: profile.id,
            preferredDate,
            preferredTime,
            description,
            communityId: profile.community_id,
        });

        if (!request) {
            console.error('[service requests] insert failed');
            return NextResponse.json({ error: 'No se pudo crear la solicitud.' }, { status: 500 });
        }

        if (provider.user_id && provider.user_id !== profile.id) {
            await insertCommunityNotification(supabaseAdmin, {
                userId: provider.user_id,
                type: 'info',
                category: 'service_request',
                title: 'Nueva solicitud de servicio',
                body: `${profile.name || 'Un residente'} solicito a ${provider.name}: ${description.slice(0, 180)}`,
                link: '/services/provider',
                communityId: profile.community_id,
            });
        }

        await insertCommunityNotification(supabaseAdmin, {
            userId: profile.id,
            type: 'success',
            category: 'service_request',
            title: 'Solicitud enviada',
            body: `Tu solicitud a ${provider.name} quedo registrada.`,
            link: '/services/my-requests',
            communityId: profile.community_id,
        });

        await recordOperationEvent({
            communityId: profile.community_id,
            actorId: profile.id,
            actorRole: profile.role,
            action: 'service_request.created',
            entityType: 'service_request',
            entityId: request.id,
            severity: 'success',
            status: 'pending',
            summary: `Solicitud enviada a ${provider.name}`,
            metadata: {
                providerId: provider.id,
                preferredDate,
                preferredTime,
                descriptionLength: description.length,
            },
            requestId: getRequestId(req),
        });

        return NextResponse.json({ request }, { status: 201 });
    } catch (error) {
        console.error('[service requests] create failed', error);
        return NextResponse.json(
            { error: 'No se pudo crear la solicitud.' },
            { status: 500 }
        );
    }
}
