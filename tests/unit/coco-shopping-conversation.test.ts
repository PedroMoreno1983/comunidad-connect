import { describe, expect, it } from 'vitest';
import { buildLocalCoCoFallback } from '@/app/api/coco/route';
import { requiredMutationTool } from '@/lib/coco/agent';
import { shoppingListFromConversation } from '@/lib/coco/shoppingConversation';

describe('CoCo continúa la lista de compras', () => {
    it('interpreta la lista como respuesta al turno previo sin saludar de nuevo', () => {
        const reply = buildLocalCoCoFallback('arroz, pan, lechuga, garbanzos, leche', {
            name: 'Andrea', role: 'resident', currentPage: '/chat',
            recentConversation: [{ id: '1', role: 'assistant', text: '¿Quieres buscar arroz en el supermercado?' }],
        });
        expect(reply.reply).toContain('arroz, pan, lechuga, garbanzos, leche');
        expect(reply.reply).not.toMatch(/hola|¡bienvenida!/i);
        expect(reply.navigate).toBeUndefined();
    });

    it('prepara el guardado como acción confirmable cuando la persona lo pide', () => {
        expect(requiredMutationTool('Guarda esta lista de compras', 'resident')).toBe('save_shopping_list');
    });

    it('convierte la respuesta al supermercado en la lista exacta que se guardará', () => {
        const conversation = [{ role: 'assistant' as const, content: '¿Marketplace vecinal o Supermercado a domicilio para el arroz?' }];
        expect(shoppingListFromConversation('arroz, pan, lechuga, garbanzos, leche', conversation))
            .toBe('arroz, pan, lechuga, garbanzos, leche');
    });

    it('recupera la lista del hilo cuando la persona pide guardarla', () => {
        const conversation = [
            { role: 'assistant' as const, content: '¿Supermercado a domicilio?' },
            { role: 'user' as const, content: 'arroz, pan, lechuga, garbanzos, leche' },
            { role: 'assistant' as const, content: 'Anoté tu lista. ¿Quieres que la guarde?' },
        ];
        expect(shoppingListFromConversation('Sí', conversation)).toBe('arroz, pan, lechuga, garbanzos, leche');
    });

    it('quita la instrucción antes de guardar una lista explícita', () => {
        expect(shoppingListFromConversation('Guarda esta lista de compras: arroz, pan, leche', []))
            .toBe('arroz, pan, leche');
    });

    it('no guarda una enumeración sin contexto de compras', () => {
        expect(shoppingListFromConversation('arroz, pan, lechuga', [
            { role: 'assistant', content: 'Cuéntame de qué trata tu reclamo.' },
        ])).toBeNull();
    });
});
