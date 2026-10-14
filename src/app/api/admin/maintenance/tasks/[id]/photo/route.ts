import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export const runtime = 'nodejs';

/** URL firmada (10 minutos) de la foto de cierre de una tarea. Solo staff de la comunidad. */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    if (!['admin', 'concierge'].includes(String(profile.role)) || !profile.community_id) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    }
    const { id } = await context.params;
    const admin = getSupabaseAdmin();
    const { data: task, error } = await admin.from('maintenance_tasks').select('completion_photo_path')
        .eq('id', id).eq('community_id', profile.community_id).maybeSingle();
    if (error) return NextResponse.json({ error: 'No se pudo leer la tarea.' }, { status: 500 });
    if (!task?.completion_photo_path) return NextResponse.json({ error: 'La tarea no tiene foto de cierre.' }, { status: 404 });
    const { data: signed, error: signError } = await admin.storage.from('maintenance-photos')
        .createSignedUrl(String(task.completion_photo_path), 600);
    if (signError || !signed) return NextResponse.json({ error: 'No se pudo abrir la foto.' }, { status: 500 });
    return NextResponse.json({ url: signed.signedUrl });
}
