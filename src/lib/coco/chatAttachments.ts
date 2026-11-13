import 'server-only';

import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

/**
 * Imagen que alguien adjunta al chat de CoCo, guardada aparte para que una
 * herramienta la pueda usar (por ejemplo, ponerla en el perfil de un maestro).
 * El modelo solo ve un adjunto_id; el archivo vive en el bucket privado
 * provider-documents, bajo chat/<usuario>/, y solo lo recupera ese usuario. Se
 * borra al usarlo, y las que nadie usó, al día siguiente.
 */

const BUCKET = 'provider-documents';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function folder(userId: string) {
    return `chat/${userId}`;
}

/** Guarda la imagen y devuelve su adjunto_id, o null si no se pudo (el chat sigue igual). */
export async function stashChatImage(userId: string, image: { mediaType: string; data: string }): Promise<string | null> {
    const extension = EXTENSION[image.mediaType];
    if (!UUID.test(userId) || !extension) return null;
    const admin = getSupabaseAdmin();
    try {
        // Limpieza de lo que quedó sin usar.
        const { data: old } = await admin.storage.from(BUCKET).list(folder(userId), { limit: 100 });
        const stale = (old || []).filter(item => item.created_at && Date.now() - Date.parse(item.created_at) > MAX_AGE_MS)
            .map(item => `${folder(userId)}/${item.name}`);
        if (stale.length) await admin.storage.from(BUCKET).remove(stale);

        const id = randomUUID();
        const { error } = await admin.storage.from(BUCKET)
            .upload(`${folder(userId)}/${id}.${extension}`, Buffer.from(image.data, 'base64'), { contentType: image.mediaType, upsert: false });
        return error ? null : id;
    } catch {
        return null;
    }
}

/** Recupera un adjunto del mismo usuario. */
export async function takeChatImage(userId: string, attachmentId: string): Promise<{ file: File; path: string } | null> {
    if (!UUID.test(userId) || !UUID.test(attachmentId)) return null;
    const admin = getSupabaseAdmin();
    const { data: items } = await admin.storage.from(BUCKET).list(folder(userId), { search: attachmentId, limit: 5 });
    const item = (items || []).find(entry => entry.name.startsWith(`${attachmentId}.`));
    if (!item) return null;
    const path = `${folder(userId)}/${item.name}`;
    const { data: blob, error } = await admin.storage.from(BUCKET).download(path);
    if (error || !blob) return null;
    const type = Object.entries(EXTENSION).find(([, ext]) => item.name.endsWith(`.${ext}`))?.[0] || 'image/jpeg';
    return { file: new File([await blob.arrayBuffer()], item.name, { type }), path };
}

export async function discardChatImage(path: string) {
    await getSupabaseAdmin().storage.from(BUCKET).remove([path]);
}

/** Solo se guarda la imagen de quien puede ponerla en un perfil: la administración o un maestro con cuenta. */
export async function canAttachToProviders(userId: string, role: string) {
    if (role === 'admin') return true;
    const { count } = await getSupabaseAdmin().from('service_providers').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    return Boolean(count);
}

/** Nota que se agrega al mensaje para que CoCo sepa que puede usar la imagen. */
export function attachmentNote(attachmentId: string) {
    return `\n\n[Imagen adjunta disponible: adjunto_id=${attachmentId}. Si la persona pide ponerla en el perfil de un maestro (foto, trabajo o documento), usa save_provider_attachment con este adjunto_id.]`;
}
