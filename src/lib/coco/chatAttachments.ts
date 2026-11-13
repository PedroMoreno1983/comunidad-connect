import 'server-only';

import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { ChatAttachmentStash } from '@/lib/types';

/**
 * Imagen que alguien adjunta al chat de CoCo, guardada aparte para que una
 * herramienta la pueda usar (por ejemplo, ponerla en el perfil de un maestro).
 * El modelo solo ve un adjunto_id; el archivo vive en el bucket privado
 * provider-documents, bajo chat/<usuario>/, y solo lo recupera ese usuario.
 * Se borra al usarlo, al rechazar la acción, o en la limpieza del scheduler
 * (cada 15 minutos) cuando tiene más de un día.
 */

const BUCKET = 'provider-documents';
const ROOT = 'chat';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function folder(userId: string) {
    return `${ROOT}/${userId}`;
}

/** Guarda la imagen. `unsupported` si el formato no se puede poner en un perfil (GIF). */
export async function stashChatImage(userId: string, image: { mediaType: string; data: string }): Promise<ChatAttachmentStash> {
    const extension = EXTENSION[image.mediaType];
    if (!extension) return { status: 'unsupported' };
    if (!UUID.test(userId)) return { status: 'failed' };
    try {
        const id = randomUUID();
        const { error } = await getSupabaseAdmin().storage.from(BUCKET)
            .upload(`${folder(userId)}/${id}.${extension}`, Buffer.from(image.data, 'base64'), { contentType: image.mediaType, upsert: false });
        return error ? { status: 'failed' } : { status: 'stored', id };
    } catch {
        return { status: 'failed' };
    }
}

async function findAttachment(userId: string, attachmentId: string) {
    if (!UUID.test(userId) || !UUID.test(attachmentId)) return null;
    const { data: items } = await getSupabaseAdmin().storage.from(BUCKET).list(folder(userId), { search: attachmentId, limit: 5 });
    const item = (items || []).find(entry => entry.name.startsWith(`${attachmentId}.`));
    return item ? { name: item.name, path: `${folder(userId)}/${item.name}` } : null;
}

/** Recupera un adjunto del mismo usuario. */
export async function takeChatImage(userId: string, attachmentId: string): Promise<{ file: File; path: string } | null> {
    const found = await findAttachment(userId, attachmentId);
    if (!found) return null;
    const { data: blob, error } = await getSupabaseAdmin().storage.from(BUCKET).download(found.path);
    if (error || !blob) return null;
    const type = Object.entries(EXTENSION).find(([, ext]) => found.name.endsWith(`.${ext}`))?.[0] || 'image/jpeg';
    return { file: new File([await blob.arrayBuffer()], found.name, { type }), path: found.path };
}

export async function discardChatImage(path: string) {
    await getSupabaseAdmin().storage.from(BUCKET).remove([path]);
}

/** Borra un adjunto por su id (por ejemplo, al rechazar la acción que lo usaba). */
export async function discardChatAttachment(userId: string, attachmentId: string) {
    const found = await findAttachment(userId, attachmentId);
    if (found) await discardChatImage(found.path);
}

/** Limpieza independiente: borra los adjuntos de más de un día de todos los usuarios. */
export async function purgeStaleChatAttachments(now = Date.now()) {
    const storage = getSupabaseAdmin().storage.from(BUCKET);
    const { data: folders } = await storage.list(ROOT, { limit: 1000 });
    let removed = 0;
    for (const entry of folders || []) {
        if (!UUID.test(entry.name)) continue;
        const { data: files } = await storage.list(folder(entry.name), { limit: 1000 });
        const stale = (files || []).filter(file => file.created_at && now - Date.parse(file.created_at) > MAX_AGE_MS)
            .map(file => `${folder(entry.name)}/${file.name}`);
        if (stale.length) {
            await storage.remove(stale);
            removed += stale.length;
        }
    }
    return { removed };
}

/** Solo se guarda la imagen de quien puede ponerla en un perfil: la administración o un maestro con cuenta. */
export async function canAttachToProviders(userId: string, role: string) {
    if (role === 'admin') return true;
    const { count } = await getSupabaseAdmin().from('service_providers').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    return Boolean(count);
}

/** Nota que se agrega al mensaje para que CoCo sepa si puede usar la imagen. */
export function attachmentNote(stash: ChatAttachmentStash) {
    if (stash.status === 'stored') {
        return `\n\n[Imagen adjunta disponible: adjunto_id=${stash.id}. Si la persona pide ponerla en el perfil de un maestro (foto, trabajo o documento), usa save_provider_attachment con este adjunto_id.]`;
    }
    if (stash.status === 'unsupported') {
        return '\n\n[La imagen adjunta es GIF: no se puede guardar en el perfil de un maestro. Si la persona lo pide, dile que la envíe como JPG, PNG o WEBP.]';
    }
    return '\n\n[La imagen adjunta no se pudo guardar para usarla en un perfil. Si la persona lo pide, dile que la vuelva a enviar.]';
}
