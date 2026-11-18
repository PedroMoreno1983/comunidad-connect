import { supabase } from '../supabase';
import type { CoCoDocumentRead } from '../coco/chatAttachmentRules';

const BUCKET = 'community-documents';

/** El tipo sale de la extensión: el navegador a veces no lo informa, y el bucket solo acepta estos. */
const MIME_BY_EXTENSION: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
};

async function readError(response: Response, fallback: string) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    return new Error(data.error || fallback);
}

/**
 * Documentos que CoCo lee completos. El archivo sube directo al bucket privado
 * (Vercel corta los cuerpos en 4,5 MB) y luego el servidor lo lee entero,
 * transcribe las páginas escaneadas y lo guarda, privado para quien lo subió.
 */
export const CommunityDocumentsService = {
    async readForCoCo(file: File): Promise<CoCoDocumentRead> {
        const prepared = await fetch('/api/coco/documents/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, size: file.size }),
        });
        if (!prepared.ok) throw await readError(prepared, 'No pude preparar la subida.');
        const { path, token } = await prepared.json() as { path: string; token: string };

        const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(path, token, file, {
            contentType: MIME_BY_EXTENSION[file.name.split('.').at(-1)?.toLowerCase() || ''] || 'application/octet-stream',
        });
        if (error) throw new Error('No pude subir el documento. Revisa tu conexión e inténtalo de nuevo.');

        const read = await fetch('/api/coco/legal-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storagePath: path, fileName: file.name }),
        });
        if (!read.ok) throw await readError(read, 'No pude leer el documento.');
        return await read.json() as CoCoDocumentRead;
    },
};
