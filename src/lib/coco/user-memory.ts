/**
 * user-memory.ts — Memoria de CoCo entre sesiones.
 *
 * Hechos durables que el residente le contó a CoCo (preferencias, contexto) y
 * conviene recordar en futuras conversaciones, más allá de la sesión de 24h.
 * Se mantiene acotada por usuario para que no crezca sin límite.
 */

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

/**
 * Lectura y escritura: `memory.ts` (tabla `agent_memories`, con copia en
 * `coco_user_memory`). Aquí queda solo el cálculo puro que usan los tests.
 */

export { forgetUserMemory, getUserMemory, rememberFact } from './memory';

/** Bloque de contexto para inyectar en el prompt de CoCo. '' si no hay memoria. */
export function buildMemoryContext(facts: string[]): string {
    if (!facts.length) return '';
    return `\n\n## Lo que recuerdas de esta persona (de conversaciones anteriores)\n`
        + facts.map(fact => `- ${fact}`).join('\n')
        + `\nUsa esto con naturalidad cuando sea pertinente; no lo recites sin motivo.`;
}
