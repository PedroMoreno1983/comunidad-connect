/**
 * Detección del formato real de un archivo subido a partir de sus primeros
 * bytes.
 *
 * Las rutas que aceptan documentos elegían el parser sólo por la extensión del
 * nombre, que la envía quien sube el archivo. Eso permitía entregarle a un
 * parser un contenido que no es el suyo: un `.docx` cualquiera acaba en el
 * lector de ZIP/XML, y un `.pdf` arbitrario se manda a Gemini declarado como
 * `application/pdf`.
 */

export type FileKind = 'pdf' | 'zip' | 'ole' | 'text' | 'unknown';

const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');
/** Documentos OOXML modernos (.docx, .xlsx) son contenedores ZIP. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/** Contenedor OLE2 de los formatos binarios antiguos (.doc, .xls). */
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function looksLikeText(buffer: Buffer): boolean {
    if (buffer.length === 0) return false;
    // Un byte nulo no aparece en texto plano y sí en binarios.
    const sample = buffer.subarray(0, 8192);
    if (sample.includes(0)) return false;
    return Buffer.compare(Buffer.from(sample.toString('utf8'), 'utf8'), sample) === 0
        || !sample.toString('utf8').includes('\uFFFD');
}

/** Determina el formato real del contenido, ignorando el nombre del archivo. */
export function detectFileKind(buffer: Buffer): FileKind {
    if (buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) return 'pdf';
    if (buffer.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) return 'zip';
    if (buffer.subarray(0, OLE_MAGIC.length).equals(OLE_MAGIC)) return 'ole';
    if (looksLikeText(buffer)) return 'text';
    return 'unknown';
}

/** Formato que debe tener el contenido para cada extensión aceptada. */
const EXPECTED_KIND: Record<string, FileKind> = {
    pdf: 'pdf',
    docx: 'zip',
    xlsx: 'zip',
    csv: 'text',
    txt: 'text',
};

export type SignatureCheck =
    | { ok: true; extension: string; kind: FileKind }
    | { ok: false; reason: string };

/**
 * Comprueba que el contenido corresponda con la extensión declarada.
 *
 * `.doc` y `.xls` se rechazan aparte: sus contenedores OLE binarios no se
 * procesan por seguridad.
 */
export function verifyUploadSignature(fileName: string, buffer: Buffer): SignatureCheck {
    const extension = fileName.toLowerCase().split('.').pop() ?? '';

    if (extension === 'doc' || extension === 'xls') {
        return {
            ok: false,
            reason: `Formato ${extension.toUpperCase()} antiguo no soportado por seguridad. Guarda el archivo como ${
                extension === 'doc' ? 'DOCX' : 'XLSX'
            } o CSV y vuelve a subirlo.`,
        };
    }

    const expected = EXPECTED_KIND[extension];
    if (!expected) {
        return {
            ok: false,
            reason: 'Formato de archivo no soportado. Por favor sube PDF, Word, Excel, CSV o TXT.',
        };
    }

    const kind = detectFileKind(buffer);
    if (kind !== expected) {
        return {
            ok: false,
            reason: `El contenido del archivo no corresponde con la extensión .${extension}.`,
        };
    }

    return { ok: true, extension, kind };
}
