import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

// Retención de las tablas de auditoría del Agent Center. Son append-only y sin
// esto crecían sin límite ("las conversaciones se apilan infinitamente"): además
// de ocupar espacio, degradan los count() del resumen. Se conserva una ventana
// reciente por comunidad; lo más viejo se descarta. La bitácora de la UI ya solo
// muestra las últimas ~12, así que recortar el histórico no afecta lo visible.
const RETAINED_LOG_TABLES: Record<string, number> = {
    agent_activity_log: 500,
    agent_runs: 500,
    agent_tool_calls: 500,
    agent_trigger_events: 300,
};

// El trim corre solo en una fracción de los inserts: mantiene la tabla acotada
// sin pagar dos queries extra en cada acción. Entre trims puede excederse el tope
// por unas pocas filas, lo cual es irrelevante frente a un crecimiento ilimitado.
const TRIM_PROBABILITY = 0.15;

async function trimLogTable(table: string, communityId: string, keep: number) {
    try {
        const admin = getSupabaseAdmin();
        // created_at de la fila (keep+1)-ésima más nueva: todo lo anterior sobra.
        const { data } = await admin
            .from(table)
            .select('created_at')
            .eq('community_id', communityId)
            .order('created_at', { ascending: false })
            .range(keep, keep);
        const cutoff = data?.[0]?.created_at;
        if (cutoff) {
            await admin.from(table).delete().eq('community_id', communityId).lt('created_at', cutoff);
        }
    } catch (error) {
        console.error(`[agent-center] trimLogTable failed for ${table}`, error);
    }
}

/**
 * Inserta un registro de auditoría sin interrumpir el flujo principal.
 * Retorna el id insertado o null si falló (el error queda en logs).
 *
 * Para las tablas de auditoría con retención, ocasionalmente recorta el histórico
 * de la comunidad para que no crezca sin límite.
 */
export async function bestEffortInsert(table: string, payload: Record<string, unknown>) {
    try {
        const { data, error } = await getSupabaseAdmin().from(table).insert(payload).select('id').maybeSingle();
        if (error) {
            console.error(`[agent-center] bestEffortInsert failed for ${table}`, error);
            return null;
        }

        const keep = RETAINED_LOG_TABLES[table];
        const communityId = payload.community_id;
        if (keep && typeof communityId === 'string' && Math.random() < TRIM_PROBABILITY) {
            await trimLogTable(table, communityId, keep);
        }

        return typeof data?.id === 'string' ? data.id : null;
    } catch (error) {
        console.error(`[agent-center] bestEffortInsert threw for ${table}`, error);
        return null;
    }
}

/** UUID v4 determinista derivado de los componentes dados, para upserts idempotentes. */
export function stableNotificationId(...parts: string[]) {
    const hash = createHash('sha256').update(parts.join(':')).digest('hex');
    const variant = ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(18, 20)}-${hash.slice(20, 32)}`;
}
