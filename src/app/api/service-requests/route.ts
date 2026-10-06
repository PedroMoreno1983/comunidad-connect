import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';

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

import { chileTodayISO } from '@/lib/agent-center/chileDate';
import { validServiceSchedule } from '@/lib/services/requestLifecycle';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(req: NextRequest) {
    try {
        const supabaseUser = await getSupabaseUserClient();
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await req.json();
        const requestId = cleanText(body.id, 80);
        if (requestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))
            return NextResponse.json({ error: 'Identificador de solicitud inválido' }, { status: 400 });
        const providerId = cleanText(body.provider_id, 80);
        const internal = body.internal === true;
        const preferredDate = cleanText(body.preferred_date, 20) || (internal ? chileTodayISO() : '');
        const preferredTime = cleanText(body.preferred_time, 20) || (internal ? '09:00' : '');
        const description = cleanText(body.description, 1200);

        if ((!providerId && !internal) || !validServiceSchedule(preferredDate, preferredTime) || !description) {
            return NextResponse.json({ error: 'Faltan datos para crear la solicitud' }, { status: 400 });
        }

        const [{ data: profile, error: profileError }, { data: provider, error: providerError }] = await Promise.all([
            supabaseAdmin
                .from('profiles')
                .select('id, name, email, role, community_id')
                .eq('id', user.id)
                .single(),
            providerId ? supabaseAdmin
                .from('service_providers')
                .select('id, name, user_id, community_id')
                .eq('id', providerId)
                .single() : Promise.resolve({ data: null, error: null }),
        ]);

        if (profileError || !profile?.community_id) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
        }


        if (internal && profile.role !== 'admin') return NextResponse.json({ error: 'Solo administración puede crear tareas internas.' }, { status: 403 });

        if (providerError || (!internal && !provider)) {
            return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });
        }

        if (provider?.community_id && provider.community_id !== profile.community_id) {
            return NextResponse.json({ error: 'Proveedor pertenece a otra comunidad' }, { status: 403 });
        }

        const existingRequest = async () => {
            if (!requestId) return null;
            const { data, error } = await supabaseAdmin.from('service_requests')
                .select('id, provider_id, user_id, preferred_date, preferred_time, description, status, created_at')
                .eq('id', requestId).eq('user_id', profile.id).eq('community_id', profile.community_id).maybeSingle();
            if (error) throw error;
            if (data && (data.provider_id !== (providerId || null) || data.preferred_date !== preferredDate ||
                data.preferred_time !== preferredTime || data.description !== description))
                throw new Error('El identificador ya pertenece a otra solicitud.');
            return data;
        };
        const previous = await existingRequest();
        if (previous) return NextResponse.json({ request: previous, replayed: true });

        const { data: request, error: requestError } = await supabaseAdmin
            .from('service_requests')
            .insert({
                ...(requestId ? { id: requestId } : {}),
                provider_id: provider?.id || null,
                user_id: profile.id,
                preferred_date: preferredDate,
                preferred_time: preferredTime,
                description,
                status: 'pending',
                community_id: profile.community_id,
            })
            .select('id, provider_id, user_id, preferred_date, preferred_time, description, status, created_at')
            .single();

        if (requestError?.code === '23505' && requestId) {
            const existing = await existingRequest();
            if (existing) return NextResponse.json({ request: existing, replayed: true });
        }
        if (requestError || !request) {
            console.error('[service requests] insert failed', requestError);
            return NextResponse.json({ error: 'No se pudo crear la solicitud.' }, { status: 500 });
        }

        await recordOperationEvent({
            communityId: profile.community_id,
            actorId: profile.id,
            actorRole: profile.role,
            action: 'service_request.created',
            entityType: 'service_request',
            entityId: request.id,
            severity: 'success',
            status: 'pending',
            summary: `Solicitud enviada a ${provider?.name || 'Administración'}`,
            metadata: {
                providerId: provider?.id || null,
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
