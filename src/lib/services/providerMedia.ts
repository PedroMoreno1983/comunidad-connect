import 'server-only';

import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordOperationEvent, recordPlatformOperationEvent } from '@/lib/operations/audit';
import { checkProviderDocument } from '@/lib/services/providerDocumentCheck';
import type { ProviderDocument, ProviderDocumentAutoCheck, ProviderDocumentKind, ProviderWorkPhoto } from '@/lib/types';

/**
 * Foto de perfil, fotos de trabajos y documentos de un maestro. Quien llama ya
 * comprobó que puede gestionar a este proveedor (dueño, administración de su
 * comunidad, Convive o el enlace del maestro). Aquí: tipo real del archivo,
 * tamaño, almacenamiento y bitácora.
 */

export class ProviderMediaError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

const MEDIA_BUCKET = 'provider-media';
const DOCUMENTS_BUCKET = 'provider-documents';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_WORK_PHOTOS = 12;
const DOCUMENT_KINDS: ProviderDocumentKind[] = ['background_certificate', 'identity'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tipo real por los primeros bytes: no se confía en lo que declara el navegador. */
export function sniffFileType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
    if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
    return null;
}

const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

type ProviderRef = { id: string; name: string; community_id: string | null };

async function loadProvider(providerId: string): Promise<ProviderRef> {
    if (!UUID.test(providerId)) throw new ProviderMediaError('Proveedor no válido.', 400);
    const { data } = await getSupabaseAdmin().from('service_providers').select('id, name, community_id').eq('id', providerId).maybeSingle();
    if (!data) throw new ProviderMediaError('Proveedor no encontrado.', 404);
    return { id: String(data.id), name: String(data.name), community_id: data.community_id ? String(data.community_id) : null };
}

async function audit(provider: ProviderRef, actor: MediaActor, action: string, summary: string, metadata: Record<string, unknown> = {}) {
    if (provider.community_id) {
        await recordOperationEvent({
            communityId: provider.community_id, actorId: actor.id, actorRole: actor.role, action,
            entityType: 'service_provider', entityId: provider.id, severity: 'success', status: 'success', summary, metadata,
        });
    } else {
        await recordPlatformOperationEvent({
            actorId: actor.id, actorEmail: actor.email, action, entityType: 'service_provider', entityId: provider.id, summary,
            metadata: { ...metadata, actorRole: actor.role },
        });
    }
}

/** Quién hace el cambio: un usuario (id) o el maestro con su enlace (id null). */
export type MediaActor = { id: string | null; role: string; email?: string | null };

function readFile(file: File | null, maxBytes: number, allowed: string[]) {
    if (!file) throw new ProviderMediaError('Archivo no recibido.', 400);
    if (file.size > maxBytes) throw new ProviderMediaError(`El archivo no puede superar ${Math.round(maxBytes / 1024 / 1024)} MB.`, 400);
    return file.arrayBuffer().then(arrayBuffer => {
        const buffer = Buffer.from(arrayBuffer);
        const type = sniffFileType(buffer);
        if (!type || !allowed.includes(type)) {
            throw new ProviderMediaError(allowed.includes('application/pdf') ? 'Sube un PDF o una foto (JPG, PNG o WEBP).' : 'Sube una foto JPG, PNG o WEBP.', 400);
        }
        return { buffer, type };
    });
}

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function uploadProviderPhoto(providerId: string, kind: 'profile' | 'work', file: File | null, caption: string | null, actor: MediaActor) {
    const provider = await loadProvider(providerId);
    const { buffer, type } = await readFile(file, MAX_PHOTO_BYTES, PHOTO_TYPES);
    const admin = getSupabaseAdmin();
    if (kind === 'work') {
        const { count } = await admin.from('service_provider_photos').select('id', { count: 'exact', head: true }).eq('provider_id', provider.id);
        if ((count ?? 0) >= MAX_WORK_PHOTOS) throw new ProviderMediaError(`Hasta ${MAX_WORK_PHOTOS} fotos de trabajos: borra una para subir otra.`, 409);
    }
    const path = `${provider.id}/${kind === 'profile' ? 'perfil' : 'trabajos'}/${randomUUID()}.${EXTENSION[type]}`;
    const { error: uploadError } = await admin.storage.from(MEDIA_BUCKET).upload(path, buffer, { contentType: type, upsert: false });
    if (uploadError) throw new ProviderMediaError('No se pudo subir la foto.', 500);
    const { data: { publicUrl } } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);

    if (kind === 'profile') {
        const { data: previous } = await admin.from('service_providers').select('photo').eq('id', provider.id).maybeSingle();
        const { error } = await admin.from('service_providers').update({ photo: publicUrl }).eq('id', provider.id);
        if (error) throw new ProviderMediaError('No se pudo guardar la foto.', 500);
        // La anterior, si era de nuestro bucket, se borra.
        const marker = `/${MEDIA_BUCKET}/`;
        const old = typeof previous?.photo === 'string' && previous.photo.includes(marker) ? previous.photo.split(marker)[1] : null;
        if (old) await admin.storage.from(MEDIA_BUCKET).remove([old]);
        await audit(provider, actor, 'service_provider.photo_updated', `Foto de perfil actualizada: ${provider.name}`);
        return { url: publicUrl };
    }
    const { data, error } = await admin.from('service_provider_photos').insert({
        provider_id: provider.id, storage_path: path, url: publicUrl, caption: caption ? caption.trim().slice(0, 160) : null,
    }).select('id, url, caption, created_at').single();
    if (error || !data) {
        await admin.storage.from(MEDIA_BUCKET).remove([path]);
        throw new ProviderMediaError('No se pudo guardar la foto.', 500);
    }
    await audit(provider, actor, 'service_provider.work_photo_added', `Foto de trabajo agregada: ${provider.name}`);
    return { url: publicUrl, photo: { id: String(data.id), url: String(data.url), caption: data.caption ? String(data.caption) : null, createdAt: String(data.created_at) } };
}

export async function deleteWorkPhoto(providerId: string, photoId: string, actor: MediaActor) {
    const provider = await loadProvider(providerId);
    if (!UUID.test(photoId)) throw new ProviderMediaError('Foto no válida.', 400);
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('service_provider_photos').select('id, storage_path').eq('id', photoId).eq('provider_id', provider.id).maybeSingle();
    if (!data) throw new ProviderMediaError('Foto no encontrada.', 404);
    await admin.from('service_provider_photos').delete().eq('id', photoId);
    await admin.storage.from(MEDIA_BUCKET).remove([String(data.storage_path)]);
    await audit(provider, actor, 'service_provider.work_photo_removed', `Foto de trabajo borrada: ${provider.name}`);
}

export async function listWorkPhotos(providerId: string): Promise<ProviderWorkPhoto[]> {
    const { data } = await getSupabaseAdmin().from('service_provider_photos')
        .select('id, url, caption, created_at').eq('provider_id', providerId).order('created_at', { ascending: false }).limit(MAX_WORK_PHOTOS);
    return (data || []).map(row => ({ id: String(row.id), url: String(row.url), caption: row.caption ? String(row.caption) : null, createdAt: String(row.created_at) }));
}

export async function uploadProviderDocument(providerId: string, kind: string, file: File | null, actor: MediaActor, via: string) {
    if (!DOCUMENT_KINDS.includes(kind as ProviderDocumentKind)) throw new ProviderMediaError('Tipo de documento no válido.', 400);
    const provider = await loadProvider(providerId);
    const { buffer, type } = await readFile(file, MAX_DOCUMENT_BYTES, [...PHOTO_TYPES, 'application/pdf']);
    const admin = getSupabaseAdmin();
    const path = `${provider.id}/${kind}/${randomUUID()}.${EXTENSION[type]}`;
    const { error: uploadError } = await admin.storage.from(DOCUMENTS_BUCKET).upload(path, buffer, { contentType: type, upsert: false });
    if (uploadError) throw new ProviderMediaError('No se pudo subir el documento.', 500);

    const autoCheck = await checkProviderDocument({
        kind: kind as ProviderDocumentKind, buffer, mimeType: type, providerName: provider.name, communityId: provider.community_id,
    });
    const { data, error } = await admin.from('service_provider_documents').insert({
        provider_id: provider.id, kind, storage_path: path,
        file_name: String(file?.name || `documento.${EXTENSION[type]}`).slice(0, 160),
        mime_type: type, size_bytes: buffer.length, auto_check: autoCheck,
        issued_on: autoCheck.extracted?.issueDate ?? null, uploaded_via: via,
    }).select('id').single();
    if (error || !data) {
        await admin.storage.from(DOCUMENTS_BUCKET).remove([path]);
        throw new ProviderMediaError('No se pudo guardar el documento.', 500);
    }
    // En la bitácora va el veredicto, no los datos personales del documento.
    await audit(provider, actor, 'service_provider.document_uploaded', `Documento subido para revisión: ${provider.name}`, { kind, verdict: autoCheck.verdict });
    return { id: String(data.id), verdict: autoCheck.verdict };
}

/**
 * Documentos de un maestro. `forReviewer` agrega el chequeo automático y un
 * enlace temporal (10 minutos) para verlo; el maestro solo ve el estado.
 */
export async function listProviderDocuments(providerId: string, forReviewer: boolean): Promise<ProviderDocument[]> {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('service_provider_documents')
        .select('id, kind, file_name, status, created_at, reviewed_at, review_note, auto_check, storage_path')
        .eq('provider_id', providerId).order('created_at', { ascending: false }).limit(20);
    const rows = data || [];
    const links = new Map<string, string>();
    if (forReviewer && rows.length) {
        const { data: signed } = await admin.storage.from(DOCUMENTS_BUCKET).createSignedUrls(rows.map(row => String(row.storage_path)), 600);
        for (const item of signed || []) if (item.path && item.signedUrl) links.set(item.path, item.signedUrl);
    }
    return rows.map(row => ({
        id: String(row.id),
        kind: row.kind as ProviderDocumentKind,
        fileName: String(row.file_name),
        status: row.status as ProviderDocument['status'],
        createdAt: String(row.created_at),
        reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
        reviewNote: row.review_note ? String(row.review_note) : null,
        ...(forReviewer ? {
            autoCheck: row.auto_check as ProviderDocumentAutoCheck,
            viewUrl: links.get(String(row.storage_path)) ?? null,
        } : {}),
    }));
}

/**
 * Aprobar o rechazar. Aprobar marca al proveedor (background_checked_at o
 * identity_checked_at), que es lo que ven los vecinos.
 */
export async function reviewProviderDocument(providerId: string, documentId: string, approve: boolean, note: string | null, actor: MediaActor) {
    const provider = await loadProvider(providerId);
    if (!UUID.test(documentId)) throw new ProviderMediaError('Documento no válido.', 400);
    if (!approve && !note?.trim()) throw new ProviderMediaError('Indica el motivo del rechazo: el maestro lo verá.', 400);
    const admin = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data: document, error } = await admin.from('service_provider_documents')
        .update({ status: approve ? 'approved' : 'rejected', review_note: note?.trim().slice(0, 300) || null, reviewed_by: actor.id, reviewed_at: now })
        .eq('id', documentId).eq('provider_id', provider.id).eq('status', 'pending')
        .select('id, kind').maybeSingle();
    if (error) throw new ProviderMediaError('No se pudo guardar la revisión.', 500);
    if (!document) throw new ProviderMediaError('Ese documento ya fue revisado o no existe.', 409);
    if (approve) {
        const column = document.kind === 'background_certificate' ? 'background_checked_at' : 'identity_checked_at';
        const { error: markError } = await admin.from('service_providers').update({ [column]: now }).eq('id', provider.id);
        if (markError) throw new ProviderMediaError('Se aprobó, pero no se pudo marcar el perfil.', 500);
    }
    await audit(provider, actor, approve ? 'service_provider.document_approved' : 'service_provider.document_rejected',
        `${approve ? 'Documento aprobado' : 'Documento rechazado'}: ${provider.name}`, { kind: document.kind });
}
