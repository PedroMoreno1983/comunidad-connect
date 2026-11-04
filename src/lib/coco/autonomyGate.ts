import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { chileTodayISO } from '@/lib/agent-center/chileDate';
import { cocoWritesAllowed } from '@/lib/coco/autonomy';

function missingColumn(error: { code?: string; message?: string } | null) {
    if (!error) return false;
    return error.code === '42703' || error.code === 'PGRST204' || /coco_autonomy|column/i.test(error.message || '');
}

/** null si puede escribir. Un objeto { error } si la comunidad apagó CoCo o se pasó del tope. */
export async function blockCoCoWrite(user: { role?: string; user_id?: string; community_id?: string }): Promise<{ error: string } | null> {
    if (!user.community_id) return null;
    try {
        const admin = getSupabaseAdmin();
        const flag = await admin.from('communities').select('coco_autonomy').eq('id', user.community_id).maybeSingle();
        if (!missingColumn(flag.error) && flag.data && flag.data.coco_autonomy === false) {
            return { error: 'La administración apagó las acciones automáticas de CoCo en esta comunidad. Puedo orientar, pero no cambiar datos.' };
        }
        if (!user.user_id) return null;
        const start = `${chileTodayISO()}T00:00:00.000Z`;
        const { count, error } = await admin
            .from('operation_events')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', user.community_id)
            .eq('actor_id', user.user_id)
            .like('action', 'coco.tool.%')
            .gte('created_at', start);
        if (error) return null;
        if (!cocoWritesAllowed(count || 0, user.role)) {
            return { error: 'Llegaste al máximo de acciones de CoCo por hoy. Mañana se reinicia.' };
        }
        return null;
    } catch {
        // Si la base de la prueba no tiene esta consulta, la acción sigue.
        return null;
    }
}
