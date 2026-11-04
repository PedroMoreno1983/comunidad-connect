import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
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
    const { data, error } = await getSupabaseAdmin()
        .from('coco_proactive_proposals')
        .select('id, kind, title, body, href, subject_count, created_at')
        .eq('community_id', profile.community_id)
        .eq('status', 'proposed')
        .order('created_at', { ascending: false })
        .limit(10);
    if (error) return NextResponse.json({ error: 'No pude leer las propuestas.' }, { status: 500 });
    return NextResponse.json({ proposals: data || [] });
}

export async function POST(req: NextRequest) {
    const profile = await adminCommunity();
    if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const body = await req.json().catch(() => null) as { id?: unknown; decision?: unknown } | null;
    const id = typeof body?.id === 'string' ? body.id : '';
    const decision = body?.decision === 'accept' ? 'accepted' : body?.decision === 'dismiss' ? 'dismissed' : '';
    if (!id || !decision) return NextResponse.json({ error: 'Decisión no válida.' }, { status: 400 });

    const { data, error } = await getSupabaseAdmin()
        .from('coco_proactive_proposals')
        .update({
            status: decision,
            decided_at: new Date().toISOString(),
            decided_by: profile.id,
        })
        .eq('id', id)
        .eq('community_id', profile.community_id)
        .eq('status', 'proposed')
        .select('id, href')
        .maybeSingle();
    if (error) return NextResponse.json({ error: 'No pude guardar la decisión.' }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Esa propuesta ya no está pendiente.' }, { status: 409 });

    await recordOperationEvent({
        communityId: profile.community_id,
        actorId: profile.id,
        actorRole: 'admin',
        action: decision === 'accepted' ? 'coco.proposal.accepted' : 'coco.proposal.dismissed',
        entityType: 'coco_proactive_proposal',
        entityId: id,
        summary: decision === 'accepted' ? 'El administrador confirmó una propuesta de CoCo.' : 'El administrador descartó una propuesta de CoCo.',
    });

    return NextResponse.json({ ok: true, href: data.href });
}
