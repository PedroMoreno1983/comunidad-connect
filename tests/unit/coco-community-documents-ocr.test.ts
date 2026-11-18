/**
 * Lectura de un documento con páginas escaneadas: no se guarda a medias, pasa
 * por el presupuesto de IA, y si la transcripción falla el PDF se le pasa al
 * modelo para que lo lea con visión en ese turno (sin guardarlo con páginas en
 * blanco). Si tampoco se puede, el archivo no queda huérfano.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('pdf-parse/worker', () => ({}));
vi.mock('pdf-parse', () => ({
    PDFParse: class {
        async getText() {
            return { pages: [
                { num: 1, text: 'REGLAMENTO INTERNO Y DE COPROPIEDAD. ARTICULO PRIMERO: El presente Reglamento tiene como objeto el buen régimen interno del loteo, establecer los derechos y obligaciones recíprocas de todos los comuneros.' },
                { num: 2, text: '' },
                { num: 3, text: ' 66 ' },
            ] };
        }
        async destroy() {}
    },
}));
const budget = vi.hoisted(() => ({ enforce: vi.fn(async () => undefined), record: vi.fn(async () => undefined) }));
vi.mock('@/lib/ai/budget', () => ({ enforceAiBudget: budget.enforce, recordAiUsage: budget.record }));
vi.mock('@/lib/operations/audit', () => ({ recordOperationEvent: vi.fn(async () => ({ ok: true })) }));

const store = vi.hoisted(() => ({ removed: [] as string[][], inserts: [] as Array<{ table: string; row: unknown }>, payload: null as Buffer | null }));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({
        storage: {
            from: () => ({
                download: async () => ({ data: new Blob([new Uint8Array(store.payload ?? Buffer.from('%PDF-1.4 escaneado'))]), error: null }),
                remove: async (paths: string[]) => { store.removed.push(paths); return { error: null }; },
            }),
        },
        from: (table: string) => ({
            insert: (row: unknown) => {
                store.inserts.push({ table, row });
                const result = { data: { id: 'doc-1' }, error: null };
                return { select: () => ({ single: async () => result }), then: (resolve: (value: { error: null }) => void) => resolve({ error: null }) };
            },
            delete: () => ({ eq: async () => ({ error: null }) }),
        }),
    }),
}));

import { CommunityDocumentError, MAX_VISUAL_PDF_BYTES, isOwnVisualPdfPath, readUploadedDocument, splitSections } from '@/lib/coco/communityDocuments';

const INPUT = { communityId: 'palmas', userId: 'admin-1', storagePath: 'palmas/admin-1/abc.pdf', fileName: 'Reglamento 1998.pdf' };

function gemini(pages: Array<{ page: number; text: string }>) {
    return {
        ok: true,
        json: async () => ({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ pages }) }] } }],
            usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500, totalTokenCount: 1500 },
        }),
    };
}

beforeEach(() => {
    store.removed = [];
    store.inserts = [];
    store.payload = null;
    budget.enforce.mockClear();
    budget.record.mockClear();
    vi.stubEnv('GEMINI_API_KEY', 'clave-de-prueba');
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('páginas escaneadas', () => {
    it('transcribe las que faltan, con presupuesto, y guarda todo', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => gemini([
            { page: 2, text: 'ARTICULO QUINTO: los gastos comunes en iguales partes.' },
            { page: 3, text: 'ARTICULO SEXTO: solidaridad de los comuneros.' },
        ])));
        const read = await readUploadedDocument(INPUT);
        expect(read.ocrPages).toBe(2);
        expect(read.text).toContain('[Página 2, transcrita]');
        expect(budget.enforce).toHaveBeenCalledWith(expect.objectContaining({ module: 'coco.documents.ocr', communityId: 'palmas', userId: 'admin-1' }));
        expect(budget.record).toHaveBeenCalledWith(expect.objectContaining({ promptTokens: 1000, completionTokens: 500 }));
        expect(store.removed).toEqual([]);
    });

    it('si falta una página, no guarda un documento a medias: el modelo lee el PDF con visión', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => gemini([{ page: 2, text: 'ARTICULO QUINTO: …' }])));
        const read = await readUploadedDocument(INPUT);
        expect(read.visualPdfPath).toBe('palmas/admin-1/abc.pdf');
        expect(read.documentId).toBeUndefined();
        expect(read.text).toContain('[Página 1]');
        expect(read.text).not.toContain('[Página 2');
        expect(store.inserts).toEqual([]);
        // El archivo queda para el turno: /api/coco lo borra después de usarlo.
        expect(store.removed).toEqual([]);
    });

    it('una hoja en blanco que vuelve vacía cuenta como leída', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => gemini([
            { page: 2, text: 'ARTICULO QUINTO: los gastos comunes en iguales partes.' },
            { page: 3, text: '' },
        ])));
        const read = await readUploadedDocument(INPUT);
        expect(read.pageCount).toBe(3);
        expect(read.visualPdfPath).toBeUndefined();
        expect(store.removed).toEqual([]);
    });

    it('si Gemini responde algo que no es JSON, tampoco guarda: lectura visual', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'no es json' }] } }] }) })));
        const read = await readUploadedDocument(INPUT);
        expect(read.visualPdfPath).toBe('palmas/admin-1/abc.pdf');
        expect(store.inserts).toEqual([]);
    });

    it('sin clave de Gemini no guarda las páginas en blanco: lectura visual', async () => {
        vi.stubEnv('GEMINI_API_KEY', '');
        const read = await readUploadedDocument(INPUT);
        expect(read.visualPdfPath).toBe('palmas/admin-1/abc.pdf');
        expect(store.inserts).toEqual([]);
    });

    it('un escaneo que pasa del tope de lectura visual se rechaza y no queda huérfano', async () => {
        vi.stubEnv('GEMINI_API_KEY', '');
        store.payload = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc(MAX_VISUAL_PDF_BYTES + 1)]);
        await expect(readUploadedDocument(INPUT)).rejects.toBeInstanceOf(CommunityDocumentError);
        expect(store.inserts).toEqual([]);
        expect(store.removed).toEqual([['palmas/admin-1/abc.pdf']]);
    });

    it('sin presupuesto de IA no cae a la lectura visual: el error sube', async () => {
        budget.enforce.mockRejectedValueOnce(new Error('presupuesto agotado'));
        await expect(readUploadedDocument(INPUT)).rejects.toThrow('presupuesto agotado');
        expect(store.removed).toEqual([['palmas/admin-1/abc.pdf']]);
    });
});

describe('ruta del PDF para lectura visual', () => {
    const community = '11111111-1111-1111-1111-111111111111';
    const user = '22222222-2222-2222-2222-222222222222';
    const file = '33333333-3333-4333-8333-333333333333';
    it('solo acepta un PDF propio, generado por el servidor', () => {
        expect(isOwnVisualPdfPath(community, user, `${community}/${user}/${file}.pdf`)).toBe(true);
        expect(isOwnVisualPdfPath(community, user, `${community}/otra-persona/${file}.pdf`)).toBe(false);
        expect(isOwnVisualPdfPath(community, user, `${community}/${user}/../x/${file}.pdf`)).toBe(false);
        expect(isOwnVisualPdfPath(community, user, `${community}/${user}/${file}.docx`)).toBe(false);
    });
});

describe('documentos sin páginas', () => {
    it('se cortan en secciones, sin inventar números de página', () => {
        const text = Array.from({ length: 6 }, (_, i) => `ARTICULO ${i + 1}: ${'texto '.repeat(200)}`).join('\n\n');
        const sections = splitSections(text);
        expect(sections.length).toBeGreaterThan(1);
        expect(sections.map(section => section.page)).toEqual(sections.map((_, index) => index + 1));
        expect(sections.every(section => section.text.length <= 7_000)).toBe(true);
    });
});
