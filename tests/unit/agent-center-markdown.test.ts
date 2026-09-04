import { describe, expect, it } from 'vitest';
import { normalizeAgentMarkdown } from '@/lib/agent-center/markdown';

describe('normalizeAgentMarkdown', () => {
    it('saca del cuerpo de la tabla la frase que CoCo escribe justo despues', () => {
        const reply = [
            'Aqui esta el detalle de las unidades morosas:',
            '| Depto | Mes | Monto |',
            '|---|---|---|',
            '| **805** | mayo 2026 | $132.900 |',
            '| **1204** | mayo 2026 | $148.600 |',
            'El depto **1204** es el caso a priorizar.',
        ].join('\n');

        const lines = normalizeAgentMarkdown(reply).split('\n');
        // La ultima fila y la conclusion quedan separadas por una linea en blanco.
        expect(lines[lines.length - 3]).toBe('| **1204** | mayo 2026 | $148.600 |');
        expect(lines[lines.length - 2]).toBe('');
        expect(lines[lines.length - 1]).toBe('El depto **1204** es el caso a priorizar.');
    });

    it('no toca un texto sin tablas', () => {
        const reply = 'Hola.\nTe dejo dos cosas:\n- Una\n- Otra';
        expect(normalizeAgentMarkdown(reply)).toBe(reply);
    });

    it('respeta una tabla que ya venia bien separada', () => {
        const reply = ['| a | b |', '|---|---|', '| 1 | 2 |', '', 'Listo.'].join('\n');
        expect(normalizeAgentMarkdown(reply)).toBe(reply);
    });

    it('tolera texto vacio', () => {
        expect(normalizeAgentMarkdown('')).toBe('');
    });
});
