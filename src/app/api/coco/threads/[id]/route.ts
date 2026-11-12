import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { deleteWebThread, updateWebThreadMeta } from '@/lib/coco/session-store';

export const runtime = 'nodejs';

/**
 * Renombrar, fijar o borrar una conversación propia. La clave de la sesión se
 * arma con el perfil autenticado: nadie puede tocar conversaciones de otro
 * aunque adivine el id.
 */

const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { id } = await context.params;
    if (!THREAD_ID.test(id)) return NextResponse.json({ error: 'Conversación no válida.' }, { status: 400 });

    const body = await request.json().catch(() => ({})) as { title?: unknown; pinned?: unknown };
    const patch: { title?: string; pinned?: boolean } = {};
    if (typeof body.title === 'string') patch.title = body.title;
    if (typeof body.pinned === 'boolean') patch.pinned = body.pinned;
    if (patch.title === undefined && patch.pinned === undefined) {
        return NextResponse.json({ error: 'Nada que cambiar.' }, { status: 400 });
    }

    const ok = await updateWebThreadMeta(profile.id, id, patch);
    if (!ok) return NextResponse.json({ error: 'No encontré esa conversación.' }, { status: 404 });
    return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, context: Context) {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { id } = await context.params;
    if (!THREAD_ID.test(id)) return NextResponse.json({ error: 'Conversación no válida.' }, { status: 400 });
    const ok = await deleteWebThread(profile.id, id);
    if (!ok) return NextResponse.json({ error: 'No encontré esa conversación.' }, { status: 404 });
    return NextResponse.json({ ok: true });
}
