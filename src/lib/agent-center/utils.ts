import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

/**
 * Inserta un registro de auditoría sin interrumpir el flujo principal.
 * Retorna el id insertado o null si falló (el error queda en logs).
 */
export async function bestEffortInsert(table: string, payload: Record<string, unknown>) {
    try {
        const { data, error } = await getSupabaseAdmin().from(table).insert(payload).select('id').maybeSingle();
        if (error) {
            console.error(`[agent-center] bestEffortInsert failed for ${table}`, error);
            return null;
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
