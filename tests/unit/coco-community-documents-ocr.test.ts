/**
 * Lectura de un documento con páginas escaneadas: no se guarda a medias, pasa
 * por el presupuesto de IA, y si algo falla el archivo no queda huérfano.
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

const store = vi.hoisted(() => ({ removed: [] as string[][], inserts: [] as Array<{ table: string; row: unknown }> }));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({
        storage: {
            from: () => ({
                download: async () => ({ data: new Blob([Buffer.from('%PDF-1.4 escaneado')]), error: null }),
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

import { CommunityDocumentError, readUploadedDocument, splitSections } from '@/lib/coco/communityDocuments';

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

    it('si falta una página, no guarda un documento a medias y borra el archivo', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => gemini([{ page: 2, text: 'ARTICULO QUINTO: …' }])));
        await expect(readUploadedDocument(INPUT)).rejects.toThrow('la página 3');
        expect(store.inserts).toEqual([]);
        expect(store.removed).toEqual([['palmas/admin-1/abc.pdf']]);
    });

    it('si Gemini responde algo que no es JSON, tampoco', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'no es json' }] } }] }) })));
        await expect(readUploadedDocument(INPUT)).rejects.toBeInstanceOf(CommunityDocumentError);
        expect(store.inserts).toEqual([]);
    });

    it('sin clave de Gemini lo dice, en vez de guardar las páginas en blanco', async () => {
        vi.stubEnv('GEMINI_API_KEY', '');
        await expect(readUploadedDocument(INPUT)).rejects.toThrow('escaneos no está disponible');
        expect(store.inserts).toEqual([]);
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
