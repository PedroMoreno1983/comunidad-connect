import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import {
    DEFAULT_THREAD_TITLE,
    MAX_WEB_THREADS,
    deleteWebThread,
    getSession,
    listWebThreads,
    saveSession,
    threadTitle,
} from '@/lib/coco/session-store';
import type { CoCoThread } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    let threads: CoCoThread[] = await listWebThreads(profile.id, profile.community_id);

    // Antes cada "Nueva conversación" creaba un hilo aunque hubiera uno vacío, y
    // la barra se llenaba de pestañas iguales. Se conserva la vacía más reciente
    // y se borran las demás.
    const empties = threads.filter(thread => thread.empty && !thread.pinned);
    if (empties.length > 1) {
        const [, ...extra] = empties;
        await Promise.all(extra.map(thread => deleteWebThread(profile.id, thread.id)));
        const removed = new Set(extra.map(thread => thread.id));
        threads = threads.filter(thread => !removed.has(thread.id));
    }

    const legacy = await getSession(`web:${profile.id}`);
    if (legacy?.user_context.community_id === profile.community_id && legacy.conversation.length) {
        threads.push({
            id: 'legacy',
            title: threadTitle(null, legacy.conversation[0]) === DEFAULT_THREAD_TITLE ? 'Conversación anterior' : threadTitle(null, legacy.conversation[0]),
            updatedAt: legacy.last_activity || '',
        });
    }
    threads.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt));
    return NextResponse.json({ threads }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const threads = await listWebThreads(profile.id, profile.community_id);

    // Si ya hay una conversación vacía, se abre esa en vez de crear otra.
    const empty = threads.find(thread => thread.empty && !thread.pinned);
    if (empty) return NextResponse.json({ thread: empty }, { status: 200 });

    if (threads.length >= MAX_WEB_THREADS) {
        return NextResponse.json({ error: `Tienes ${MAX_WEB_THREADS} conversaciones. Borra alguna para empezar otra.` }, { status: 409 });
    }
    const id = crypto.randomUUID();
    await saveSession(`web:${profile.id}:${id}`, {
        conversation: [],
        user_context: { user_id: profile.id, community_id: profile.community_id, role: profile.role, name: profile.name || '', channel: 'web', title: DEFAULT_THREAD_TITLE },
    });
    const thread: CoCoThread = { id, title: DEFAULT_THREAD_TITLE, updatedAt: new Date().toISOString(), empty: true };
    return NextResponse.json({ thread }, { status: 201 });
}
