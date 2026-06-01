import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordAiEvent } from '@/lib/ai/telemetry';

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

async function getActorAndCase(caseId: string) {
    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !user) {
        return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    }

    const [{ data: actorProfile, error: profileError }, { data: currentCase, error: caseError }] = await Promise.all([
        supabaseAdmin
            .from('profiles')
            .select('id, role, community_id, name, email')
            .eq('id', user.id)
            .single(),
        supabaseAdmin
            .from('coco_cases')
            .select('id, title, user_id, community_id')
            .eq('id', caseId)
            .single(),
    ]);

    if (profileError || !actorProfile) {
        return { error: NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 }) };
    }

    if (caseError || !currentCase) {
        return { error: NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 }) };
    }

    const isStaff = ['admin', 'concierge'].includes(actorProfile.role);
    const isOwner = currentCase.user_id === actorProfile.id;
    const sameCommunity = !currentCase.community_id || currentCase.community_id === actorProfile.community_id;

    if (!sameCommunity || (!isStaff && !isOwner)) {
        return { error: NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 }) };
    }

    return { actorProfile, currentCase, isStaff };
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const access = await getActorAndCase(id);
    if (access.error) return access.error;

    const { data, error } = await supabaseAdmin
        .from('coco_case_events')
        .select('id, case_id, event_type, from_status, to_status, body, actor_role, created_at')
        .eq('case_id', id)
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ events: data || [] }, { status: 200 });
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const started = Date.now();
    const { id } = await params;

    try {
        const access = await getActorAndCase(id);
        if (access.error) return access.error;

        const { actorProfile, currentCase, isStaff } = access;
        if (!isStaff) {
            return NextResponse.json({ error: 'Solo administracion o conserjeria pueden comentar' }, { status: 403 });
        }


        const body = await req.json();
        const comment = typeof body.body === 'string' ? body.body.trim().slice(0, 1200) : '';

        if (!comment) {
            return NextResponse.json({ error: 'Comentario requerido' }, { status: 400 });
        }

        const { data: event, error: eventError } = await supabaseAdmin
            .from('coco_case_events')
            .insert({
                case_id: currentCase.id,
                community_id: currentCase.community_id || actorProfile.community_id,
                actor_id: actorProfile.id,
                actor_role: actorProfile.role,
                event_type: 'comment',
                body: comment,
                metadata: {
                    source: 'admin_dashboard',
                    visible_to_resident: true,
                },
            })
            .select('id, case_id, event_type, from_status, to_status, body, actor_role, created_at')
            .single();

        if (eventError || !event) {
            recordAiEvent({
                provider: 'system',
                feature: 'coco.case_comment',
                status: 'error',
                model: 'api-v1',
                latencyMs: Date.now() - started,
                error: eventError,
            });
            return NextResponse.json({ error: eventError?.message || 'No se pudo comentar' }, { status: 500 });
        }

        if (currentCase.user_id && currentCase.user_id !== actorProfile.id) {
            const { error: notificationError } = await supabaseAdmin
                .from('notifications')
                .insert({
                    user_id: currentCase.user_id,
                    type: 'info',
                    category: 'coco_case',
                    title: 'Tu caso CoCo tiene una nueva actualizacion',
                    body: comment,
                    link: '/resident/cases',
                    community_id: currentCase.community_id || actorProfile.community_id,
                });

            if (notificationError) {
                recordAiEvent({
                    provider: 'system',
                    feature: 'coco.case_comment_notification',
                    status: 'error',
                    model: 'api-v1',
                    latencyMs: Date.now() - started,
                    error: notificationError,
                });
            }
        }

        recordAiEvent({
            provider: 'system',
            feature: 'coco.case_comment',
            status: 'success',
            model: 'api-v1',
            latencyMs: Date.now() - started,
            outputChars: comment.length,
        });

        return NextResponse.json({ event }, { status: 201 });
    } catch (error) {
        recordAiEvent({
            provider: 'system',
            feature: 'coco.case_comment',
            status: 'error',
            model: 'api-v1',
            latencyMs: Date.now() - started,
            error,
        });
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error desconocido' },
            { status: 500 }
        );
    }
}
