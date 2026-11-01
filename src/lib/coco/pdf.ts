/**
 * pdf.ts - PDF del borrador con la línea editorial de Convive, en JS puro (pdf-lib):
 * funciona en funciones serverless de Vercel sin Chrome headless.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { CONVIVE_BRAND as B } from './brand';
import { LEGAL_DRAFT_MARKER } from './legalDraftMarker';
import { parseDraft, type Run } from './draftBlocks';

const hex = (value: string) => rgb(parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255);
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
/** Las fuentes estándar de PDF solo codifican WinAnsi: se reemplaza lo que no cabe (emojis, etc.). */
export function pdfSafe(text: string) {
    return Array.from(text.replace(/\t/g, ' ').replace(/[≤]/g, '<=').replace(/[≥]/g, '>=')).map(ch => {
        const code = ch.codePointAt(0) || 0;
        if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.includes(ch)) return ch;
        return '';
    }).join('');
}

const PAGE = { w: 612, h: 792, margin: 64, top: 104, bottom: 72 };
const WIDTH = PAGE.w - PAGE.margin * 2;

interface Fonts { sans: PDFFont; sansBold: PDFFont; serif: PDFFont; serifBold: PDFFont; serifItalic: PDFFont }

export async function markdownToPdf(markdown: string, options: { community?: string; title?: string } = {}) {
    const doc = await PDFDocument.create();
    doc.setTitle(pdfSafe(options.title || 'Borrador Convive Connect'));
    doc.setAuthor('CoCo · Convive Connect');
    doc.setSubject(LEGAL_DRAFT_MARKER);
    doc.setLanguage('es-CL');
    const fonts: Fonts = {
        sans: await doc.embedFont(StandardFonts.Helvetica), sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
        serif: await doc.embedFont(StandardFonts.TimesRoman), serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
        serifItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    };
    const logo = await doc.embedPng(Buffer.from(B.logoPngBase64, 'base64'));
    let page: PDFPage = doc.addPage([PAGE.w, PAGE.h]);
    let y = PAGE.h - PAGE.top;
    const newPage = () => { page = doc.addPage([PAGE.w, PAGE.h]); y = PAGE.h - PAGE.top; };
    const ensure = (height: number) => { if (y - height < PAGE.bottom) newPage(); };

    type Token = { text: string; font: PDFFont };
    const tokens = (runs: Run[], regular: PDFFont, bold: PDFFont): Token[] => runs.flatMap(r =>
        pdfSafe(r.text).split(/(\s+)/).filter(Boolean).map(text => ({ text, font: r.bold ? bold : regular })));
    function wrap(list: Token[], size: number, width: number) {
        const lines: Token[][] = [[]];
        let lineWidth = 0;
        for (const token of list) {
            const isSpace = /^\s+$/.test(token.text);
            const tokenWidth = token.font.widthOfTextAtSize(isSpace ? ' ' : token.text, size);
            if (!isSpace && lineWidth + tokenWidth > width && lines.at(-1)!.length) { lines.push([]); lineWidth = 0; }
            if (isSpace && !lines.at(-1)!.length) continue;
            lines.at(-1)!.push(isSpace ? { ...token, text: ' ' } : token);
            lineWidth += tokenWidth;
        }
        return lines.map(line => { while (line.length && line.at(-1)!.text === ' ') line.pop(); return line; }).filter(l => l.length);
    }
    function drawLines(lines: Token[][], x: number, size: number, color = hex(B.ink), leading = size * 1.42) {
        for (const line of lines) {
            ensure(leading);
            let cx = x;
            for (const token of line) {
                page.drawText(token.text, { x: cx, y: y - size, size, font: token.font, color });
                cx += token.font.widthOfTextAtSize(token.text, size);
            }
            y -= leading;
        }
    }

    let numberedCount = 0;
    let previous = '';
    for (const block of parseDraft(markdown)) {
        if (block.kind !== 'numbered') numberedCount = 0;
        if (block.kind === 'heading') {
            const size = [18, 14, 12][block.level - 1];
            const color = hex([B.copperDeep, B.copper, B.ink][block.level - 1]);
            y -= block.level === 1 ? 4 : 10;
            ensure(size * 3);
            drawLines(wrap(tokens([{ text: block.text }], fonts.serifBold, fonts.serifBold), size, WIDTH), PAGE.margin, size, color, size * 1.3);
            if (block.level === 1) { page.drawLine({ start: { x: PAGE.margin, y: y - 1 }, end: { x: PAGE.margin + 48, y: y - 1 }, thickness: 1.5, color: hex(B.copper) }); y -= 10; }
            y -= 4;
        } else if (block.kind === 'paragraph') {
            const text = block.runs.map(r => r.text).join('');
            if (text.includes(LEGAL_DRAFT_MARKER)) {
                const lines = wrap(tokens([{ text, bold: true }], fonts.sans, fonts.sansBold), 10, WIDTH - 20);
                const height = lines.length * 14 + 12;
                ensure(height);
                page.drawRectangle({ x: PAGE.margin, y: y - height, width: WIDTH, height, color: hex(B.copperBg) });
                page.drawRectangle({ x: PAGE.margin, y: y - height, width: 3, height, color: hex(B.copper) });
                y -= 6;
                drawLines(lines, PAGE.margin + 12, 10, hex(B.copperDeep), 14);
                y -= 12;
            } else {
                drawLines(wrap(tokens(block.runs, fonts.sans, fonts.sansBold), 10.5, WIDTH), PAGE.margin, 10.5);
                y -= 5;
            }
        } else if (block.kind === 'bullet' || block.kind === 'numbered') {
            const label = block.kind === 'bullet' ? '•' : `${previous === 'numbered' ? ++numberedCount : (numberedCount = 1)}.`;
            const lines = wrap(tokens(block.runs, fonts.sans, fonts.sansBold), 10.5, WIDTH - 22);
            ensure(15);
            page.drawText(label, { x: PAGE.margin + 4, y: y - 10.5, size: 10.5, font: fonts.sansBold, color: hex(B.copper) });
            drawLines(lines, PAGE.margin + 22, 10.5);
            y -= 2;
        } else if (block.kind === 'rule') {
            ensure(12);
            page.drawLine({ start: { x: PAGE.margin, y: y - 4 }, end: { x: PAGE.margin + WIDTH, y: y - 4 }, thickness: 0.6, color: hex(B.copperBg) });
            y -= 12;
        } else if (block.kind === 'table') {
            const columns = Math.max(1, block.header.length);
            const colWidth = WIDTH / columns;
            const row = (cells: string[], head: boolean) => {
                const wrapped = cells.map(c => wrap(tokens([{ text: c, bold: head }], fonts.sans, fonts.sansBold), 9, colWidth - 10));
                const height = Math.max(1, ...wrapped.map(w => w.length)) * 12 + 8;
                if (y - height < PAGE.bottom) newPage();
                if (head) page.drawRectangle({ x: PAGE.margin, y: y - height, width: WIDTH, height, color: hex(B.copper) });
                wrapped.forEach((lines, k) => {
                    const x = PAGE.margin + k * colWidth;
                    page.drawRectangle({ x, y: y - height, width: colWidth, height, borderColor: hex(B.line), borderWidth: 0.6 });
                    lines.forEach((line, li) => {
                        let cx = x + 5;
                        for (const token of line) {
                            page.drawText(token.text, { x: cx, y: y - 4 - 9 - li * 12, size: 9, font: token.font, color: head ? rgb(1, 1, 1) : hex(B.ink) });
                            cx += token.font.widthOfTextAtSize(token.text, 9);
                        }
                    });
                });
                y -= height;
            };
            y -= 4;
            row(block.header, true);
            for (const cells of block.rows) {
                if (y - 20 < PAGE.bottom) { newPage(); row(block.header, true); }
                row(cells, false);
            }
            y -= 10;
        }
        previous = block.kind;
    }

    const pages = doc.getPages();
    const community = pdfSafe(options.community || 'Comunidad [nombre a completar]');
    pages.forEach((p, index) => {
        const top = PAGE.h - 40;
        p.drawImage(logo, { x: PAGE.margin, y: top - 24, width: 26, height: 26 });
        let x = PAGE.margin + 34;
        for (const [text, font, color] of [['Convive', fonts.serif, B.ink], [' & ', fonts.serifItalic, B.copper], ['Connect', fonts.serif, B.ink]] as const) {
            p.drawText(text, { x, y: top - 18, size: 15, font, color: hex(color) });
            x += font.widthOfTextAtSize(text, 15);
        }
        const cw = fonts.sans.widthOfTextAtSize(community, 9);
        p.drawText(community, { x: PAGE.w - PAGE.margin - cw, y: top - 16, size: 9, font: fonts.sans, color: hex(B.inkMuted) });
        p.drawLine({ start: { x: PAGE.margin, y: top - 32 }, end: { x: PAGE.w - PAGE.margin, y: top - 32 }, thickness: 1, color: hex(B.copper) });
        p.drawLine({ start: { x: PAGE.margin, y: 50 }, end: { x: PAGE.w - PAGE.margin, y: 50 }, thickness: 0.5, color: hex(B.line) });
        p.drawText(pdfSafe(LEGAL_DRAFT_MARKER), { x: PAGE.margin, y: 36, size: 8, font: fonts.sansBold, color: hex(B.copperDeep) });
        const markWidth = fonts.sansBold.widthOfTextAtSize(pdfSafe(LEGAL_DRAFT_MARKER), 8);
        p.drawText(' · No es asesoría legal', { x: PAGE.margin + markWidth, y: 36, size: 8, font: fonts.sans, color: hex(B.inkMuted) });
        const label = `Página ${index + 1} de ${pages.length}`;
        p.drawText(label, { x: PAGE.w - PAGE.margin - fonts.sans.widthOfTextAtSize(label, 8), y: 36, size: 8, font: fonts.sans, color: hex(B.inkMuted) });
    });
    return Buffer.from(await doc.save());
}
