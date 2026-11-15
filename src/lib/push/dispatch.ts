/**
 * Despacho de un aviso (`notifications`) como push. Lo llama el trigger de la
 * base por pg_net con solo el id: aquí se vuelve a leer el aviso con la llave
 * de servicio y se envía una sola vez (push_sent_at se reclama de forma atómica).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPush } from './fcm';
import { pushLinkFor } from './links';
import type { PushSendResult } from '@/lib/types';

/** Avisos más viejos que esto no salen como push (un reintento tardío sería ruido). */
export const PUSH_MAX_AGE_MS = 10 * 60_000;

export function isFreshEnough(createdAt: string, now = Date.now()): boolean {
    const time = Date.parse(createdAt);
    return Number.isFinite(time) && now - time <= PUSH_MAX_AGE_MS;
}

export async function dispatchNotificationPush(admin: SupabaseClient, id: string): Promise<PushSendResult & { status: string }> {
    const { data: claimed, error } = await admin.from('notifications')
        .update({ push_sent_at: new Date().toISOString() })
        .eq('id', id)
        .is('push_sent_at', null)
        .select('id, user_id, title, body, link, created_at')
        .maybeSingle();
    if (error) throw error;
    if (!claimed) return { status: 'ya enviado o inexistente', sent: 0, failed: 0, invalidTokens: [] };
    if (!isFreshEnough(String(claimed.created_at))) return { status: 'aviso antiguo', sent: 0, failed: 0, invalidTokens: [] };

    const release = () => admin.from('notifications').update({ push_sent_at: null }).eq('id', claimed.id);

    let result: PushSendResult;
    try {
        const { data: devices, error: devicesError } = await admin.from('push_devices')
            .select('token')
            .eq('user_id', claimed.user_id);
        if (devicesError) throw devicesError;
        const tokens = (devices ?? []).map(row => String(row.token));

        result = await sendPush(tokens, {
            notificationId: String(claimed.id),
            title: String(claimed.title ?? 'Convive Connect'),
            body: String(claimed.body ?? ''),
            link: pushLinkFor(claimed.link),
        });
    } catch (sendError) {
        // Falló la consulta, el OAuth de Google o la red: se libera para que un reintento lo envíe.
        await release();
        throw sendError;
    }

    if (result.invalidTokens.length) {
        await admin.from('push_devices').delete().in('token', result.invalidTokens);
    }
    if (shouldReleaseClaim(result)) {
        await release();
        return { status: result.skipped ? 'sin credencial' : 'falló, se puede reintentar', ...result };
    }
    return { status: 'enviado', ...result };
}

/** Sin credencial, o ningún teléfono lo recibió por un error pasajero: el aviso queda sin enviar. */
export function shouldReleaseClaim(result: PushSendResult): boolean {
    return Boolean(result.skipped) || (result.sent === 0 && result.failed > 0);
}
