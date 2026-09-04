/**
 * markdown.ts -- Normaliza el markdown que escribe CoCo antes de pintarlo.
 *
 * CoCo cierra una tabla y sigue con la explicacion en la linea inmediatamente
 * siguiente, sin dejar una linea en blanco. GFM lee esa frase como una fila mas
 * y la encierra dentro de la tabla, en una celda de la primera columna: la
 * conclusion ("el depto 1204 es el caso a priorizar") terminaba disfrazada de
 * dato. Separar el bloque de la prosa que viene detras deja ambas cosas en su
 * lugar, sin tocar el texto en si.
 */

const isTableRow = (line: string) => line.trim().startsWith('|');

export function normalizeAgentMarkdown(text: string): string {
    const lines = (text || '').split('\n');
    const out: string[] = [];
    lines.forEach((line, index) => {
        out.push(line);
        const next = lines[index + 1];
        if (isTableRow(line) && next !== undefined && next.trim() !== '' && !isTableRow(next)) {
            out.push('');
        }
    });
    return out.join('\n');
}
