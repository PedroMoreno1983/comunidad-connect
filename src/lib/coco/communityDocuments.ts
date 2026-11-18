import 'server-only';

import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordOperationEvent } from '@/lib/operations/audit';
import { enforceAiBudget, recordAiUsage } from '@/lib/ai/budget';
import { spreadsheetBufferToText } from '@/lib/server/spreadsheetText';
import type { CommunityDocumentHit, CommunityDocumentKind } from '@/lib/types';
import type { CoCoDocumentRead } from '@/lib/coco/chatAttachmentRules';

/**
 * DOCUMENTOS DE LA COMUNIDAD QUE CoCo LEE COMPLETOS (18-11-2026).
 *
 * Caso que lo motivó: el reglamento de Bahía Las Palmas (1998) son 42 páginas
 * y 7 MB; las primeras 9 tienen texto y las otras 33 son escaneos. El reparto
 * de gastos comunes está en el Artículo Quinto, página 11. CoCo antes aceptaba
 * hasta 5 MB y, si había algo de texto, ignoraba las páginas escaneadas: no
 * habría llegado nunca a ese artículo.
 *
 * Ahora: el archivo sube directo al bucket privado (Vercel corta los cuerpos
 * en 4,5 MB), aquí se lee página por página, las páginas sin texto se
 * transcriben con Gemini (que lee PDF escaneados), y se guarda cada página con
 * búsqueda en español. CoCo busca y cita la página.
 */

export const DOCUMENTS_BUCKET = 'community-documents';
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
/** Una página con menos texto que esto se trata como escaneada. */
const SCANNED_PAGE_CHARS = 120;
/** Lo que se le pasa a CoCo en el mismo turno; el resto lo encuentra buscando. */
const TURN_TEXT_CHARS = 35_000;
/**
 * Gemini recibe el PDF en línea, codificado en base64 (un tercio más) dentro de
 * un pedido de hasta 20 MB: 14 MB de archivo es el máximo seguro.
 */
const MAX_OCR_BYTES = 14 * 1024 * 1024;
/**
 * Si la transcripción de las páginas escaneadas falla (sin clave de Gemini,
 * error o páginas que no vuelven), el PDF se le pasa al modelo del chat como
 * documento PDF, que lo lee con visión, solo para ese turno y sin guardarlo a
 * medias. Anthropic acepta pedidos de hasta 32 MB y 100 páginas de PDF; en
 * base64 el archivo crece un tercio, así que el tope es 18 MB.
 */
export const MAX_VISUAL_PDF_BYTES = 18 * 1024 * 1024;
export const MAX_VISUAL_PDF_PAGES = 100;
/** Documentos sin páginas (Word, texto, planillas) se guardan en secciones de este largo. */
const SECTION_CHARS = 3_500;

export class CommunityDocumentError extends Error {
    constructor(message: string, readonly status = 400) { super(message); }
}

export function documentExtension(fileName: string) {
    const extension = fileName.split('.').at(-1)?.toLowerCase() || '';
    return ['pdf', 'docx', 'txt', 'xlsx', 'csv'].includes(extension) ? extension as 'pdf' | 'docx' | 'txt' | 'xlsx' | 'csv' : null;
}

/** Ruta en el bucket: la comunidad y quien sube, más un id. Sin el nombre original (puede traer datos). */
export function documentStoragePath(communityId: string, userId: string, fileName: string) {
    const extension = documentExtension(fileName);
    if (!extension) throw new CommunityDocumentError('Usa PDF, DOCX, TXT, XLSX o CSV.');
    return `${communityId}/${userId}/${randomUUID()}.${extension}`;
}

/** URL firmada para subir el archivo directo al bucket desde el navegador. */
export async function createDocumentUpload(communityId: string, userId: string, fileName: string, size: number) {
    if (!Number.isFinite(size) || size <= 0) throw new CommunityDocumentError('Adjunta un documento.');
    if (size > MAX_DOCUMENT_BYTES) throw new CommunityDocumentError('El máximo es 25 MB.', 413);
    const path = documentStoragePath(communityId, userId, fileName);
    const { data, error } = await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new CommunityDocumentError('No pude preparar la subida.', 500);
    return { path, token: data.token };
}

type PageText = { page: number; text: string; ocr: boolean };
type OcrBudget = { communityId: string; userId: string };

function clean(text: string) {
    return text.replace(/\0/g, '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

async function pdfPages(bytes: Buffer): Promise<PageText[]> {
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new CommunityDocumentError('El archivo no es un PDF válido.');
    await import('pdf-parse/worker');
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    try {
        const extracted = await parser.getText();
        const pages = (extracted.pages || []) as Array<{ num: number; text: string }>;
        return pages.map(page => ({ page: Number(page.num), text: clean(String(page.text || '')), ocr: false }));
    } finally {
        await parser.destroy();
    }
}

/** Páginas que no traen texto suficiente: escaneos. */
export function scannedPages(pages: PageText[]) {
    return pages.filter(page => page.text.replace(/\s/g, '').length < SCANNED_PAGE_CHARS).map(page => page.page);
}

/**
 * Transcribe con Gemini las páginas escaneadas. Gemini recibe el PDF completo
 * (lo lee como imágenes) y devuelve solo las páginas pedidas, textuales.
 * Pasa por el presupuesto de IA de la comunidad, y si falta alguna página no
 * devuelve un resultado parcial: un reglamento con páginas en blanco haría que
 * CoCo pasara por alto justo el artículo que importa.
 */
async function transcribeScannedPages(bytes: Buffer, pages: number[], budget: OcrBudget): Promise<Map<number, string>> {
    if (!pages.length) return new Map();
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) throw new CommunityDocumentError('Este documento tiene páginas escaneadas y la lectura de escaneos no está disponible ahora.', 503);
    if (bytes.length > MAX_OCR_BYTES) throw new CommunityDocumentError('El PDF escaneado pesa más de 14 MB: divídelo en partes.', 413);
    const model = 'gemini-2.5-flash';
    const usage = { communityId: budget.communityId, userId: budget.userId, module: 'coco.documents.ocr', provider: 'gemini', model, actionType: 'extraction' as const };
    await enforceAiBudget({ ...usage, estimatedPromptTokens: 260 * (pages.length + 10), estimatedCompletionTokens: 600 * pages.length });
    const prompt = [
        'Transcribe textualmente estas páginas de un documento legal chileno escaneado:',
        pages.join(', '),
        'Respeta la ortografía del original, sin resumir ni corregir. Omite timbres y firmas ilegibles.',
        'Responde solo JSON: {"pages":[{"page":número,"text":"texto"}]}.',
    ].join(' ');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'application/pdf', data: bytes.toString('base64') } }, { text: prompt }] }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 65_000 },
        }),
        signal: AbortSignal.timeout(240_000),
    });
    if (!response.ok) throw new CommunityDocumentError('No pude leer las páginas escaneadas ahora. Intenta de nuevo en unos minutos.', 502);
    const payload = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };
    await recordAiUsage({
        ...usage,
        promptTokens: payload.usageMetadata?.promptTokenCount,
        completionTokens: payload.usageMetadata?.candidatesTokenCount,
        totalTokens: payload.usageMetadata?.totalTokenCount,
    }).catch(() => undefined);
    const raw = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    let parsed: { pages?: Array<{ page?: unknown; text?: unknown }> } = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    const wanted = new Set(pages);
    const out = new Map<number, string>();
    for (const item of parsed.pages || []) {
        const page = Number(item.page);
        // Una página que vuelve con texto vacío está leída: puede ser una hoja en blanco o de firmas.
        if (wanted.has(page) && typeof item.text === 'string') out.set(page, clean(item.text));
    }
    const missing = pages.filter(page => !out.has(page));
    if (missing.length) {
        throw new CommunityDocumentError(`No pude leer ${missing.length === 1 ? 'la página' : 'las páginas'} ${missing.join(', ')} del escaneo. Intenta de nuevo o sube una versión más nítida.`, 502);
    }
    return out;
}

/**
 * Un documento sin páginas (Word, texto, planilla) se guarda en secciones. Se
 * citan como "sección", no como "página 1": inventar el número de página haría
 * que todas las citas apuntaran al comienzo.
 */
export function splitSections(text: string): PageText[] {
    const sections: PageText[] = [];
    let current = '';
    for (const paragraph of text.split(/\n{2,}|\n(?=\s*ART[IÍ]CULO)/i)) {
        if (current && current.length + paragraph.length > SECTION_CHARS) {
            sections.push({ page: sections.length + 1, text: current.trim(), ocr: false });
            current = '';
        }
        current += `${paragraph}\n\n`;
        while (current.length > SECTION_CHARS * 2) {
            sections.push({ page: sections.length + 1, text: current.slice(0, SECTION_CHARS).trim(), ocr: false });
            current = current.slice(SECTION_CHARS);
        }
    }
    if (current.trim()) sections.push({ page: sections.length + 1, text: current.trim(), ocr: false });
    return sections;
}

/** Texto para el turno de CoCo, con la página (o sección) marcada para que la cite. */
export function documentTurnText(pages: PageText[], paginated = true) {
    const label = paginated ? 'Página' : 'Sección';
    const full = pages.map(page => `[${label} ${page.page}${page.ocr ? ', transcrita' : ''}]\n${page.text}`).join('\n\n');
    return { text: full.slice(0, TURN_TEXT_CHARS), truncated: full.length > TURN_TEXT_CHARS };
}

async function extractPages(extension: NonNullable<ReturnType<typeof documentExtension>>, bytes: Buffer, budget: OcrBudget): Promise<{ pages: PageText[]; paginated: boolean; visual?: boolean }> {
    if (extension === 'pdf') {
        let pages = await pdfPages(bytes);
        const scanned = scannedPages(pages);
        if (scanned.length) {
            let transcribed: Map<number, string>;
            try {
                transcribed = await transcribeScannedPages(bytes, scanned, budget);
            } catch (error) {
                // Sin transcripción completa: el modelo lee el PDF con visión en
                // este turno. El presupuesto agotado no es un fallo de lectura y sube.
                if (error instanceof CommunityDocumentError && bytes.length <= MAX_VISUAL_PDF_BYTES && pages.length <= MAX_VISUAL_PDF_PAGES) {
                    return { pages, paginated: true, visual: true };
                }
                throw error;
            }
            pages = pages.map(page => transcribed.has(page.page) ? { page: page.page, text: transcribed.get(page.page)!, ocr: true } : page);
        }
        return { pages, paginated: true };
    }
    let text: string;
    if (extension === 'xlsx') {
        // Una nómina en Excel: CoCo la ve como tabla y puede cargarla con preview_resident_import.
        text = await spreadsheetBufferToText(bytes, { maxRows: 5000 });
    } else if (extension === 'docx') {
        const mammoth = await import('mammoth');
        text = (await mammoth.extractRawText({ buffer: bytes })).value;
    } else {
        text = bytes.toString('utf8');
    }
    return { pages: splitSections(text.replace(/\0/g, '').replace(/[ \t]+/g, ' ')), paginated: false };
}

/** Lee un documento ya subido al bucket y lo guarda, privado para quien lo subió. */
export async function readUploadedDocument(input: { communityId: string; userId: string; storagePath: string; fileName: string }): Promise<CoCoDocumentRead> {
    // La ruta la generamos nosotros: comunidad/usuario/uuid. Así nadie lee el archivo de otro.
    if (!input.storagePath.startsWith(`${input.communityId}/${input.userId}/`) || input.storagePath.includes('..')) {
        throw new CommunityDocumentError('Ese archivo no es tuyo.', 403);
    }
    const extension = documentExtension(input.storagePath);
    if (!extension) throw new CommunityDocumentError('Usa PDF, DOCX, TXT, XLSX o CSV.');
    const admin = getSupabaseAdmin();
    let saved = false;
    try {
        const { data: blob, error } = await admin.storage.from(DOCUMENTS_BUCKET).download(input.storagePath);
        if (error || !blob) throw new CommunityDocumentError('No encontré el archivo subido.', 404);
        const bytes = Buffer.from(await blob.arrayBuffer());
        if (bytes.length > MAX_DOCUMENT_BYTES) throw new CommunityDocumentError('El máximo es 25 MB.', 413);

        const { pages, paginated, visual } = await extractPages(extension, bytes, { communityId: input.communityId, userId: input.userId });
        if (visual) {
            // No se guarda con páginas en blanco: CoCo pasaría por alto justo el
            // artículo escaneado al buscar después. El archivo queda en el bucket
            // hasta que /api/coco lo use en el turno y lo borre.
            saved = true;
            const turn = documentTurnText(pages.filter(page => page.text), paginated);
            return {
                name: input.fileName.slice(0, 120),
                text: turn.text,
                pageCount: pages.length,
                ocrPages: 0,
                truncated: turn.truncated,
                visualPdfPath: input.storagePath,
            };
        }
        if (!pages.some(page => page.text)) {
            throw new CommunityDocumentError('No pude leer el documento. Si es una foto o un escaneo muy borroso, prueba con una versión más nítida.', 422);
        }

        const title = input.fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 140) || 'Documento';
        const { data: document, error: insertError } = await admin.from('community_documents').insert({
            community_id: input.communityId,
            uploaded_by: input.userId,
            title,
            file_name: input.fileName.slice(0, 200),
            storage_path: input.storagePath,
            page_count: pages.length,
            ocr_pages: pages.filter(page => page.ocr).length,
            paginated,
        }).select('id').single();
        if (insertError || !document) throw new CommunityDocumentError('No pude guardar el documento.', 500);
        const { error: pagesError } = await admin.from('community_document_pages').insert(
            pages.map(page => ({ document_id: document.id, page_number: page.page, text: page.text, ocr: page.ocr })),
        );
        if (pagesError) {
            await admin.from('community_documents').delete().eq('id', document.id);
            throw new CommunityDocumentError('No pude guardar el texto del documento.', 500);
        }
        saved = true;
        const turn = documentTurnText(pages, paginated);
        return {
            documentId: String(document.id),
            name: input.fileName.slice(0, 120),
            text: turn.text,
            pageCount: pages.length,
            ocrPages: pages.filter(page => page.ocr).length,
            truncated: turn.truncated,
        };
    } finally {
        // Si no se guardó, el archivo no queda huérfano en el bucket.
        if (!saved) await admin.storage.from(DOCUMENTS_BUCKET).remove([input.storagePath]).then(() => undefined, () => undefined);
    }
}

/** La ruta de un PDF para leer con visión es de esta persona (comunidad/usuario/uuid.pdf). */
export function isOwnVisualPdfPath(communityId: string, userId: string, path: string) {
    return path.startsWith(`${communityId}/${userId}/`) && !path.includes('..') && /^[^/]+\/[^/]+\/[0-9a-f-]{36}\.pdf$/i.test(path);
}

/** Baja el PDF que el modelo va a leer con visión en este turno, en base64. */
export async function loadVisualPdf(communityId: string, userId: string, path: string): Promise<string | null> {
    if (!isOwnVisualPdfPath(communityId, userId, path)) return null;
    const { data: blob, error } = await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).download(path);
    if (error || !blob) return null;
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.length > MAX_VISUAL_PDF_BYTES || bytes.subarray(0, 5).toString() !== '%PDF-') return null;
    return bytes.toString('base64');
}

/** Borra el PDF leído con visión: no quedó guardado como documento de la comunidad. */
export async function discardVisualPdf(communityId: string, userId: string, path: string) {
    if (!isOwnVisualPdfPath(communityId, userId, path)) return;
    await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).remove([path]).then(() => undefined, () => undefined);
}

/** Un extracto alrededor de la primera palabra buscada que aparezca. */
export function excerptAround(text: string, query: string, size = 700) {
    const words = query.toLocaleLowerCase('es-CL').normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\W+/).filter(word => word.length > 3);
    const plain = text.toLocaleLowerCase('es-CL').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const at = words.map(word => plain.indexOf(word)).filter(index => index >= 0).sort((a, b) => a - b)[0] ?? 0;
    const start = Math.max(0, at - Math.floor(size / 3));
    return `${start > 0 ? '…' : ''}${text.slice(start, start + size).trim()}${start + size < text.length ? '…' : ''}`;
}

/** Busca en los documentos que esta persona puede ver: los publicados y los suyos. */
export async function searchCommunityDocuments(communityId: string, userId: string, query: string, limit = 6): Promise<CommunityDocumentHit[]> {
    const q = query.trim().slice(0, 200);
    if (!q) return [];
    const admin = getSupabaseAdmin();
    const { data: documents } = await admin.from('community_documents')
        .select('id, title, kind, visibility, uploaded_by, paginated')
        .eq('community_id', communityId)
        .or(`visibility.eq.community,uploaded_by.eq.${userId}`)
        .limit(200);
    if (!documents?.length) return [];
    const byId = new Map(documents.map(document => [String(document.id), document]));
    const { data: pages, error } = await admin.from('community_document_pages')
        .select('document_id, page_number, text')
        .in('document_id', [...byId.keys()])
        .textSearch('fts', q, { type: 'websearch', config: 'spanish' })
        .limit(limit);
    if (error) throw error;
    return (pages || []).map(page => {
        const document = byId.get(String(page.document_id))!;
        return {
            documentId: String(page.document_id),
            title: String(document.title),
            kind: document.kind as CommunityDocumentKind,
            page: Number(page.page_number),
            paginated: document.paginated !== false,
            excerpt: excerptAround(String(page.text || ''), q),
        };
    });
}

/** La administración publica un documento para toda la comunidad. */
export async function publishCommunityDocument(input: { communityId: string; adminId: string; documentId: string; title?: string; kind?: string }) {
    const admin = getSupabaseAdmin();
    const kind: CommunityDocumentKind = ['reglamento', 'acta', 'contrato', 'otro'].includes(String(input.kind)) ? input.kind as CommunityDocumentKind : 'otro';
    const update: Record<string, unknown> = { visibility: 'community', kind, published_at: new Date().toISOString(), published_by: input.adminId };
    if (input.title?.trim()) update.title = input.title.trim().slice(0, 140);
    const { data, error } = await admin.from('community_documents').update(update)
        // Solo lo que subió esta misma administración: un documento privado de otra
        // persona no se publica conociendo su id.
        .eq('id', input.documentId).eq('community_id', input.communityId).eq('uploaded_by', input.adminId)
        .select('id, title, page_count').maybeSingle();
    if (error) return { error: 'No pude publicar el documento.' };
    if (!data) return { error: 'No encontré ese documento entre los que subiste tú. Solo puedes publicar lo que adjuntaste en el chat.' };
    await recordOperationEvent({
        communityId: input.communityId, actorId: input.adminId, actorRole: 'admin', action: 'community_document.published',
        entityType: 'community_document', entityId: String(data.id), severity: 'success', status: 'success',
        summary: `Documento publicado para la comunidad: ${data.title}`, metadata: { kind, pages: data.page_count },
    });
    return { success: true, document_id: data.id, title: data.title, pages: data.page_count, message: `Quedó publicado para la comunidad: ${data.title}. Desde ahora puedo citarlo cuando pregunten.` };
}
