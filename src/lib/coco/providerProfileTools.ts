import 'server-only';

import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { communityProvidersFilter } from '@/lib/services/providerNetwork';
import { ProviderReviewError, submitProviderReview } from '@/lib/services/providerReviews';
import {
    ProviderMediaError, listProviderDocuments, reviewProviderDocument, uploadProviderDocument, uploadProviderPhoto,
} from '@/lib/services/providerMedia';
import { discardChatImage, takeChatImage } from '@/lib/coco/chatAttachments';
import { isValidRut, namesMatch } from '@/lib/services/providerDocumentRules';
import type { ProviderDocumentAutoCheck, ProviderDocumentKind, ProviderIdentity } from '@/lib/types';

/**
 * Perfil del maestro desde CoCo: valorar (vecinos), revisar documentos
 * (administración) y guardar en el perfil una imagen adjunta al chat
 * (administración o el propio maestro). Mismas reglas que la pantalla: usan
 * los mismos servicios.
 */

type Row = Record<string, unknown>;

function normalize(value: string) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function text(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Un proveedor visible para la comunidad (propio o de la Red) por ID o por nombre. */
async function findProvider(communityId: string, input: Row): Promise<{ provider: ProviderIdentity } | { result: Row }> {
    const id = text(input.provider_id, 64);
    const name = normalize(text(input.provider_name, 120));
    const query = supabaseAdmin.from('service_providers').select('id, name, community_id, user_id, category').or(communityProvidersFilter(communityId));
    const { data } = id ? await query.eq('id', id) : await query;
    let rows = (data || []) as ProviderIdentity[];
    // La confirmación muestra el nombre: se exige siempre y, si viene un ID,
    // tiene que ser de ese maestro. Lo que se aprueba es lo que se ejecuta.
    if (name.length < 2) return { result: { error: 'Indica el nombre del maestro.' } };
    if (id) {
        if (rows[0] && !normalize(String(rows[0].name)).includes(name)) {
            return { result: { error: `El ID corresponde a ${rows[0].name}, no a quien se confirmó. No hice cambios.` } };
        }
    } else {
        rows = rows.filter(row => normalize(String(row.name)).includes(name));
        const exact = rows.filter(row => normalize(String(row.name)) === name);
        if (exact.length === 1) rows = exact;
    }
    if (!rows.length) return { result: { error: 'No encontré a ese maestro en tu comunidad ni en la Red Convive.' } };
    if (rows.length > 1) {
        return { result: {
            success: false, status: 'AMBIGUOUS',
            candidates: rows.slice(0, 5).map(row => ({ id: row.id, name: row.name })),
            message: 'Hay más de un maestro con ese nombre. Pregunta a cuál te refieres.',
        } };
    }
    return { provider: rows[0] };
}

function failure(error: unknown) {
    if (error instanceof ProviderMediaError || error instanceof ProviderReviewError) return { error: error.message };
    console.error('[coco provider profile]', error instanceof Error ? error.message : error);
    return { error: 'No se pudo completar la acción.' };
}

export async function rateProviderForUser(userId: string, communityId: string, input: Row) {
    const found = await findProvider(communityId, input);
    if ('result' in found) return found.result;
    try {
        const { verifiedService } = await submitProviderReview(userId, {
            providerId: found.provider.id, rating: Number(input.rating), comment: text(input.comment, 1200),
            // El oficio del maestro, igual que la reseña desde su perfil.
            serviceType: found.provider.category || undefined,
        });
        return {
            success: true,
            message: `Reseña publicada para ${found.provider.name}${verifiedService ? ' (aparece como servicio verificado)' : ''}. Si ya lo habías valorado, se actualizó tu reseña.`,
        };
    } catch (error) {
        return failure(error);
    }
}

/** La administración solo revisa maestros de su comunidad; los de la Red los revisa Convive. */
async function communityProviderForAdmin(communityId: string, input: Row): Promise<{ provider: ProviderIdentity } | { result: Row }> {
    const found = await findProvider(communityId, input);
    if ('result' in found) return found;
    if (found.provider.community_id !== communityId) {
        return { result: { error: `${found.provider.name} es de la Red Convive: sus documentos los revisa Convive.` } };
    }
    return found;
}

/** El chequeo automático sin identificadores: solo veredicto y banderas. */
export function redactedCheck(kind: ProviderDocumentKind, check: ProviderDocumentAutoCheck, providerName: string) {
    const extracted = check.extracted;
    if (!extracted) return { verdict: check.verdict, readable: false };
    const age = extracted.issueDate
        ? Math.floor((Date.now() - Date.parse(`${extracted.issueDate}T00:00:00Z`)) / 86_400_000)
        : null;
    return {
        verdict: check.verdict,
        readable: true,
        expected_document_type: extracted.documentType === kind,
        rut_valid: extracted.rut ? isValidRut(extracted.rut) : null,
        name_matches_profile: extracted.fullName ? namesMatch(extracted.fullName, providerName) : null,
        ...(kind === 'background_certificate'
            ? { days_since_issue: age, no_records: extracted.hasRecords === null ? null : !extracted.hasRecords }
            : { expired: extracted.expiryDate ? extracted.expiryDate < new Date().toISOString().slice(0, 10) : null }),
    };
}

export async function listProviderDocumentsForAdmin(communityId: string, input: Row) {
    const found = await communityProviderForAdmin(communityId, input);
    if ('result' in found) return found.result;
    const documents = await listProviderDocuments(found.provider.id, true);
    // El chat se guarda: sin el archivo ni datos del documento (RUT, nombre,
    // folio). Solo el veredicto y los chequeos como sí/no; el detalle se ve en
    // el perfil del maestro.
    return {
        provider: found.provider.name,
        documents: documents.map(document => ({
            document_id: document.id,
            kind_code: document.kind,
            kind: document.kind === 'background_certificate' ? 'certificado de antecedentes' : 'cédula de identidad',
            uploaded: document.createdAt.slice(0, 10),
            status: document.status,
            auto_check: document.autoCheck ? redactedCheck(document.kind, document.autoCheck, found.provider.name) : null,
            review_note: document.reviewNote,
        })),
        // El texto de CoCo tapa los UUID: el perfil se abre con NAVEGAR, que sí
        // acepta /services/provider/<uuid> (getSafeCoCoNavigation).
        navigate_to_profile: `NAVEGAR:/services/provider/${found.provider.id}`,
        message: documents.length
            ? 'Para ver el archivo, ofrece abrir el perfil del maestro escribiendo navigate_to_profile tal cual al final de tu respuesta.'
            : 'El maestro todavía no sube documentos.',
    };
}

export async function reviewProviderDocumentForAdmin(communityId: string, adminId: string, input: Row) {
    const found = await communityProviderForAdmin(communityId, input);
    if ('result' in found) return found.result;
    const approve = input.decision === 'approve';
    if (!approve && input.decision !== 'reject') return { error: 'Indica si apruebas o rechazas el documento.' };
    // Lo que se aprueba es el documento que mostró la confirmación: tipo y fecha
    // tienen que calzar con el document_id.
    const documentId = text(input.document_id, 64);
    const document = (await listProviderDocuments(found.provider.id, false)).find(item => item.id === documentId);
    if (!document) return { error: 'No encontré ese documento del maestro.' };
    if (document.kind !== input.document_kind || document.createdAt.slice(0, 10) !== text(input.uploaded_on, 10)) {
        return { error: 'El documento no calza con el que se confirmó (tipo o fecha). No hice cambios: vuelve a listar los documentos.' };
    }
    try {
        await reviewProviderDocument(found.provider.id, documentId, approve, text(input.note, 300) || null, { id: adminId, role: 'admin' });
        return {
            success: true,
            message: approve
                ? `Documento aprobado: el perfil de ${found.provider.name} ya lo muestra como revisado.`
                : `Documento rechazado. ${found.provider.name} verá el motivo en su perfil.`,
        };
    } catch (error) {
        return failure(error);
    }
}

const ATTACHMENT_KINDS = ['profile_photo', 'work_photo', 'background_certificate', 'identity'] as const;

/** Pone en el perfil de un maestro una imagen adjunta al chat. */
export async function saveProviderAttachment(user: { id: string; role: string; communityId: string }, input: Row) {
    const kind = text(input.kind, 40) as typeof ATTACHMENT_KINDS[number];
    if (!ATTACHMENT_KINDS.includes(kind)) return { error: 'Indica si es foto de perfil, foto de trabajo, certificado de antecedentes o cédula.' };
    const found = await findProvider(user.communityId, input);
    if ('result' in found) return found.result;
    const isOwner = found.provider.user_id === user.id;
    const isCommunityAdmin = user.role === 'admin' && found.provider.community_id === user.communityId;
    if (!isOwner && !isCommunityAdmin) {
        return { error: found.provider.community_id === null
            ? `${found.provider.name} es de la Red Convive: su perfil lo gestiona Convive o él mismo con su enlace.`
            : 'Solo el maestro o la administración de su comunidad pueden cambiar su perfil.' };
    }
    const attachment = await takeChatImage(user.id, text(input.attachment_id, 64));
    if (!attachment) return { error: 'No encontré la imagen adjunta. Pide que la vuelva a enviar en el chat.' };
    const actor = { id: user.id, role: isCommunityAdmin ? 'admin' : 'provider' };
    try {
        if (kind === 'profile_photo' || kind === 'work_photo') {
            await uploadProviderPhoto(found.provider.id, kind === 'profile_photo' ? 'profile' : 'work', attachment.file, text(input.caption, 160) || null, actor);
            await discardChatImage(attachment.path);
            return { success: true, message: `${kind === 'profile_photo' ? 'Foto de perfil' : 'Foto de trabajo'} de ${found.provider.name} guardada.` };
        }
        const { verdict } = await uploadProviderDocument(found.provider.id, kind, attachment.file, actor, 'coco_chat');
        await discardChatImage(attachment.path);
        const verdictText = verdict === 'looks_ok' ? 'el chequeo automático no encontró problemas'
            : verdict === 'problem' ? 'el chequeo automático encontró problemas' : 'hay que revisarlo a mano';
        return {
            success: true,
            message: `Documento de ${found.provider.name} recibido; ${verdictText}. Queda pendiente de aprobación de la administración${found.provider.community_id ? '' : ' (Convive, por ser de la Red)'}.`,
        };
    } catch (error) {
        return failure(error);
    }
}
