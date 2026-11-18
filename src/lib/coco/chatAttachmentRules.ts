/**
 * Reglas de los adjuntos del chat de CoCo, compartidas por el navegador y el
 * servidor (módulo puro: sin Supabase ni APIs del navegador).
 *
 * Caso que lo motivó (18-11-2026): una persona quiso subir juntos la foto de una
 * factura (.webp) y dos PDF de 7–8 MB del reglamento de copropiedad, uno
 * escaneado. El chat aceptaba un solo archivo por mensaje.
 *
 * - Hasta MAX_CHAT_ATTACHMENTS archivos por mensaje, mezclando imágenes y documentos.
 * - Los documentos no pasan por el cuerpo de /api/coco (Vercel lo corta en
 *   4,5 MB): suben directo al bucket privado y el servidor los lee.
 * - Las imágenes se achican en el navegador antes de ir en el cuerpo, para que
 *   varias quepan juntas bajo ese límite.
 */

import type { CommunityDocumentRead } from '@/lib/types';

export const MAX_CHAT_ATTACHMENTS = 5;
/** Documentos: el mismo tope del bucket community-documents. */
export const MAX_CHAT_DOCUMENT_BYTES = 25 * 1024 * 1024;
/** Imágenes originales: se achican antes de enviarse, así que el original puede pesar más. */
export const MAX_CHAT_IMAGE_BYTES = 20 * 1024 * 1024;
/** Lado mayor de la imagen que se envía (lo que el modelo aprovecha). */
export const CHAT_IMAGE_MAX_SIDE = 1568;
/** Una imagen ya achicada, como data URL. */
export const MAX_CHAT_IMAGE_DATA_URL_CHARS = 1_400_000;
/**
 * Todas las imágenes de un mensaje, como data URL. Con el texto de los
 * documentos (hasta MAX_TURN_DOCUMENT_CHARS) el cuerpo queda bajo los 4,5 MB.
 */
export const MAX_CHAT_IMAGES_TOTAL_CHARS = 3_400_000;
/** Texto de todos los documentos que va en el turno; el resto CoCo lo busca. */
export const MAX_TURN_DOCUMENT_CHARS = 90_000;
/** Texto de un solo documento en el turno (el mismo tope de antes). */
export const MAX_ONE_DOCUMENT_CHARS = 35_000;

export const CHAT_DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'txt', 'xlsx', 'csv'] as const;
export const CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
export const CHAT_FILE_ACCEPT = '.pdf,.docx,.txt,.xlsx,.csv,image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp';

export type ChatAttachmentKind = 'image' | 'document';

export interface ChatAttachmentDraft {
    id: string;
    file: File;
    kind: ChatAttachmentKind;
}

/**
 * Lo que devuelve la lectura de un documento para CoCo. Si las páginas
 * escaneadas no se pudieron transcribir, el documento no se guarda
 * (`documentId` vacío) y `visualPdfPath` indica el PDF que el modelo lee con
 * visión en ese mismo turno.
 */
export type CoCoDocumentRead = Omit<CommunityDocumentRead, 'documentId'> & {
    documentId?: string;
    visualPdfPath?: string;
};

type FileLike = { name: string; type: string; size: number };

const IMAGE_EXTENSIONS: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

function extensionOf(name: string) {
    return name.includes('.') ? name.split('.').at(-1)!.toLowerCase() : '';
}

/** Qué es el archivo, o por qué no se acepta. El tipo sale también de la extensión: el navegador a veces no lo informa. */
export function classifyChatFile(file: FileLike): { kind: ChatAttachmentKind } | { error: string } {
    const extension = extensionOf(file.name);
    const isImage = (CHAT_IMAGE_TYPES as readonly string[]).includes(file.type) || (!file.type && extension in IMAGE_EXTENSIONS)
        || (file.type === 'application/octet-stream' && extension in IMAGE_EXTENSIONS);
    if (isImage) {
        if (file.size <= 0) return { error: `${file.name || 'La imagen'} está vacía.` };
        if (file.size > MAX_CHAT_IMAGE_BYTES) return { error: `${file.name} pesa ${formatBytes(file.size)}: el máximo para imágenes es ${formatBytes(MAX_CHAT_IMAGE_BYTES)}.` };
        return { kind: 'image' };
    }
    if ((CHAT_DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)) {
        if (file.size <= 0) return { error: `${file.name} está vacío.` };
        if (file.size > MAX_CHAT_DOCUMENT_BYTES) return { error: `${file.name} pesa ${formatBytes(file.size)}: el máximo por documento es ${formatBytes(MAX_CHAT_DOCUMENT_BYTES)}.` };
        return { kind: 'document' };
    }
    if (file.type.startsWith('image/')) return { error: `${file.name}: usa una imagen JPG, PNG, GIF o WebP.` };
    return { error: `${file.name}: adjunta PDF, DOCX, TXT, Excel o CSV, o una imagen JPG, PNG, GIF o WebP.` };
}

/**
 * Suma archivos a la lista: descarta los que no se aceptan, los repetidos
 * (mismo nombre y tamaño) y los que pasan del máximo, y dice por qué.
 */
export function addChatAttachments(current: ChatAttachmentDraft[], files: File[], makeId: () => string) {
    const attachments = [...current];
    const rejected: string[] = [];
    let overflow = 0;
    for (const file of files) {
        const classified = classifyChatFile(file);
        if ('error' in classified) { rejected.push(classified.error); continue; }
        if (attachments.some(item => item.file.name === file.name && item.file.size === file.size)) continue;
        if (attachments.length >= MAX_CHAT_ATTACHMENTS) { overflow++; continue; }
        attachments.push({ id: makeId(), file, kind: classified.kind });
    }
    if (overflow) rejected.push(`Puedes adjuntar hasta ${MAX_CHAT_ATTACHMENTS} archivos por mensaje; ${overflow === 1 ? 'quedó fuera 1' : `quedaron fuera ${overflow}`}.`);
    return { attachments, rejected };
}

/**
 * Cuánto texto de cada documento va en el turno: se reparte el total entre los
 * documentos, sin pasar del tope de uno solo. Lo que no cabe queda guardado y
 * CoCo lo encuentra con search_community_documents.
 */
export function documentTextShare(count: number) {
    if (count <= 0) return 0;
    return Math.min(MAX_ONE_DOCUMENT_CHARS, Math.floor(MAX_TURN_DOCUMENT_CHARS / count));
}

/** Tope por imagen ya achicada, según cuántas van en el mensaje. */
export function imageDataUrlBudget(imageCount: number) {
    if (imageCount <= 0) return MAX_CHAT_IMAGE_DATA_URL_CHARS;
    return Math.min(MAX_CHAT_IMAGE_DATA_URL_CHARS, Math.floor(MAX_CHAT_IMAGES_TOTAL_CHARS / imageCount));
}

export function formatBytes(bytes: number) {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',').replace(/,0$/, '')} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
}

/** Lo que se muestra en la burbuja del mensaje enviado. */
export function attachmentSummary(names: string[]) {
    if (!names.length) return '';
    return names.length === 1 ? `Adjunto: ${names[0]}` : `Adjuntos (${names.length}): ${names.join(' · ')}`;
}
