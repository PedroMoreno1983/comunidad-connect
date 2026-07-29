import { describe, it, expect } from 'vitest';
import { mergeFacts, buildMemoryContext, MAX_MEMORY_FACTS } from '@/lib/coco/user-memory';

describe('mergeFacts', () => {
    it('agrega el hecho nuevo al final', () => {
        expect(mergeFacts(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    });

    it('descarta duplicados ignorando mayúsculas y espacios; la frase nueva gana, limpia', () => {
        // Mismo hecho reformulado: se queda con la versión nueva, normalizada.
        expect(mergeFacts(['Soy electrodependiente'], '  soy   electrodependiente ')).toEqual(['soy electrodependiente']);
        // el duplicado se reubica al final con el texto nuevo
        expect(mergeFacts(['x', 'Prefiero la mañana'], 'prefiero la mañana')).toEqual(['x', 'prefiero la mañana']);
    });

    it('ignora hechos vacíos', () => {
        expect(mergeFacts(['a'], '   ')).toEqual(['a']);
    });

    it('conserva solo los MAX más recientes', () => {
        const many = Array.from({ length: MAX_MEMORY_FACTS + 5 }, (_, i) => `hecho ${i}`);
        const result = mergeFacts(many, 'nuevo');
        expect(result.length).toBe(MAX_MEMORY_FACTS);
        expect(result[result.length - 1]).toBe('nuevo');
        expect(result[0]).toBe(`hecho 6`); // se cayeron los más viejos
    });
});

describe('buildMemoryContext', () => {
    it('vacío cuando no hay hechos', () => {
        expect(buildMemoryContext([])).toBe('');
    });
    it('lista los hechos como contexto', () => {
        const ctx = buildMemoryContext(['Tiene un perro', 'Prefiere WhatsApp']);
        expect(ctx).toContain('- Tiene un perro');
        expect(ctx).toContain('- Prefiere WhatsApp');
    });
});
