import { describe, expect, it } from 'vitest';
import { buildLocalCoCoFallback } from '@/app/api/coco/route';
import { requiredMutationTool } from '@/lib/coco/agent';

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
});
