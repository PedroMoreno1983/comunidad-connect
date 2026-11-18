import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

/**
 * Foto de portada del condominio: la que ven la administración y los
 * residentes en el inicio. La sube la administración (pantalla o CoCo).
 */

export const COVER_BUCKET = 'community-covers';
const MAX_BYTES = 8 * 1024 * 1024;
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export class CoverPhotoError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

/** Tipo real por los primeros bytes: una extensión .jpg no garantiza que lo sea. */
export function sniffImageType(bytes: Uint8Array): string | null {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
    return null;
}

/** Ruta dentro del bucket de una URL pública nuestra, o null si es otra (p. ej. la foto por defecto). */
export function coverPathFromUrl(url: string | null | undefined, communityId: string): string | null {
    if (!url) return null;
    const marker = `/storage/v1/object/public/${COVER_BUCKET}/`;
    const index = url.indexOf(marker);
    if (index < 0) return null;
    const path = decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
    // Solo se borra lo de la propia comunidad.
    return path.startsWith(`${communityId}/`) ? path : null;
}

async function currentCover(communityId: string) {
    const { data, error } = await getSupabaseAdmin().from('communities').select('cover_photo_url').eq('id', communityId).maybeSingle();
    if (error) throw error;
    return (data?.cover_photo_url as string | null) ?? null;
}

async function removeOld(communityId: string, previousUrl: string | null) {
    const oldPath = coverPathFromUrl(previousUrl, communityId);
    if (!oldPath) return;
    // Borrar la foto anterior es limpieza: si falla, la nueva igual quedó.
    await getSupabaseAdmin().storage.from(COVER_BUCKET).remove([oldPath]).catch(() => undefined);
}

export async function setCommunityCoverPhoto(communityId: string, file: File | Blob): Promise<string> {
    if (file.size === 0) throw new CoverPhotoError('La imagen está vacía.');
    if (file.size > MAX_BYTES) throw new CoverPhotoError('La foto debe pesar menos de 8 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) throw new CoverPhotoError('Usa una foto JPG, PNG o WebP.');

    const admin = getSupabaseAdmin();
    const previous = await currentCover(communityId);
    const path = `${communityId}/${randomUUID()}.${EXTENSION[type]}`;
    const { error: uploadError } = await admin.storage.from(COVER_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
    if (uploadError) throw uploadError;
    const url = admin.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
    const { error: updateError } = await admin.from('communities').update({ cover_photo_url: url }).eq('id', communityId);
    if (updateError) {
        await admin.storage.from(COVER_BUCKET).remove([path]).catch(() => undefined);
        throw updateError;
    }
    await removeOld(communityId, previous);
    return url;
}

/** Vuelve a la foto genérica. */
export async function resetCommunityCoverPhoto(communityId: string): Promise<void> {
    const previous = await currentCover(communityId);
    const { error } = await getSupabaseAdmin().from('communities').update({ cover_photo_url: null }).eq('id', communityId);
    if (error) throw error;
    await removeOld(communityId, previous);
}
