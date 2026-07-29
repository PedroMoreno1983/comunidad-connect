/**
 * user-memory.ts — Memoria de CoCo entre sesiones.
 *
 * Hechos durables que el residente le contó a CoCo (preferencias, contexto) y
 * conviene recordar en futuras conversaciones, más allá de la sesión de 24h.
 * Se mantiene acotada por usuario para que no crezca sin límite.
 */

import { supabaseAdmin as supabase } from '@/lib/supabase/supabaseAdmin';

export const MAX_MEMORY_FACTS = 20;
const MAX_FACT_LENGTH = 240;

/**
 * Fusiona un hecho nuevo con los existentes: normaliza, descarta duplicados
 * (ignorando mayúsculas/espacios) y conserva los MAX más recientes. Pura y
 * testeable. El hecho nuevo queda al final (lo más nuevo).
 */
export function mergeFacts(existing: string[], incoming: string, max = MAX_MEMORY_FACTS): string[] {
    // Colapsa espacios internos para no guardar la misma idea con formato sucio.
    const fact = incoming.trim().replace(/\s+/g, ' ').slice(0, MAX_FACT_LENGTH);
    if (!fact) return existing.slice(-max);

    const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
    const kept = existing
        .map(item => item.trim())
        .filter(item => item && norm(item) !== norm(fact));

    return [...kept, fact].slice(-max);
}

/** Hechos recordados de un usuario. [] si no hay o si algo falla. */
export async function getUserMemory(userId: string): Promise<string[]> {
    if (!userId) return [];
    const { data, error } = await supabase
        .from('coco_user_memory')
        .select('facts')
        .eq('user_id', userId)
        .maybeSingle();
    if (error || !data) return [];
    return Array.isArray(data.facts) ? (data.facts as unknown[]).map(String) : [];
}

/** Guarda un hecho nuevo, acotando la memoria. Best-effort. */
export async function rememberFact(
    userId: string,
    communityId: string | null,
    fact: string,
): Promise<string[]> {
    if (!userId) return [];
    const current = await getUserMemory(userId);
    const facts = mergeFacts(current, fact);

    const { error } = await supabase
        .from('coco_user_memory')
        .upsert({ user_id: userId, community_id: communityId, facts, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) {
        console.warn('[coco] rememberFact failed:', error);
        return current;
    }
    return facts;
}

/** Borra toda la memoria de un usuario (derecho a olvido / "olvida todo"). */
export async function forgetUserMemory(userId: string): Promise<void> {
    if (!userId) return;
    await supabase.from('coco_user_memory').delete().eq('user_id', userId);
}

/** Bloque de contexto para inyectar en el prompt de CoCo. '' si no hay memoria. */
export function buildMemoryContext(facts: string[]): string {
    if (!facts.length) return '';
    return `\n\n## Lo que recuerdas de esta persona (de conversaciones anteriores)\n`
        + facts.map(fact => `- ${fact}`).join('\n')
        + `\nUsa esto con naturalidad cuando sea pertinente; no lo recites sin motivo.`;
}
