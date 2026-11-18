/**
 * Documentos de la comunidad que CoCo lee completos: páginas escaneadas,
 * texto por página para citar, rutas que nadie puede falsificar, y quién
 * puede publicar.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock('@/lib/operations/audit', () => ({ recordOperationEvent: vi.fn(async () => ({ ok: true })) }));

import {
    CommunityDocumentError,
    documentExtension,
    documentStoragePath,
    documentTurnText,
    excerptAround,
    readUploadedDocument,
    scannedPages,
} from '@/lib/coco/communityDocuments';
import { MUTATING_TOOLS, TOOL_DEFINITIONS, isToolAllowedForRole } from '@/lib/coco/tools';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';

describe('páginas escaneadas', () => {
    it('detecta las páginas sin texto, como las 33 del reglamento de Las Palmas', () => {
        const pages = [
            { page: 9, text: 'ARTICULO PRIMERO: El presente Reglamento tiene como objeto el buen régimen interno del Loteo Residencial Palmas de Rapel, establecer los derechos…', ocr: false },
            { page: 10, text: '', ocr: false },
            { page: 11, text: '  66 ', ocr: false },
        ];
        expect(scannedPages(pages)).toEqual([10, 11]);
    });

    it('marca cada página para que CoCo la cite', () => {
        const turn = documentTurnText([
            { page: 11, text: 'ARTICULO QUINTO: … en iguales partes entre ellos, esto es en un uno coma doscientos sesenta y cinco por ciento cada uno.', ocr: true },
        ]);
        expect(turn.text).toContain('[Página 11, transcrita]');
        expect(turn.truncated).toBe(false);
    });

    it('un documento largo va recortado al turno, pero se avisa', () => {
        const turn = documentTurnText(Array.from({ length: 60 }, (_, index) => ({ page: index + 1, text: 'x'.repeat(1000), ocr: false })));
        expect(turn.text.length).toBe(35_000);
        expect(turn.truncated).toBe(true);
    });
});

describe('búsqueda', () => {
    it('el extracto parte cerca de la palabra buscada, con o sin tildes', () => {
        const text = `${'Lorem ipsum. '.repeat(100)}ARTICULO QUINTO: los copropietarios contribuirán en los gastos comunes en iguales partes.`;
        const excerpt = excerptAround(text, 'gastos comunes', 300);
        expect(excerpt).toContain('gastos comunes');
        expect(excerpt.startsWith('…')).toBe(true);
    });
});

describe('archivos', () => {
    it('acepta PDF, DOCX y TXT, y no guarda el nombre original en la ruta', () => {
        expect(documentExtension('Reglamento 1998.PDF')).toBe('pdf');
        expect(documentExtension('foto.jpg')).toBeNull();
        const path = documentStoragePath('com-1', 'user-1', 'Reglamento de Juan Pérez.pdf');
        expect(path).toMatch(/^com-1\/user-1\/[0-9a-f-]{36}\.pdf$/);
        expect(path).not.toContain('Juan');
    });

    it('nadie lee el archivo de otra persona o de otra comunidad', async () => {
        await expect(readUploadedDocument({ communityId: 'com-1', userId: 'user-1', storagePath: 'com-2/user-1/a.pdf', fileName: 'a.pdf' }))
            .rejects.toBeInstanceOf(CommunityDocumentError);
        await expect(readUploadedDocument({ communityId: 'com-1', userId: 'user-1', storagePath: 'com-1/user-9/a.pdf', fileName: 'a.pdf' }))
            .rejects.toThrow('Ese archivo no es tuyo.');
        await expect(readUploadedDocument({ communityId: 'com-1', userId: 'user-1', storagePath: 'com-1/user-1/../user-9/a.pdf', fileName: 'a.pdf' }))
            .rejects.toThrow('Ese archivo no es tuyo.');
    });
});

describe('herramientas de CoCo', () => {
    it('cualquier vecino busca en los documentos; solo la administración publica, con confirmación', () => {
        const names = TOOL_DEFINITIONS.map(tool => tool.name);
        expect(names).toContain('search_community_documents');
        expect(names).toContain('save_community_document');
        expect(isToolAllowedForRole('search_community_documents', 'resident')).toBe(true);
        expect(isToolAllowedForRole('save_community_document', 'resident')).toBe(false);
        expect(isToolAllowedForRole('save_community_document', 'admin')).toBe(true);
        expect(MUTATING_TOOLS.has('save_community_document')).toBe(true);
        expect(MUTATING_TOOLS.has('search_community_documents')).toBe(false);
        expect(cocoToolRisk('save_community_document')).toBe('write_high');
    });
});
