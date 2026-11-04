import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { canUndoCoCoEvent } from '@/lib/coco/autonomy';
import { cancelCoCoReminder } from '@/lib/agent-center/cocoReminders';
import { recordOperationEvent } from '@/lib/operations/audit';

export const dynamic = 'force-dynamic';

async function adminCommunity() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile || profile.role !== 'admin' || !profile.community_id) return null;
    return profile;
}

export async function GET() {
    const profile = await adminCommunity();
    if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const admin = getSupabaseAdmin();
    const [events, community] = await Promise.all([
        admin.from('operation_events')
            .select('id, action, summary, status, actor_role, created_at, metadata')
            .eq('community_id', profile.community_id)
            .like('action', 'coco.%')
            .order('created_at', { ascending: false })
            .limit(40),
        admin.from('communities').select('coco_autonomy').eq('id', profile.community_id).maybeSingle(),
    ]);
    if (events.error) return NextResponse.json({ error: 'No pude leer la actividad.' }, { status: 500 });
    const autonomy = community.error ? true : community.data?.coco_autonomy !== false;
    const rows = (events.data || []).map(row => ({
        id: row.id,
        action: row.action,
        summary: row.summary,
        status: row.status,
        actorRole: row.actor_role,
        createdAt: row.created_at,
        canUndo: Boolean(canUndoCoCoEvent(String(row.action), row.metadata)),
    }));
    return NextResponse.json({ autonomy, events: rows });
}

export async function POST(request: NextRequest) {
    const profile = await adminCommunity();
    if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const body = await request.json().catch(() => null) as { autonomy?: boolean; undoEventId?: string } | null;
    const admin = getSupabaseAdmin();
    if (typeof body?.autonomy === 'boolean') {
        const { error } = await admin.from('communities').update({ coco_autonomy: body.autonomy }).eq('id', profile.community_id);
        if (error) return NextResponse.json({ error: 'No pude cambiar el interruptor. Falta aplicar la migración.' }, { status: 500 });
        await recordOperationEvent({
            communityId: profile.community_id,
            actorId: profile.id,
            actorRole: profile.role,
            action: 'coco.autonomy.updated',
            entityType: 'community',
            entityId: profile.community_id,
            summary: body.autonomy ? 'CoCo puede volver a cambiar datos' : 'CoCo quedó solo para orientar',
        });
        return NextResponse.json({ autonomy: body.autonomy });
    }
    if (body?.undoEventId) {
        const { data: event, error } = await admin.from('operation_events')
            .select('id, action, metadata')
            .eq('id', body.undoEventId)
            .eq('community_id', profile.community_id)
            .maybeSingle();
        if (error || !event) return NextResponse.json({ error: 'No encontré esa acción.' }, { status: 404 });
        const undo = canUndoCoCoEvent(String(event.action), event.metadata);
        if (!undo) return NextResponse.json({ error: 'Esta acción no se puede deshacer desde aquí.' }, { status: 422 });
        const result = await cancelCoCoReminder({
            user_id: profile.id,
            role: profile.role,
            community_id: profile.community_id || undefined,
            name: profile.name || undefined,
        }, undo.reminderId);
        if ('error' in result) return NextResponse.json({ error: result.error }, { status: 422 });
        await recordOperationEvent({
            communityId: profile.community_id,
            actorId: profile.id,
            actorRole: profile.role,
            action: 'coco.activity.undone',
            entityType: 'operation_event',
            entityId: String(event.id),
            summary: 'El administrador deshizo un recordatorio creado por CoCo',
            metadata: { reminderId: undo.reminderId },
        });
        return NextResponse.json({ undone: true });
    }
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
}
