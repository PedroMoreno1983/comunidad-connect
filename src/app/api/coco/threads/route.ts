import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSession, listWebThreads, saveSession } from '@/lib/coco/session-store';
import type { CoCoThread } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const threads = await listWebThreads(profile.id, profile.community_id);
    const legacy = await getSession(`web:${profile.id}`);
    if (legacy?.user_context.community_id === profile.community_id && legacy.conversation.length) {
        const first = legacy.conversation.find(turn => turn.role === 'user' && typeof turn.content === 'string');
        threads.push({ id: 'legacy', title: typeof first?.content === 'string' ? first.content.slice(0, 56) : 'Conversación anterior', updatedAt: legacy.last_activity || '' });
    }
    threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return NextResponse.json({ threads }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const threads = await listWebThreads(profile.id, profile.community_id);
    if (threads.length >= 30) return NextResponse.json({ error: 'Ya tienes 30 conversaciones activas.' }, { status: 409 });
    const id = crypto.randomUUID();
    await saveSession(`web:${profile.id}:${id}`, {
        conversation: [],
        user_context: { user_id: profile.id, community_id: profile.community_id, role: profile.role, name: profile.name || '', channel: 'web', title: 'Nueva conversación' },
    });
    const thread: CoCoThread = { id, title: 'Nueva conversación', updatedAt: new Date().toISOString() };
    return NextResponse.json({ thread }, { status: 201 });
}
