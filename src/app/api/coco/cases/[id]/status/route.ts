import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { recordAiEvent } from '@/lib/ai/telemetry';
import { insertCommunityNotification } from '@/lib/server/data/notifications';
import { getCocoCaseById, insertCocoCaseEvent, updateCocoCaseStatus } from '@/lib/server/data/cocoCases';

const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'cancelled'] as const;
type CoCoCaseStatus = typeof VALID_STATUSES[number];

function statusLabel(status: CoCoCaseStatus) {
    switch (status) {
        case 'in_progress':
            return 'en revisión';
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

        const actorProfile = await getAuthenticatedAgentProfile();
        if (!actorProfile || !['admin', 'concierge'].includes(actorProfile.role)) {
            return NextResponse.json(
                { error: actorProfile ? 'Permisos insuficientes' : 'No autorizado' },
                { status: actorProfile ? 403 : 401 },
            );
        }

        const currentCase = await getCocoCaseById(supabaseAdmin, id);
        if (!currentCase) {
            return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 });
        }

        if (currentCase.community_id && currentCase.community_id !== actorProfile.community_id) {
            return NextResponse.json({ error: 'Caso pertenece a otra comunidad' }, { status: 403 });
        }

        const metadata = {
            ...(typeof currentCase.metadata === 'object' && currentCase.metadata ? currentCase.metadata : {}),
            last_status_change: {
                from: currentCase.status,
                to: status,
                by: actorProfile.id,
                by_role: actorProfile.role,
                at: new Date().toISOString(),
            },
        };

        const updatedCase = await updateCocoCaseStatus(supabaseAdmin, {
            caseId: id,
            status,
            metadata,
        });

        if (!updatedCase) {
            recordAiEvent({
                provider: 'system',
                feature: 'coco.case_status',
                status: 'error',
                model: 'api-v1',
                latencyMs: Date.now() - started,
                error: 'update returned null',
            });
            console.error('[case status] update failed');
            return NextResponse.json({ error: 'No se pudo actualizar el caso.' }, { status: 500 });
        }

        if (currentCase.user_id && currentCase.user_id !== actorProfile.id) {
            const notificationType = status === 'resolved' || status === 'closed' ? 'success' : 'info';
            const { error: notificationError } = await insertCommunityNotification(supabaseAdmin, {
                userId: currentCase.user_id,
                type: notificationType,
                category: 'coco_case',
                title: `Tu caso CoCo esta ${statusLabel(status)}`,
                body: updatedCase.title,
                link: '/resident/cases',
                communityId: currentCase.community_id || actorProfile.community_id,
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

        const event = await insertCocoCaseEvent(supabaseAdmin, {
            caseId: currentCase.id,
            communityId: currentCase.community_id || actorProfile.community_id,
            actorId: actorProfile.id,
            actorRole: actorProfile.role,
            eventType: 'status_changed',
            fromStatus: currentCase.status,
            toStatus: status,
            body: `${actorProfile.name || 'Equipo'} cambio el caso a ${statusLabel(status)}.`,
            metadata: { source: 'admin_dashboard' },
        });

        if (!event) {
            recordAiEvent({
                provider: 'system',
                feature: 'coco.case_events',
                status: 'error',
                model: 'api-v1',
                latencyMs: Date.now() - started,
                error: 'event insert returned null',
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
            { error: 'No se pudo actualizar el caso.' },
            { status: 500 }
        );
    }
}
