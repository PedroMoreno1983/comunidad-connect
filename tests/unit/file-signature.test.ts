import { describe, expect, it } from 'vitest';
import { detectFileKind, verifyUploadSignature } from '@/lib/server/fileSignature';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n', 'ascii'), Buffer.from('contenido')]);
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('docx')]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
const TEXT = Buffer.from('nombre,unidad\nAna,101\n', 'utf8');

describe('detectFileKind', () => {
    it('recognises each container by its magic bytes', () => {
        expect(detectFileKind(PDF)).toBe('pdf');
        expect(detectFileKind(ZIP)).toBe('zip');
        expect(detectFileKind(OLE)).toBe('ole');
        expect(detectFileKind(TEXT)).toBe('text');
    });

    it('does not treat binary noise as text', () => {
        expect(detectFileKind(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe('unknown');
    });

    it('does not treat an empty file as text', () => {
        expect(detectFileKind(Buffer.alloc(0))).toBe('unknown');
    });
});

describe('verifyUploadSignature', () => {
    it('accepts content that matches its extension', () => {
        expect(verifyUploadSignature('curso.pdf', PDF)).toMatchObject({ ok: true, extension: 'pdf' });
        expect(verifyUploadSignature('vecinos.xlsx', ZIP)).toMatchObject({ ok: true, extension: 'xlsx' });
        expect(verifyUploadSignature('acta.docx', ZIP)).toMatchObject({ ok: true, extension: 'docx' });
        expect(verifyUploadSignature('lista.csv', TEXT)).toMatchObject({ ok: true, extension: 'csv' });
    });

    it('rejects a renamed file whose content is another format', () => {
        // Un ejecutable renombrado a .pdf llegaba a Gemini declarado como PDF.
        expect(verifyUploadSignature('malicioso.pdf', ZIP)).toMatchObject({ ok: false });
        // Un binario cualquiera renombrado a .docx entraba al parser de ZIP/XML.
        expect(verifyUploadSignature('malicioso.docx', PDF)).toMatchObject({ ok: false });
        // Un ZIP renombrado a .csv se leía como texto.
        expect(verifyUploadSignature('malicioso.csv', ZIP)).toMatchObject({ ok: false });
    });

    it('rejects the legacy OLE formats explicitly', () => {
        const doc = verifyUploadSignature('acta.doc', OLE);
        const xls = verifyUploadSignature('vecinos.xls', OLE);

        expect(doc.ok).toBe(false);
        expect(xls.ok).toBe(false);
        expect(doc.ok === false && doc.reason).toContain('DOCX');
        expect(xls.ok === false && xls.reason).toContain('XLSX');
    });

    it('rejects unknown extensions', () => {
        expect(verifyUploadSignature('script.exe', PDF)).toMatchObject({ ok: false });
        expect(verifyUploadSignature('sin-extension', TEXT)).toMatchObject({ ok: false });
    });

    it('ignores the case of the extension', () => {
        expect(verifyUploadSignature('CURSO.PDF', PDF)).toMatchObject({ ok: true, extension: 'pdf' });
    });
});
