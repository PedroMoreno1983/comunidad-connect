import { describe, expect, it } from 'vitest';
import { extractFactCandidates, isConversationClosing, linesFromConversation } from '@/lib/coco/learnFromChat';

describe('aprender al cerrar', () => {
    it('reconoce un cierre y no un gracias suelto', () => {
        expect(isConversationClosing('Chao, eso es todo')).toBe(true);
        expect(isConversationClosing('terminamos por hoy')).toBe(true);
        expect(isConversationClosing('gracias')).toBe(false);
        expect(isConversationClosing('quiero pagar el gasto común')).toBe(false);
    });

    it('propone un acuerdo del reglamento y deja fuera claves, montos y teléfonos', () => {
        const lines = linesFromConversation([
            { content: 'El reglamento dice que las mascotas circulan con correa en los espacios comunes.' },
            { content: 'Mi clave es 12345678 y debo $40.000.' },
            { content: [{ type: 'text', text: 'Acordamos que el proveedor de ascensores es la empresa del edificio.' }] },
        ]);
        const facts = extractFactCandidates(lines);
        expect(facts.map(item => item.category)).toEqual(['reglamento', 'proveedor']);
        expect(facts[0].fact).toContain('correa');
        expect(facts.map(item => item.fact).join(' ')).not.toMatch(/clave|40\.000|12345678/);
    });
});
