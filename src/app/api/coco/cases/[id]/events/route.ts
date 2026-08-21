import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { recordAiEvent } from '@/lib/ai/telemetry';
import { insertCommunityNotification } from '@/lib/server/data/notifications';
import { getCocoCaseById, insertCocoCaseEvent, listCocoCaseEvents } from '@/lib/server/data/cocoCases';
import type { ServerAgentProfile } from '@/lib/server/agentIdentity';
import type { CocoCaseRow } from '@/lib/server/data/cocoCases';

type CaseAccess =
    | { error: NextResponse }
    | { actorProfile: ServerAgentProfile; currentCase: CocoCaseRow; isStaff: boolean };

async function getActorAndCase(caseId: string): Promise<CaseAccess> {
    const actorProfile = await getAuthenticatedAgentProfile();
    if (!actorProfile) {
        return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    }

    const currentCase = await getCocoCaseById(supabaseAdmin, caseId);
    if (!currentCase) {
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
    if ('error' in access) return access.error;

    try {
        const events = await listCocoCaseEvents(supabaseAdmin, id);
        return NextResponse.json({ events }, { status: 200 });
    } catch (error) {
        console.error('[case events] query failed', error);
        return NextResponse.json({ error: 'No se pudieron cargar los eventos del caso.' }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const started = Date.now();
    const { id } = await params;

    try {
        const access = await getActorAndCase(id);
        if ('error' in access) return access.error;

        const { actorProfile, currentCase, isStaff } = access;
        if (!isStaff) {
            return NextResponse.json({ error: 'Solo administracion o conserjeria pueden comentar' }, { status: 403 });
        }

        const body = await req.json();
        const comment = typeof body.body === 'string' ? body.body.trim().slice(0, 1200) : '';

        if (!comment) {
            return NextResponse.json({ error: 'Comentario requerido' }, { status: 400 });
        }

        const event = await insertCocoCaseEvent(supabaseAdmin, {
            caseId: currentCase.id,
            communityId: currentCase.community_id || actorProfile.community_id,
            actorId: actorProfile.id,
            actorRole: actorProfile.role,
            eventType: 'comment',
            body: comment,
            metadata: {
                source: 'admin_dashboard',
                visible_to_resident: true,
            },
        });

        if (!event) {
            recordAiEvent({
                provider: 'system',
                feature: 'coco.case_comment',
                status: 'error',
                model: 'api-v1',
                latencyMs: Date.now() - started,
                error: 'comment insert returned null',
            });
            console.error('[case events] comment insert failed');
            return NextResponse.json({ error: 'No se pudo comentar el caso.' }, { status: 500 });
        }

        if (currentCase.user_id && currentCase.user_id !== actorProfile.id) {
            const { error: notificationError } = await insertCommunityNotification(supabaseAdmin, {
                userId: currentCase.user_id,
                type: 'info',
                category: 'coco_case',
                title: 'Tu caso CoCo tiene una nueva actualizacion',
                body: comment,
                link: '/resident/cases',
                communityId: currentCase.community_id || actorProfile.community_id,
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
            { error: 'No se pudo actualizar el caso.' },
            { status: 500 }
        );
    }
}
