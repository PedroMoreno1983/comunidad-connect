import { NextRequest, NextResponse } from 'next/server';
import { decideMemoryProposal } from '@/lib/coco/learnFromChat';
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
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { data, error } = await getSupabaseAdmin()
        .from('coco_memory_proposals')
        .select('id, fact, category, created_at')
        .eq('community_id', profile.community_id)
        .eq('status', 'proposed')
        .order('created_at', { ascending: false })
        .limit(20);
    if (error) return NextResponse.json({ error: 'No pude leer las propuestas.' }, { status: 500 });
    return NextResponse.json({ proposals: data || [] });
}

export async function POST(req: NextRequest) {
    const profile = await adminCommunity();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const body = await req.json().catch(() => null) as { id?: unknown; decision?: unknown } | null;
    const id = typeof body?.id === 'string' ? body.id : '';
    const decision = body?.decision === 'approve' || body?.decision === 'reject' ? body.decision : '';
    if (!id || !decision) return NextResponse.json({ error: 'Decisión no válida.' }, { status: 400 });

    try {
        const result = await decideMemoryProposal({
            communityId: profile.community_id!,
            adminId: profile.id,
            proposalId: id,
            decision,
        });
        if ('error' in result) return NextResponse.json({ error: result.error }, { status: 409 });
    } catch (error) {
        console.error('[coco memory] decision failed', error);
        return NextResponse.json({ error: 'No pude guardar la decisión.' }, { status: 500 });
    }

    await recordOperationEvent({
        communityId: profile.community_id,
        actorId: profile.id,
        actorRole: 'admin',
        action: decision === 'approve' ? 'coco.memory.approved' : 'coco.memory.rejected',
        entityType: 'coco_memory_proposal',
        entityId: id,
        summary: decision === 'approve'
            ? 'El administrador guardó un recuerdo propuesto por CoCo.'
            : 'El administrador descartó un recuerdo propuesto por CoCo.',
    });
    return NextResponse.json({ ok: true });
}
