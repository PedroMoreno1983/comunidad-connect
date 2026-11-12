import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({ supabaseAdmin: {} }));

import { groupThreads } from '@/lib/coco/threadGroups';
import { DEFAULT_THREAD_TITLE, threadTitle, webRetentionDays } from '@/lib/coco/session-store';
import { inferNavigation, isGoIntent, recentAssistantTexts } from '@/lib/coco/navigationIntent';
import { getSafeCoCoNavigation } from '@/lib/coco/navigation';
import { latestShoppingListId, supermarketListLink } from '@/lib/coco/shoppingTools';

const LIST_ID = '3f1c2a9e-5b7d-4c8e-9a10-1b2c3d4e5f60';

describe('conversaciones de CoCo', () => {
    it('agrupa como los chats conocidos: fijadas arriba y el resto por antigüedad', () => {
        const now = new Date('2026-11-12T15:00:00');
        const groups = groupThreads([
            { id: 'a', title: 'Gastos de octubre', updatedAt: '2026-11-12T10:00:00' },
            { id: 'b', title: 'Lista del super', updatedAt: '2026-11-11T20:00:00' },
            { id: 'c', title: 'Reclamo ascensor', updatedAt: '2026-11-08T09:00:00' },
            { id: 'd', title: 'Asamblea', updatedAt: '2026-09-01T09:00:00', pinned: true },
            { id: 'e', title: 'Mudanza', updatedAt: '2026-08-01T09:00:00' },
        ], '', now);
        expect(groups.map(group => [group.label, group.threads.map(thread => thread.id)])).toEqual([
            ['Fijadas', ['d']],
            ['Hoy', ['a']],
            ['Ayer', ['b']],
            ['Últimos 7 días', ['c']],
            ['Anteriores', ['e']],
        ]);
        expect(groupThreads([{ id: 'a', title: 'Lista del Súper', updatedAt: '2026-11-12T10:00:00' }], 'súper', now)[0].threads).toHaveLength(1);
        expect(groupThreads([{ id: 'a', title: 'Gastos', updatedAt: '2026-11-12T10:00:00' }], 'super', now)).toEqual([]);
    });

    it('titula con el primer mensaje mientras nadie la renombró', () => {
        expect(threadTitle(DEFAULT_THREAD_TITLE, { role: 'user', content: 'armame una lista de supermercado' })).toBe('armame una lista de supermercado');
        expect(threadTitle('Compras del mes', { role: 'user', content: 'hola' })).toBe('Compras del mes');
        expect(threadTitle(undefined, null)).toBe(DEFAULT_THREAD_TITLE);
        expect(threadTitle(null, { role: 'user', content: 'x'.repeat(80) })).toHaveLength(56);
    });

    it('las conversaciones de la app duran un año y las fijadas no vencen; WhatsApp sigue en un día', () => {
        expect(webRetentionDays('web:u:t')).toBe(365);
        expect(webRetentionDays('web:u:t', true)).toBe(3650);
        expect(webRetentionDays('wa:56911112222')).toBe(1);
    });
});

describe('"llévame ahí"', () => {
    it('reconoce pedidos explícitos de ir, pero no acciones como abrir el portón', () => {
        expect(isGoIntent('llevame ahí')).toBe(true);
        expect(isGoIntent('Llévame al supermercado')).toBe(true);
        expect(isGoIntent('ábrelo')).toBe(true);
        expect(isGoIntent('quiero ir a mis gastos')).toBe(true);
        expect(isGoIntent('abre el portón por favor')).toBe(false);
        expect(isGoIntent('¿cuánto debo?')).toBe(false);
    });

    it('deduce el destino de lo último que dijo CoCo cuando el mensaje solo apunta', () => {
        const recent = ['Guardé 7 productos en tu lista personal. Puedes abrirla en Supermercado para comparar precios y preparar el carro.'];
        // Página principal o comparador: las dos abren la lista guardada (ver route.ts).
        expect(inferNavigation('llevame ahí', recent, 'resident')).toMatch(/^\/resident\/supermercado(\/comparador)?$/);
        expect(inferNavigation('¿cuánto debo?', recent, 'resident')).toBeUndefined();
    });

    it('lee el texto de los turnos de CoCo, con o sin bloques', () => {
        expect(recentAssistantTexts([
            { role: 'user', content: 'hola' },
            { role: 'assistant', content: [{ type: 'text', text: 'Abre Supermercado' }, { type: 'tool_use' }] },
            { role: 'assistant', content: 'Listo' },
        ])).toEqual(['Listo', 'Abre Supermercado']);
    });
});

describe('supermercado con la lista cargada', () => {
    it('solo deja pasar la query del supermercado, y con un patrón estricto', () => {
        expect(getSafeCoCoNavigation(supermarketListLink(LIST_ID, 'Santa Isabel'))).toBe(`/resident/supermercado?list=${LIST_ID}&store=Santa+Isabel`);
        expect(getSafeCoCoNavigation(`/resident/supermercado?list=${LIST_ID}`)).toBe(`/resident/supermercado?list=${LIST_ID}`);
        expect(getSafeCoCoNavigation('/resident/supermercado?list=nope')).toBeUndefined();
        expect(getSafeCoCoNavigation(`/resident/supermercado?list=${LIST_ID}&next=https://evil.test`)).toBeUndefined();
        expect(getSafeCoCoNavigation(`/expenses?list=${LIST_ID}`)).toBeUndefined();
        expect(getSafeCoCoNavigation('/resident/supermercado')).toBe('/resident/supermercado');
    });

    it('encuentra la lista recién guardada en la conversación', () => {
        const conversation = [
            { role: 'user', content: 'arroz, pan, leche' },
            { role: 'user', content: [{ type: 'tool_result', content: JSON.stringify({ success: true, list_id: LIST_ID, item_count: 3 }) }] },
            { role: 'assistant', content: 'Guardé 3 productos.' },
        ];
        expect(latestShoppingListId(conversation)).toBe(LIST_ID);
        expect(latestShoppingListId([{ role: 'assistant', content: 'nada' }])).toBeUndefined();
    });
});

describe('acciones nuevas de CoCo por rol', () => {
    it('publicar en el Marketplace es solo de residentes; pedir servicios, de todos', async () => {
        const { isToolAllowedForRole } = await import('@/lib/coco/tools');
        expect(isToolAllowedForRole('publish_marketplace_item', 'resident')).toBe(true);
        expect(isToolAllowedForRole('publish_marketplace_item', 'admin')).toBe(false);
        expect(isToolAllowedForRole('publish_marketplace_item', 'concierge')).toBe(false);
        expect(isToolAllowedForRole('request_service', 'admin')).toBe(true);
        expect(isToolAllowedForRole('compare_shopping_list', 'resident')).toBe(true);
        // El supermercado personal es una ruta de residente: al personal no se le ofrece.
        expect(isToolAllowedForRole('compare_shopping_list', 'admin')).toBe(false);
        expect(isToolAllowedForRole('save_shopping_list', 'concierge')).toBe(false);
        expect(isToolAllowedForRole('vote_in_poll', 'admin')).toBe(false);
    });
});

describe('revisión: casos borde de navegación y acciones', () => {
    const recent = ['Puedes abrirla en Supermercado para comparar precios y preparar el carro.'];

    it('"la" y "lo" son artículos: no reusan la pantalla de antes', () => {
        expect(inferNavigation('vamos a la reunión', recent, 'resident')).toBeUndefined();
        expect(inferNavigation('quiero ir a la casa', recent, 'resident')).toBeUndefined();
        expect(inferNavigation('ábrelo', recent, 'resident')).toMatch(/^\/resident\/supermercado/);
        expect(inferNavigation('llévame allá', recent, 'resident')).toMatch(/^\/resident\/supermercado/);
    });

    it('recupera la lista desde el resumen de la confirmación, que trae el enlace', () => {
        const summary = `Guardar lista de compras: completada. Guardé 7 productos en tu lista personal: [Abrir lista](/resident/supermercado?list=${LIST_ID}).`;
        expect(latestShoppingListId([{ role: 'assistant', content: summary }])).toBe(LIST_ID);
    });

    it('no acepta pedir un servicio para una fecha que ya pasó', async () => {
        const { requestServiceForUser } = await import('@/lib/coco/residentActions');
        const untouched = new Proxy({}, { get: () => { throw new Error('no debería consultar la base'); } });
        const result = await requestServiceForUser(untouched as never, 'c', 'u', 'resident', {
            provider_id: LIST_ID, preferred_date: '2020-01-10', preferred_time: '10:00', description: 'Fuga en el baño',
        });
        expect(result).toEqual({ error: expect.stringContaining('ya pasó') });
    });
});

describe('revisión: tienda recomendada y destinos por rol', () => {
    it('conserva la tienda que recomendó la comparación', async () => {
        const { latestShoppingListLink } = await import('@/lib/coco/shoppingTools');
        const reply = `La mejor opción es Santa Isabel: [Abrir carro en Santa Isabel](/resident/supermercado?list=${LIST_ID}&store=Santa+Isabel)`;
        expect(latestShoppingListLink([{ role: 'assistant', content: reply }])).toBe(`/resident/supermercado?list=${LIST_ID}&store=Santa+Isabel`);
        expect(latestShoppingListLink([{ role: 'user', content: [{ type: 'tool_result', content: JSON.stringify({ list_id: LIST_ID }) }] }]))
            .toBe(`/resident/supermercado?list=${LIST_ID}`);
    });

    it('conserjería no pide servicios: no puede abrir /services para gestionarlos', async () => {
        const { isToolAllowedForRole } = await import('@/lib/coco/tools');
        expect(isToolAllowedForRole('request_service', 'concierge')).toBe(false);
        expect(isToolAllowedForRole('request_service', 'resident')).toBe(true);
        expect(isToolAllowedForRole('request_service', 'admin')).toBe(true);
    });
});
