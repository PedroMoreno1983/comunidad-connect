import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordAiEvent } from '@/lib/ai/telemetry';

const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'cancelled'] as const;
type CoCoCaseStatus = typeof VALID_STATUSES[number];

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

function statusLabel(status: CoCoCaseStatus) {
    switch (status) {
        case 'in_progress':
            return 'en revision';
        case 'resolved':
            return 'resuelto';
        case 'closed':
            return 'cerrado';
        case 'cancelled':
            return 'cancelado';
        default:
            return 'recibido';
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
        const status = body.status as CoCoCaseStatus;

        if (!VALID_STATUSES.includes(status)) {
            return NextResponse.json({ error: 'Estado no valido' }, { status: 400 });
        }

        const supabaseUser = await getSupabaseUserClient();
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { data: actorProfile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id, role, community_id, name, email')
            .eq('id', user.id)
            .single();

        if (profileError || !actorProfile || !['admin', 'concierge'].includes(actorProfile.role)) {
            return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
        }

        if (actorProfile.email?.toLowerCase().endsWith('@demo.com')) {
            return NextResponse.json(
                { error: 'Modo showcase compartido: los cambios reales de estado estan deshabilitados.' },
                { status: 403 }
            );
        }

        const { data: currentCase, error: caseError } = await supabaseAdmin
            .from('coco_cases')
            .select('id, title, status, user_id, community_id, metadata')
            .eq('id', id)
            .single();

        if (caseError || !currentCase) {
            return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 });
        }

        if (currentCase.community_id && currentCase.community_id !== actorProfile.community_id) {
            return NextResponse.json({ error: 'Caso pertenece a otra comunidad' }, { status: 403 });
        }

        const { data: updatedCase, error: updateError } = await supabaseAdmin
            .from('coco_cases')
            .update({
                status,
                metadata: {
                    ...(typeof currentCase.metadata === 'object' && currentCase.metadata ? currentCase.metadata : {}),
                    last_status_change: {
                        from: currentCase.status,
                        to: status,
                        by: actorProfile.id,
                        by_role: actorProfile.role,
                        at: new Date().toISOString(),
                    },
                },
            })
            .eq('id', id)
            .select('id, title, type, category, urgency, action, status, reason, source_message, assistant_reply, unit_label, created_at')
            .single();

        if (updateError || !updatedCase) {
            recordAiEvent({
                provider: 'system',
                feature: 'coco.case_status',
                status: 'error',
                model: 'api-v1',
                latencyMs: Date.now() - started,
                error: updateError,
            });
            return NextResponse.json({ error: updateError?.message || 'No se pudo actualizar' }, { status: 500 });
        }

        if (currentCase.user_id && currentCase.user_id !== actorProfile.id) {
            const notificationType = status === 'resolved' || status === 'closed' ? 'success' : 'info';
            const { error: notificationError } = await supabaseAdmin
                .from('notifications')
                .insert({
                    user_id: currentCase.user_id,
                    type: notificationType,
                    category: 'coco_case',
                    title: `Tu caso CoCo esta ${statusLabel(status)}`,
                    body: updatedCase.title,
                    link: '/resident/cases',
                    community_id: currentCase.community_id || actorProfile.community_id,
                });

            if (notificationError) {
                recordAiEvent({
                    provider: 'system',
                    feature: 'coco.case_status_notification',
                    status: 'error',
                    model: 'api-v1',
                    latencyMs: Date.now() - started,
                    error: notificationError,
                });
            }
        }

        const { error: eventError } = await supabaseAdmin
            .from('coco_case_events')
            .insert({
                case_id: currentCase.id,
                community_id: currentCase.community_id || actorProfile.community_id,
                actor_id: actorProfile.id,
                actor_role: actorProfile.role,
                event_type: 'status_changed',
                from_status: currentCase.status,
                to_status: status,
                body: `${actorProfile.name || 'Equipo'} cambio el caso a ${statusLabel(status)}.`,
                metadata: {
                    source: 'admin_dashboard',
                },
            });

        if (eventError) {
            recordAiEvent({
                provider: 'system',
                feature: 'coco.case_events',
                status: 'error',
                model: 'api-v1',
                latencyMs: Date.now() - started,
                error: eventError,
            });
        }

        recordAiEvent({
            provider: 'system',
            feature: 'coco.case_status',
            status: 'success',
            model: 'api-v1',
            latencyMs: Date.now() - started,
            outputChars: updatedCase.title.length,
        });

        return NextResponse.json({ case: updatedCase }, { status: 200 });
    } catch (error) {
        recordAiEvent({
            provider: 'system',
            feature: 'coco.case_status',
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
