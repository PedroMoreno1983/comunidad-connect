import 'server-only';

import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { ChatAttachmentStash, ChatAttachmentState } from '@/lib/types';

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
    const item = (items || []).find(entry => entry.name.startsWith(`${attachmentId}.`) || entry.name.startsWith(`claimed-${attachmentId}.`));
    return item ? { name: item.name, path: `${folder(userId)}/${item.name}` } : null;
}

/** Recupera un adjunto del mismo usuario. */
export async function takeChatImage(userId: string, attachmentId: string): Promise<{ file: File; path: string } | null> {
    const found = await findAttachment(userId, attachmentId);
    // Ya reclamado por otra aprobación: no se vuelve a usar.
    if (!found || found.name.startsWith('claimed-')) return null;
    // Reclamo atómico: se mueve el archivo antes de usarlo. Si dos aprobaciones
    // llegan juntas, solo una logra moverlo; la otra no encuentra la imagen y no
    // sube un duplicado. Lo reclamado sigue en la carpeta del usuario, así que la
    // limpieza del scheduler lo borra si algo falla después.
    const storage = getSupabaseAdmin().storage.from(BUCKET);
    const claimed = `${folder(userId)}/claimed-${found.name}`;
    const { error: claimError } = await storage.move(found.path, claimed);
    if (claimError) return null;
    const { data: blob, error } = await storage.download(claimed);
    if (error || !blob) return null;
    const type = Object.entries(EXTENSION).find(([, ext]) => found.name.endsWith(`.${ext}`))?.[0] || 'image/jpeg';
    return { file: new File([await blob.arrayBuffer()], found.name, { type }), path: claimed };
}

/** La imagen sigue disponible para usarse (existe y nadie la reclamó). */
export async function chatAttachmentAvailable(userId: string, attachmentId: string) {
    const found = await findAttachment(userId, attachmentId);
    return Boolean(found && !found.name.startsWith('claimed-'));
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
const PAGE = 1000;

/** Todas las entradas de una carpeta, página por página (el listado de Storage corta en PAGE). */
async function listAll(path: string) {
    const storage = getSupabaseAdmin().storage.from(BUCKET);
    const entries: { name: string; created_at?: string | null }[] = [];
    for (let offset = 0; ; offset += PAGE) {
        const { data } = await storage.list(path, { limit: PAGE, offset });
        entries.push(...(data || []));
        if (!data || data.length < PAGE) return entries;
    }
}

export async function purgeStaleChatAttachments(now = Date.now()) {
    const storage = getSupabaseAdmin().storage.from(BUCKET);
    let removed = 0;
    for (const entry of await listAll(ROOT)) {
        if (!UUID.test(entry.name)) continue;
        const stale = (await listAll(folder(entry.name)))
            .filter(file => file.created_at && now - Date.parse(file.created_at) > MAX_AGE_MS)
            .map(file => `${folder(entry.name)}/${file.name}`);
        for (let index = 0; index < stale.length; index += PAGE) {
            await storage.remove(stale.slice(index, index + PAGE));
        }
        removed += stale.length;
    }
    return { removed };
}

/** Solo se guarda la imagen de quien puede ponerla en un perfil: la administración o un maestro con cuenta. */
export async function canAttachToProviders(userId: string, role: string) {
    if (role === 'admin') return true;
    const { count } = await getSupabaseAdmin().from('service_providers').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    return Boolean(count);
}

/** El adjunto guardado en la sesión, mientras siga vigente (un día, igual que el archivo). */
export function currentChatAttachment(state: ChatAttachmentState | undefined, now = Date.now()): ChatAttachmentState | undefined {
    if (!state?.at) return undefined;
    return now - Date.parse(state.at) <= MAX_AGE_MS ? state : undefined;
}

/** Contexto de sistema para que CoCo sepa si puede usar la imagen (no va en el mensaje). */
export function attachmentNote(stash: ChatAttachmentStash) {
    if (stash.status === 'stored') {
        return `\n\n[La última imagen que la persona adjuntó en esta conversación está disponible: adjunto_id=${stash.id}. Si la persona pide ponerla en el perfil de un maestro (foto, trabajo o documento), usa save_provider_attachment con este adjunto_id.]`;
    }
    if (stash.status === 'unsupported') {
        return '\n\n[La imagen adjunta es GIF: no se puede guardar en el perfil de un maestro. Si la persona lo pide, dile que la envíe como JPG, PNG o WEBP.]';
    }
    return '\n\n[La imagen adjunta no se pudo guardar para usarla en un perfil. Si la persona lo pide, dile que la vuelva a enviar.]';
}
