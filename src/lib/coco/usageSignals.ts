import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { CocoInsights, CocoTopicKey } from '@/lib/types';

/**
 * DATOS AGREGADOS DE CoCo PARA LA ADMINISTRACIÓN (17-11-2026).
 *
 * La administración no ve conversaciones (ver [[confidencialidad de CoCo]] en
 * src/lib/operations/audit.ts), pero sí le sirve saber, en conjunto, cuántos
 * vecinos usan CoCo y sobre qué temas preguntan. Por cada mensaje se guarda
 * solo el TEMA (una etiqueta de una lista cerrada), nunca el texto. La tabla
 * coco_usage_signals no tiene políticas para usuarios: solo el servidor la lee,
 * y lo que sale hacia la administración pasa por getCommunityInsights, que
 * esconde todo grupo de menos de MIN_PEOPLE personas distintas.
 */

/** Un tema se muestra solo si lo consultaron al menos estas personas distintas. */
export const MIN_PEOPLE = 3;

export const COCO_TOPICS: Record<CocoTopicKey, { label: string; pattern: RegExp }> = {
    gastos_comunes: { label: 'Gastos comunes y pagos', pattern: /gasto|cuota|pago|pagar|deuda|cobro|boleta|estado de cuenta|multa|prorrateo/ },
    reservas: { label: 'Reservas de espacios comunes', pattern: /reserv|quincho|piscina|sala|gimnasio|terraza|salon|sal[oó]n/ },
    mantencion: { label: 'Mantención y reparaciones', pattern: /filtraci|gote|ascensor|luz|electric|gasfit|cañer|caner|repar|mantenci|ruido de agua|basura|aseo/ },
    convivencia: { label: 'Convivencia y ruidos', pattern: /ruido|vecino|mascota|perro|fiesta|humo|convivencia|reclamo/ },
    seguridad_accesos: { label: 'Seguridad, visitas y accesos', pattern: /visita|porter|conserj|acceso|seguridad|robo|c[aá]mara|encomienda|delivery|port[oó]n/ },
    estacionamientos_bodegas: { label: 'Estacionamientos y bodegas', pattern: /estacionamiento|bodega|auto|patente/ },
    asambleas_votaciones: { label: 'Asambleas y votaciones', pattern: /asamblea|votaci|votar|comit[eé]|acta/ },
    reglamento_legal: { label: 'Reglamento y temas legales', pattern: /reglamento|ley|legal|copropiedad|derecho|abogad/ },
    compras_marketplace: { label: 'Compras y marketplace', pattern: /supermercado|compra|lider|jumbo|vend|marketplace|receta/ },
    otros: { label: 'Otros temas', pattern: /$^/ },
};

/** El tema de un mensaje, por palabras clave. Sin texto guardado: solo esta etiqueta. */
export function classifyTopic(message: string): CocoTopicKey {
    const text = message.toLocaleLowerCase('es-CL').normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const [key, topic] of Object.entries(COCO_TOPICS) as Array<[CocoTopicKey, (typeof COCO_TOPICS)[CocoTopicKey]]>) {
        if (key !== 'otros' && topic.pattern.test(text)) return key;
    }
    return 'otros';
}

/** Registra el tema de un mensaje de un residente. Nunca frena la respuesta de CoCo. */
export async function recordUsageSignal(input: { communityId: string; userId: string; role: string; channel: 'web' | 'whatsapp'; message: string }) {
    if (!input.communityId || !input.userId || !input.message.trim()) return;
    // Solo residentes: lo del personal no es "lo que preguntan los vecinos".
    if (['admin', 'concierge', 'superadmin'].includes(input.role)) return;
    const { error } = await getSupabaseAdmin().from('coco_usage_signals').insert({
        community_id: input.communityId,
        user_id: input.userId,
        channel: input.channel,
        topic: classifyTopic(input.message),
    });
    if (error) console.warn('[coco] no se pudo registrar el tema', error.message);
}

type SignalRow = { user_id: string; topic: string; channel: string };

/** Cálculo puro (se prueba sin base): agrega y esconde lo que identificaría a alguien. */
export function aggregateSignals(rows: SignalRow[], days: number): CocoInsights {
    const people = new Set(rows.map(row => row.user_id));
    const byTopic = new Map<CocoTopicKey, { messages: number; people: Set<string> }>();
    for (const row of rows) {
        const key = (row.topic in COCO_TOPICS ? row.topic : 'otros') as CocoTopicKey;
        const entry = byTopic.get(key) || { messages: 0, people: new Set<string>() };
        entry.messages += 1;
        entry.people.add(row.user_id);
        byTopic.set(key, entry);
    }
    const shown = [...byTopic.entries()]
        .filter(([, entry]) => entry.people.size >= MIN_PEOPLE)
        .map(([key, entry]) => ({ topic: key, label: COCO_TOPICS[key].label, messages: entry.messages, people: entry.people.size }))
        .sort((a, b) => b.people - a.people || b.messages - a.messages);
    const hiddenTopics = byTopic.size - shown.length;
    const enough = people.size >= MIN_PEOPLE;
    return {
        days,
        minPeople: MIN_PEOPLE,
        // Con menos de MIN_PEOPLE vecinos, ni siquiera el total se muestra: sería casi nombrarlos.
        residents: enough ? people.size : null,
        messages: enough ? rows.length : null,
        whatsappShare: enough && rows.length ? Math.round(100 * rows.filter(row => row.channel === 'whatsapp').length / rows.length) : null,
        topics: enough ? shown : [],
        hiddenTopics: enough ? hiddenTopics : byTopic.size,
    };
}

export async function getCommunityInsights(communityId: string, days = 30): Promise<CocoInsights> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await getSupabaseAdmin()
        .from('coco_usage_signals')
        .select('user_id, topic, channel')
        .eq('community_id', communityId)
        .gte('created_at', since)
        .limit(20_000);
    if (error) throw error;
    return aggregateSignals((data || []) as SignalRow[], days);
}
