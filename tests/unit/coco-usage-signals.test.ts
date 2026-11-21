/**
 * Datos agregados de CoCo: la administración ve en conjunto cuántos vecinos usan
 * CoCo y sobre qué temas, sin textos ni nombres y sin grupos de menos de 3.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const db = vi.hoisted(() => ({ inserts: [] as Array<Record<string, unknown>>, unconfigured: false }));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => {
        if (db.unconfigured) throw new Error('Supabase sin configurar');
        return {
        from: () => ({ insert: async (row: Record<string, unknown>) => { db.inserts.push(row); return { error: null }; } }),
        };
    },
}));

import { aggregateSignals, classifyTopic, MIN_PEOPLE, recordUsageSignal } from '@/lib/coco/usageSignals';

beforeEach(() => { db.inserts = []; db.unconfigured = false; });

describe('registro del tema (auditoría 21-11-2026)', () => {
    it('sin Supabase no rechaza: es un dato secundario que se llama con void', async () => {
        db.unconfigured = true;
        await expect(recordUsageSignal({ communityId: 'c', userId: 'u', role: 'resident', channel: 'web', message: 'hola' })).resolves.toBeUndefined();
    });
});

describe('tema de un mensaje', () => {
    it('reconoce los temas de la comunidad', () => {
        expect(classifyTopic('¿Puedo reservar el quincho el sábado?')).toBe('reservas');
        expect(classifyTopic('cuánto debo de gastos comunes')).toBe('gastos_comunes');
        expect(classifyTopic('quiero vender mi bicicleta en el marketplace')).toBe('compras_marketplace');
        expect(classifyTopic('hay una filtración en el baño')).toBe('mantencion');
        expect(classifyTopic('hola')).toBe('otros');
    });
});

describe('qué se guarda', () => {
    it('solo el tema, nunca el texto', async () => {
        await recordUsageSignal({ communityId: 'com-1', userId: 'u1', role: 'resident', channel: 'web', message: 'Mi vecino del 302 hace fiestas hasta tarde' });
        expect(db.inserts).toEqual([{ community_id: 'com-1', user_id: 'u1', channel: 'web', topic: 'convivencia' }]);
        expect(JSON.stringify(db.inserts)).not.toContain('302');
    });

    it('no cuenta al personal como vecino', async () => {
        await recordUsageSignal({ communityId: 'com-1', userId: 'a1', role: 'admin', channel: 'web', message: 'reservas del mes' });
        expect(db.inserts).toHaveLength(0);
    });
});

describe('lo que ve la administración', () => {
    const row = (user: string, topic: string, channel = 'web') => ({ user_id: user, topic, channel });

    it('con menos de 3 vecinos no muestra nada, ni siquiera el total', () => {
        const insights = aggregateSignals([row('u1', 'reservas'), row('u2', 'reservas')], 30);
        expect(MIN_PEOPLE).toBe(3);
        expect(insights.residents).toBeNull();
        expect(insights.messages).toBeNull();
        expect(insights.topics).toEqual([]);
    });

    it('muestra un tema solo si lo consultaron 3 personas distintas', () => {
        const insights = aggregateSignals([
            row('u1', 'reservas'), row('u2', 'reservas'), row('u3', 'reservas', 'whatsapp'), row('u3', 'reservas'),
            row('u1', 'convivencia'), row('u1', 'convivencia'),
        ], 30);
        expect(insights.residents).toBe(3);
        expect(insights.messages).toBe(6);
        expect(insights.whatsappShare).toBe(17);
        expect(insights.topics).toEqual([{ topic: 'reservas', label: 'Reservas de espacios comunes', messages: 4, people: 3 }]);
        // Convivencia la consultó una sola persona: no aparece, solo se cuenta como tema oculto.
        expect(insights.hiddenTopics).toBe(1);
    });
});
