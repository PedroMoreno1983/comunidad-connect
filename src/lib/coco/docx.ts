/**
 * docx.ts - Genera un .docx mínimo (Office Open XML) sin dependencias.
 * Admite títulos (#, ##, ###), viñetas (-, *), listas numeradas y **negrita**.
 */

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(data: Buffer) {
    let crc = 0xffffffff;
    for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP sin compresión (método store), suficiente para Word. */
export function zipStore(files: Array<{ name: string; data: Buffer }>) {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const file of files) {
        const name = Buffer.from(file.name, 'utf8');
        const crc = crc32(file.data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(0, 8); local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(file.data.length, 18); local.writeUInt32LE(file.data.length, 22);
        local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
        locals.push(local, name, file.data);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10); central.writeUInt32LE(0, 12);
        central.writeUInt32LE(crc, 16); central.writeUInt32LE(file.data.length, 20); central.writeUInt32LE(file.data.length, 24);
        central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
        centrals.push(central, name);
        offset += 30 + name.length + file.data.length;
    }
    const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, ...centrals, end]);
}

function escapeXml(text: string) {
    return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function runs(text: string) {
    const clean = text.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 ($2)').replace(/`/g, '');
    return clean.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part => {
        const bold = part.startsWith('**') && part.endsWith('**');
        const value = escapeXml(bold ? part.slice(2, -2) : part.replace(/(^|\s)[*_]([^*_]+)[*_]/g, '$1$2'));
        return `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${value}</w:t></w:r>`;
    }).join('');
}

function paragraph(line: string) {
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
        const size = [36, 30, 26][heading[1].length - 1];
        return `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${escapeXml(heading[2].replace(/\*\*/g, ''))}</w:t></w:r></w:p>`;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) return `<w:p><w:pPr><w:ind w:left="360" w:hanging="240"/></w:pPr><w:r><w:t xml:space="preserve">• </w:t></w:r>${runs(bullet[1])}</w:p>`;
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) return '<w:p/>';
    return `<w:p><w:pPr><w:spacing w:after="120"/><w:jc w:val="both"/></w:pPr>${runs(line)}</w:p>`;
}

export function markdownToDocx(markdown: string) {
    const body = markdown.replace(/\r\n?/g, '\n').split('\n')
        .filter(line => !/^\s*\|?\s*:?-{3,}/.test(line) || /^\s*-{3,}\s*$/.test(line))
        .map(line => line.trim() ? paragraph(line.replace(/^\s*\|(.*)\|\s*$/, (_m, row: string) => row.split('|').map(c => c.trim()).join(' — '))) : '<w:p/>')
        .join('');
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    return zipStore([
        { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
        { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
        { name: 'word/document.xml', data: Buffer.from(document, 'utf8') },
    ]);
}
