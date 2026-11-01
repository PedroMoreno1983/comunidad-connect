/** Convierte el Markdown de un borrador en bloques simples para Word y PDF. */
export type Run = { text: string; bold?: boolean };
export type Block =
    | { kind: 'heading'; level: 1 | 2 | 3; text: string }
    | { kind: 'paragraph'; runs: Run[] }
    | { kind: 'bullet'; runs: Run[] }
    | { kind: 'numbered'; n: number; runs: Run[] }
    | { kind: 'table'; header: string[]; rows: string[][] }
    | { kind: 'rule' };

export function parseRuns(text: string): Run[] {
    const clean = text.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1 ($2)').replace(/`/g, '');
    return clean.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part => part.startsWith('**') && part.endsWith('**') && part.length > 4
        ? { text: part.slice(2, -2), bold: true }
        : { text: part.replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,;:])/g, '$1$2') });
}

export const plain = (text: string) => parseRuns(text).map(r => r.text).join('');
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => plain(c.trim()));

export function parseDraft(markdown: string): Block[] {
    const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
    const blocks: Block[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
            const header = cells(line);
            const rows: string[][] = [];
            i += 2;
            while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
            i--;
            blocks.push({ kind: 'table', header, rows: rows.map(r => header.map((_, k) => r[k] ?? '')) });
            continue;
        }
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) { blocks.push({ kind: 'heading', level: Math.min(3, heading[1].length) as 1 | 2 | 3, text: plain(heading[2]) }); continue; }
        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push({ kind: 'rule' }); continue; }
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        if (bullet) { blocks.push({ kind: 'bullet', runs: parseRuns(bullet[1]) }); continue; }
        const numbered = line.match(/^\s*(\d{1,3})[.)]\s+(.*)$/);
        if (numbered) { blocks.push({ kind: 'numbered', n: Number(numbered[1]), runs: parseRuns(numbered[2]) }); continue; }
        blocks.push({ kind: 'paragraph', runs: parseRuns(line.trim()) });
    }
    return blocks;
}
