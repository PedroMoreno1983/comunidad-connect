import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { recordOperationEvent } from '@/lib/operations/audit';
import { chileTodayISO } from '@/lib/agent-center/chileDate';

export const runtime = 'nodejs';
const BUCKET = 'maintenance-photos';
const EXTENSION_BY_MIME: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
};
const MAX_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ClosureError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

/**
 * Cierra una tarea de mantención con foto del trabajo terminado.
 * Sube la foto a un bucket privado, deja la bitácora con el adjunto y marca la
 * tarea como completada (el trigger de la base actualiza el activo).
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const limited = await enforceDistributedRateLimit(req, 'admin.maintenance_task_complete', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    if (!['admin', 'concierge'].includes(String(profile.role)) || !profile.community_id) {
        return NextResponse.json({ error: 'Solo la administración o conserjería puede cerrar tareas.' }, { status: 403 });
    }
    const { id } = await context.params;
    const admin = getSupabaseAdmin();
    let uploadedPath: string | null = null;
    try {
        if (!UUID.test(id)) throw new ClosureError('La tarea no es válida.');
        const form = await req.formData();
        const photo = form.get('photo');
        if (!(photo instanceof File)) throw new ClosureError('Adjunta una foto del trabajo terminado.');
        const extension = EXTENSION_BY_MIME[photo.type];
        if (!extension) throw new ClosureError('La foto debe ser JPG, PNG, WEBP o HEIC.');
        if (photo.size === 0 || photo.size > MAX_BYTES) throw new ClosureError('La foto debe pesar menos de 8 MB.');
        const note = String(form.get('note') || '').trim().slice(0, 500);
        const performedBy = String(form.get('performedBy') || '').trim().slice(0, 120);
        const rawCost = String(form.get('cost') || '').replace(/[^\d]/g, '');
        const cost = rawCost ? Number(rawCost) : null;
        if (cost !== null && (!Number.isFinite(cost) || cost > 1_000_000_000)) throw new ClosureError('El costo no es válido.');

        const { data: task, error: taskError } = await admin.from('maintenance_tasks')
            .select('id, community_id, asset_id, title, status')
            .eq('id', id).eq('community_id', profile.community_id).maybeSingle();
        if (taskError) throw taskError;
        if (!task) throw new ClosureError('La tarea no existe en tu comunidad.', 404);
        if (task.status === 'completed') throw new ClosureError('La tarea ya estaba cerrada.', 409);

        uploadedPath = `${profile.community_id}/${task.id}/${Date.now()}-${randomUUID()}.${extension}`;
        const { error: uploadError } = await admin.storage.from(BUCKET)
            .upload(uploadedPath, Buffer.from(await photo.arrayBuffer()), { contentType: photo.type, upsert: false });
        if (uploadError) throw uploadError;

        const { data: closed, error: closeError } = await admin.from('maintenance_tasks')
            .update({ status: 'completed', completion_photo_path: uploadedPath, completed_by: profile.id, completed_at: new Date().toISOString() })
            .eq('id', task.id).eq('community_id', profile.community_id).eq('status', task.status)
            .select('id, status, completion_photo_path, completed_at').maybeSingle();
        if (closeError) throw closeError;
        if (!closed) throw new ClosureError('La tarea cambió mientras se cerraba. Vuelve a revisarla.', 409);

        const { error: logError } = await admin.from('maintenance_logs').insert({
            community_id: profile.community_id,
            asset_id: task.asset_id,
            task_id: task.id,
            performed_by: performedBy || null,
            description: note || `Cierre de "${String(task.title || 'tarea')}" con foto.`,
            cost,
            date: chileTodayISO(),
            attachments: [uploadedPath],
        });
        if (logError) console.error('[maintenance-complete] no se pudo registrar la bitácora:', logError.message);

        await recordOperationEvent({
            communityId: profile.community_id,
            actorId: profile.id,
            actorRole: profile.role,
            action: 'maintenance.task.completed_with_photo',
            entityType: 'maintenance_task',
            entityId: String(task.id),
            severity: 'success',
            status: 'success',
            summary: `Tarea "${String(task.title || '').slice(0, 80)}" cerrada con foto`,
            metadata: { assetId: task.asset_id, cost, photoPath: uploadedPath },
        });
        return NextResponse.json({ task: closed });
    } catch (error) {
        if (uploadedPath) await admin.storage.from(BUCKET).remove([uploadedPath]).catch(() => undefined);
        if (error instanceof ClosureError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('[maintenance-complete]', error);
        return NextResponse.json({ error: 'No se pudo cerrar la tarea.' }, { status: 500 });
    }
}
