import { NextResponse } from 'next/server';
import { disconnectGoogle, googleConnectionStatus } from '@/lib/coco/googleConnection';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { recordOperationEvent } from '@/lib/operations/audit';

export const dynamic = 'force-dynamic';

async function admin() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile || profile.role !== 'admin' || !profile.community_id) return null;
    return profile;
}

export async function GET() {
    const profile = await admin();
    if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    try {
        return NextResponse.json(await googleConnectionStatus(profile.id));
    } catch (error) {
        console.error('[coco google] status failed', error instanceof Error ? error.message : 'error');
        return NextResponse.json({ error: 'No pude leer la conexión.' }, { status: 500 });
    }
}

export async function DELETE() {
    const profile = await admin();
    if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    try {
        await disconnectGoogle(profile.id);
    } catch (error) {
        console.error('[coco google] disconnect failed', error instanceof Error ? error.message : 'error');
        return NextResponse.json({ error: 'No pude desconectar Google.' }, { status: 500 });
    }
    await recordOperationEvent({
        communityId: profile.community_id,
        actorId: profile.id,
        actorRole: 'admin',
        action: 'coco.google.disconnected',
        entityType: 'coco_google_connection',
        entityId: profile.id,
        summary: 'El administrador desconectó Google de CoCo.',
    });
    return NextResponse.json({ ok: true });
}
