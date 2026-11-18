import 'server-only';

import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordOperationEvent } from '@/lib/operations/audit';
import type { CommunityDocumentHit, CommunityDocumentKind, CommunityDocumentRead } from '@/lib/types';

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
/** Gemini recibe el PDF entero en línea hasta este tamaño. */
const MAX_OCR_BYTES = 20 * 1024 * 1024;

export class CommunityDocumentError extends Error {
    constructor(message: string, readonly status = 400) { super(message); }
}

export function documentExtension(fileName: string) {
    const extension = fileName.split('.').at(-1)?.toLowerCase() || '';
    return ['pdf', 'docx', 'txt'].includes(extension) ? extension as 'pdf' | 'docx' | 'txt' : null;
}

/** Ruta en el bucket: la comunidad y quien sube, más un id. Sin el nombre original (puede traer datos). */
export function documentStoragePath(communityId: string, userId: string, fileName: string) {
    const extension = documentExtension(fileName);
    if (!extension) throw new CommunityDocumentError('Usa PDF, DOCX o TXT.');
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
 */
async function transcribeScannedPages(bytes: Buffer, pages: number[]): Promise<Map<number, string>> {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key || !pages.length) return new Map();
    if (bytes.length > MAX_OCR_BYTES) throw new CommunityDocumentError('El PDF escaneado pesa más de 20 MB: divídelo en partes.', 413);
    const prompt = [
        'Transcribe textualmente estas páginas de un documento legal chileno escaneado:',
        pages.join(', '),
        'Respeta la ortografía del original, sin resumir ni corregir. Omite timbres y firmas ilegibles.',
        'Responde solo JSON: {"pages":[{"page":número,"text":"texto"}]}.',
    ].join(' ');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'application/pdf', data: bytes.toString('base64') } }, { text: prompt }] }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 65_000 },
        }),
        signal: AbortSignal.timeout(240_000),
    });
    if (!response.ok) throw new CommunityDocumentError('No pude leer las páginas escaneadas ahora. Intenta de nuevo en unos minutos.', 502);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    let parsed: { pages?: Array<{ page?: unknown; text?: unknown }> } = {};
    try { parsed = JSON.parse(raw); } catch { return new Map(); }
    const wanted = new Set(pages);
    const out = new Map<number, string>();
    for (const item of parsed.pages || []) {
        const page = Number(item.page);
        if (wanted.has(page) && typeof item.text === 'string' && item.text.trim()) out.set(page, clean(item.text));
    }
    return out;
}

/** Texto para el turno de CoCo, con la página marcada para que la cite. */
export function documentTurnText(pages: PageText[]) {
    const full = pages.map(page => `[Página ${page.page}${page.ocr ? ', transcrita' : ''}]\n${page.text}`).join('\n\n');
    return { text: full.slice(0, TURN_TEXT_CHARS), truncated: full.length > TURN_TEXT_CHARS };
}

/** Lee un documento ya subido al bucket y lo guarda, privado para quien lo subió. */
export async function readUploadedDocument(input: { communityId: string; userId: string; storagePath: string; fileName: string }): Promise<CommunityDocumentRead> {
    // La ruta la generamos nosotros: comunidad/usuario/uuid. Así nadie lee el archivo de otro.
    if (!input.storagePath.startsWith(`${input.communityId}/${input.userId}/`) || input.storagePath.includes('..')) {
        throw new CommunityDocumentError('Ese archivo no es tuyo.', 403);
    }
    const extension = documentExtension(input.storagePath);
    if (!extension) throw new CommunityDocumentError('Usa PDF, DOCX o TXT.');
    const admin = getSupabaseAdmin();
    const { data: blob, error } = await admin.storage.from(DOCUMENTS_BUCKET).download(input.storagePath);
    if (error || !blob) throw new CommunityDocumentError('No encontré el archivo subido.', 404);
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.length > MAX_DOCUMENT_BYTES) throw new CommunityDocumentError('El máximo es 25 MB.', 413);

    let pages: PageText[];
    if (extension === 'pdf') {
        pages = await pdfPages(bytes);
        const scanned = scannedPages(pages);
        if (scanned.length) {
            const transcribed = await transcribeScannedPages(bytes, scanned);
            pages = pages.map(page => transcribed.has(page.page) ? { page: page.page, text: transcribed.get(page.page)!, ocr: true } : page);
        }
    } else if (extension === 'docx') {
        const mammoth = await import('mammoth');
        pages = [{ page: 1, text: clean((await mammoth.extractRawText({ buffer: bytes })).value), ocr: false }];
    } else {
        pages = [{ page: 1, text: clean(bytes.toString('utf8')), ocr: false }];
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
    }).select('id').single();
    if (insertError || !document) throw new CommunityDocumentError('No pude guardar el documento.', 500);
    const { error: pagesError } = await admin.from('community_document_pages').insert(
        pages.map(page => ({ document_id: document.id, page_number: page.page, text: page.text, ocr: page.ocr })),
    );
    if (pagesError) {
        await admin.from('community_documents').delete().eq('id', document.id);
        throw new CommunityDocumentError('No pude guardar el texto del documento.', 500);
    }
    const turn = documentTurnText(pages);
    return {
        documentId: String(document.id),
        name: input.fileName.slice(0, 120),
        text: turn.text,
        pageCount: pages.length,
        ocrPages: pages.filter(page => page.ocr).length,
        truncated: turn.truncated,
    };
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
        .select('id, title, kind, visibility, uploaded_by')
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
        .eq('id', input.documentId).eq('community_id', input.communityId)
        .select('id, title, page_count').maybeSingle();
    if (error) return { error: 'No pude publicar el documento.' };
    if (!data) return { error: 'No encontré ese documento en tu comunidad.' };
    await recordOperationEvent({
        communityId: input.communityId, actorId: input.adminId, actorRole: 'admin', action: 'community_document.published',
        entityType: 'community_document', entityId: String(data.id), severity: 'success', status: 'success',
        summary: `Documento publicado para la comunidad: ${data.title}`, metadata: { kind, pages: data.page_count },
    });
    return { success: true, document_id: data.id, title: data.title, pages: data.page_count, message: `Quedó publicado para la comunidad: ${data.title}. Desde ahora puedo citarlo cuando pregunten.` };
}
