/**
 * docx.ts - Word (Office Open XML) con la línea editorial de Convive, sin dependencias:
 * encabezado con logo y comunidad, pie con aviso de borrador y numeración, estilos de título,
 * listas numeradas reales y tablas.
 */
import { CONVIVE_BRAND as B } from './brand';
import { LEGAL_DRAFT_MARKER } from './legalDraftMarker';
import { parseDraft, type Run } from './draftBlocks';

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
        local.writeUInt32LE(crc, 14); local.writeUInt32LE(file.data.length, 18); local.writeUInt32LE(file.data.length, 22);
        local.writeUInt16LE(name.length, 26);
        locals.push(local, name, file.data);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8); central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(file.data.length, 20); central.writeUInt32LE(file.data.length, 24);
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

const esc = (text: string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const run = (r: Run, extra = '') => `<w:r>${r.bold || extra ? `<w:rPr>${r.bold ? '<w:b/>' : ''}${extra}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
const runs = (list: Run[]) => list.map(r => run(r)).join('');

function table(header: string[], rows: string[][]) {
    const width = Math.floor(9360 / Math.max(1, header.length));
    const cell = (text: string, head: boolean) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${head ? `<w:shd w:val="clear" w:color="auto" w:fill="${B.copper}"/>` : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>${run({ text, bold: head }, head ? '<w:color w:val="FFFFFF"/>' : '')}</w:p></w:tc>`;
    const border = `w:val="single" w:sz="4" w:space="0" w:color="${B.line}"`;
    return `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders><w:top ${border}/><w:left ${border}/><w:bottom ${border}/><w:right ${border}/><w:insideH ${border}/><w:insideV ${border}/></w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${header.map(() => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${header.map(h => cell(h, true)).join('')}</w:tr>${rows.map(r => `<w:tr>${r.map(c => cell(c, false)).join('')}</w:tr>`).join('')}</w:tbl><w:p/>`;
}

export function draftBodyXml(markdown: string) {
    let list = 0;
    let lastWasNumbered = false;
    return parseDraft(markdown).map(block => {
        if (block.kind !== 'numbered') lastWasNumbered = false;
        switch (block.kind) {
            case 'heading': return `<w:p><w:pPr><w:pStyle w:val="Heading${block.level}"/></w:pPr>${run({ text: block.text })}</w:p>`;
            case 'bullet': return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${runs(block.runs)}</w:p>`;
            case 'numbered': {
                if (!lastWasNumbered) list++;
                lastWasNumbered = true;
                return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${100 + list}"/></w:numPr></w:pPr>${runs(block.runs)}</w:p>`;
            }
            case 'table': return table(block.header, block.rows);
            case 'rule': return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${B.copperBg}"/></w:pBdr></w:pPr></w:p>`;
            default: {
                const notice = block.runs.some(r => r.text.includes(LEGAL_DRAFT_MARKER));
                return notice
                    ? `<w:p><w:pPr><w:pStyle w:val="Notice"/></w:pPr>${run({ text: block.runs.map(r => r.text).join(''), bold: true })}</w:p>`
                    : `<w:p>${runs(block.runs)}</w:p>`;
            }
        }
    }).join('');
}

function numberingXml(lists: number) {
    const abstractBullet = `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:color w:val="${B.copper}"/></w:rPr></w:lvl></w:abstractNum>`;
    const abstractNum = `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:b/><w:color w:val="${B.copper}"/></w:rPr></w:lvl></w:abstractNum>`;
    const nums = ['<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'];
    for (let i = 1; i <= Math.max(1, lists); i++) nums.push(`<w:num w:numId="${100 + i}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`);
    return `${XML}<w:numbering ${W}>${abstractBullet}${abstractNum}${nums.join('')}</w:numbering>`;
}

function stylesXml() {
    const heading = (id: number, size: number, color: string, before: number) => `<w:style w:type="paragraph" w:styleId="Heading${id}"><w:name w:val="heading ${id}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="120"/><w:outlineLvl w:val="${id - 1}"/></w:pPr><w:rPr><w:rFonts w:ascii="${B.fontDisplay}" w:hAnsi="${B.fontDisplay}"/><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
    return `${XML}<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${B.fontSans}" w:hAnsi="${B.fontSans}" w:cs="${B.fontSans}"/><w:color w:val="${B.ink}"/><w:sz w:val="22"/><w:lang w:val="es-CL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>`
        + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
        + heading(1, 36, B.copperDeep, 120) + heading(2, 28, B.copper, 280) + heading(3, 24, B.ink, 200)
        + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/><w:contextualSpacing/></w:pPr></w:style>'
        + `<w:style w:type="paragraph" w:styleId="Notice"><w:name w:val="Aviso borrador"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="${B.copperBg}"/><w:spacing w:before="60" w:after="200"/><w:ind w:left="120" w:right="120"/><w:jc w:val="left"/></w:pPr><w:rPr><w:color w:val="${B.copperDeep}"/></w:rPr></w:style>`
        + '</w:styles>';
}

function headerXml(community: string) {
    const emu = 457200; // 0,5"
    const logo = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${emu}" cy="${emu}"/><wp:docPr id="1" name="Logo Convive"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu}" cy="${emu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    const serif = (text: string, extra = '') => `<w:r><w:rPr><w:rFonts w:ascii="${B.fontDisplay}" w:hAnsi="${B.fontDisplay}"/><w:sz w:val="30"/>${extra}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
    return `${XML}<w:hdr ${W}><w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${B.copper}"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs><w:jc w:val="left"/></w:pPr>${logo}${serif('  Convive')}${serif(' & ', `<w:i/><w:color w:val="${B.copper}"/>`)}${serif('Connect')}<w:r><w:tab/></w:r><w:r><w:rPr><w:color w:val="${B.inkMuted}"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${esc(community || 'Comunidad [nombre a completar]')}</w:t></w:r></w:p></w:hdr>`;
}

function footerXml() {
    const field = (code: string) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    return `${XML}<w:ftr ${W}><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="${B.line}"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs><w:jc w:val="left"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${B.copperDeep}"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">${LEGAL_DRAFT_MARKER}</w:t></w:r><w:r><w:rPr><w:color w:val="${B.inkMuted}"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve"> · No es asesoría legal</w:t></w:r><w:r><w:tab/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">Página </w:t></w:r>${field('PAGE')}<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve"> de </w:t></w:r>${field('NUMPAGES')}</w:p></w:ftr>`;
}

export function markdownToDocx(markdown: string, options: { community?: string } = {}) {
    const lists = parseDraft(markdown).reduce((acc, b, i, all) => acc + (b.kind === 'numbered' && all[i - 1]?.kind !== 'numbered' ? 1 : 0), 0);
    const document = `${XML}<w:document ${W}><w:body>${draftBodyXml(markdown)}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1700" w:right="1440" w:bottom="1440" w:left="1440" w:header="600" w:footer="600" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const contentTypes = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`;
    const rels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const docRels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="${R}/numbering" Target="numbering.xml"/><Relationship Id="rIdHeader" Type="${R}/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="${R}/footer" Target="footer1.xml"/></Relationships>`;
    const headerRels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="${R}/image" Target="media/logo.png"/></Relationships>`;
    const f = (name: string, text: string) => ({ name, data: Buffer.from(text, 'utf8') });
    return zipStore([
        f('[Content_Types].xml', contentTypes), f('_rels/.rels', rels),
        f('word/document.xml', document), f('word/_rels/document.xml.rels', docRels),
        f('word/styles.xml', stylesXml()), f('word/numbering.xml', numberingXml(lists)),
        f('word/header1.xml', headerXml(options.community || '')), f('word/_rels/header1.xml.rels', headerRels),
        f('word/footer1.xml', footerXml()),
        { name: 'word/media/logo.png', data: Buffer.from(B.logoPngBase64, 'base64') },
    ]);
}
