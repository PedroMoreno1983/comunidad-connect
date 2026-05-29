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
        const providerId = cleanText(body.provider_id, 80);
        const preferredDate = cleanText(body.preferred_date, 20);
        const preferredTime = cleanText(body.preferred_time, 20);
        const description = cleanText(body.description, 1200);

        if (!providerId || !preferredDate || !preferredTime || !description) {
            return NextResponse.json({ error: 'Faltan datos para crear la solicitud' }, { status: 400 });
        }

        const [{ data: profile, error: profileError }, { data: provider, error: providerError }] = await Promise.all([
            supabaseAdmin
                .from('profiles')
                .select('id, name, email, role, community_id')
                .eq('id', user.id)
                .single(),
            supabaseAdmin
                .from('service_providers')
                .select('id, name, user_id, community_id')
                .eq('id', providerId)
                .single(),
        ]);

        if (profileError || !profile) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
        }

        if (profile.email?.toLowerCase().endsWith('@demo.com')) {
            return NextResponse.json(
                { error: 'Modo showcase compartido: las solicitudes reales estan deshabilitadas.' },
                { status: 403 }
            );
        }

        if (providerError || !provider) {
            return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });
        }

        if (provider.community_id && provider.community_id !== profile.community_id) {
            return NextResponse.json({ error: 'Proveedor pertenece a otra comunidad' }, { status: 403 });
        }

        const { data: request, error: requestError } = await supabaseAdmin
            .from('service_requests')
            .insert({
                provider_id: provider.id,
                user_id: profile.id,
                preferred_date: preferredDate,
                preferred_time: preferredTime,
                description,
                status: 'pending',
                community_id: profile.community_id,
            })
            .select('id, provider_id, user_id, preferred_date, preferred_time, description, status, created_at')
            .single();

        if (requestError || !request) {
            return NextResponse.json({ error: requestError?.message || 'No se pudo crear la solicitud' }, { status: 500 });
        }

        if (provider.user_id && provider.user_id !== profile.id) {
            await supabaseAdmin.from('notifications').insert({
                user_id: provider.user_id,
                type: 'info',
                category: 'service_request',
                title: 'Nueva solicitud de servicio',
                body: `${profile.name || 'Un residente'} solicito a ${provider.name}: ${description.slice(0, 180)}`,
                link: '/services/provider',
                community_id: profile.community_id,
            });
        }

        await supabaseAdmin.from('notifications').insert({
            user_id: profile.id,
            type: 'success',
            category: 'service_request',
            title: 'Solicitud enviada',
            body: `Tu solicitud a ${provider.name} quedo registrada.`,
            link: '/services/my-requests',
            community_id: profile.community_id,
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
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error desconocido' },
            { status: 500 }
        );
    }
}
