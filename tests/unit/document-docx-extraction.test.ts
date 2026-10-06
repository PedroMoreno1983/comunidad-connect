import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { extractRawText } from 'mammoth';

it('extracts a synthetic Word document with the patched dependency tree', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Documento sintético QA: mantención por $10.000</w:t></w:r></w:p></w:body></w:document>');
    const result = await extractRawText({ buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
    expect(result.value.trim()).toBe('Documento sintético QA: mantención por $10.000');
    expect(result.messages).toEqual([]);
});
