/**
 * session-store.ts — CoCo IA
 * Persiste sesiones de conversación en Supabase (tabla coco_sessions).
 * Funciona en Vercel serverless sin Redis.
 */

import { supabaseAdmin as supabase } from '@/lib/supabase/supabaseAdmin';

// Nota de seguridad: coco_sessions guarda el historial completo de conversaciones
// (incluye nombre, unidad, comunidad y todo lo que el residente le contó a CoCo).
// Este store SIEMPRE debe usar el cliente de servicio (bypassa RLS a propósito,
// solo desde server-side) y la tabla NUNCA debe tener una policy que permita
// acceso con la anon key — de lo contrario cualquiera podría leer el historial
// de cualquier otro usuario solo con la key pública. Ver migración
// 037_coco_sessions_lockdown.sql.

const MAX_HISTORY = 200; // historial visible por conversación; el modelo recibe una ventana menor

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string | object[];
}

export interface SessionData {
    conversation: ConversationMessage[];
    user_context: {
        user_id?: string;
        unit_id?: string;
        role?: string;
        community_id?: string;
        token?: string;
        channel?: string;
        name?: string;
        title?: string;
        /** Conversación fijada por la persona: va arriba y no vence. */
        pinned?: boolean;
        /** La persona le puso nombre: ya no se reemplaza con el primer mensaje. */
        title_locked?: boolean;
    };
    auth_state?: 'pending' | 'verified';
    auth_attempts?: number;
    last_activity?: string;
}

// ── Sesión Web / App ─────────────────────────────────────────────────────────

/**
 * Las conversaciones de la app se guardan como en cualquier chat: un año, y
 * las fijadas no vencen en la práctica. Antes eran 30 días y desaparecían sin
 * aviso. WhatsApp sigue en 1 día: es una ventana de contexto, no un historial.
 */
export function webRetentionDays(userKey: string, pinned?: boolean): number {
    if (!userKey.startsWith('web:')) return 1;
    return pinned ? 3650 : 365;
}

export const DEFAULT_THREAD_TITLE = 'Nueva conversación';

/** Título visible: el que puso la persona, o el inicio de su primer mensaje. */
export function threadTitle(storedTitle: unknown, firstTurn: unknown): string {
    const title = typeof storedTitle === 'string' ? storedTitle.trim() : '';
    if (title && title !== DEFAULT_THREAD_TITLE) return title;
    const turn = firstTurn as { role?: string; content?: unknown } | null;
    if (turn?.role === 'user' && typeof turn.content === 'string') {
        const text = turn.content.replace(/\s+/g, ' ').trim();
        if (text) return text.length > 56 ? `${text.slice(0, 55).trimEnd()}…` : text;
    }
    return DEFAULT_THREAD_TITLE;
}

export async function getSession(userKey: string): Promise<SessionData | null> {
    const { data, error } = await supabase
        .from('coco_sessions')
        .select('*')
        .eq('user_key', userKey)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

    if (error || !data) return null;
    return data as SessionData;
}

export async function saveSession(userKey: string, session: SessionData): Promise<void> {
    // Limitar historial para no explotar tokens de contexto
    const conversation = (session.conversation || []).slice(-MAX_HISTORY);
    const retentionDays = webRetentionDays(userKey, session.user_context?.pinned);
    const expires_at = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
        .from('coco_sessions')
        .upsert({
            user_key: userKey,
            conversation,
            user_context: session.user_context,
            auth_state: session.auth_state,
            auth_attempts: session.auth_attempts ?? 0,
            last_activity: new Date().toISOString(),
            expires_at,
        }, { onConflict: 'user_key' });
    if (error) throw error;
}

/**
 * Guarda un turno que CoCo ya respondió. Si Supabase falla, la respuesta de
 * texto igual se entrega: perder el historial de ese turno es mejor que
 * ocultarla. Una confirmación pendiente vive en la sesión, así que ahí el
 * error sigue subiendo y el cliente no ofrece aprobar algo que no quedó
 * guardado. Crear un hilo o avanzar la verificación de WhatsApp sigue usando
 * saveSession, que sí falla si la base no escribe.
 */
export async function saveDeliveredTurn(userKey: string, session: SessionData, pending: boolean): Promise<void> {
    try {
        await saveSession(userKey, session);
    } catch (error) {
        console.error('[CoCo] No se pudo guardar la conversación', error);
        if (pending) throw error;
    }
}

export async function deleteSession(userKey: string): Promise<void> {
    await supabase.from('coco_sessions').delete().eq('user_key', userKey);
}

export const MAX_WEB_THREADS = 100;

export async function listWebThreads(userId: string, communityId: string) {
    // Solo el primer turno: alcanza para el título y para saber si está vacía,
    // sin traer el historial completo de cada conversación.
    const { data, error } = await supabase.from('coco_sessions')
        .select('user_key,user_context,last_activity,first_turn:conversation->0')
        .like('user_key', `web:${userId}:%`)
        .gt('expires_at', new Date().toISOString())
        .order('last_activity', { ascending: false })
        .limit(MAX_WEB_THREADS);
    if (error) throw error;
    return (data || [])
        .filter(row => row.user_context?.community_id === communityId)
        .map(row => {
            const firstTurn = (row as { first_turn?: unknown }).first_turn ?? null;
            return {
                id: String(row.user_key).slice(`web:${userId}:`.length),
                title: threadTitle(row.user_context?.title, firstTurn),
                updatedAt: String(row.last_activity || ''),
                pinned: row.user_context?.pinned === true,
                empty: firstTurn === null,
            };
        });
}

/**
 * Renombra o fija una conversación sin tocar last_activity: ordenar o nombrar
 * no la convierte en la más reciente.
 */
export async function updateWebThreadMeta(
    userId: string,
    threadId: string,
    patch: { title?: string; pinned?: boolean },
): Promise<boolean> {
    const userKey = `web:${userId}:${threadId}`;
    const { data, error } = await supabase.from('coco_sessions')
        .select('user_context').eq('user_key', userKey).maybeSingle();
    if (error || !data) return false;
    const context = { ...(data.user_context || {}) } as SessionData['user_context'];
    if (patch.title !== undefined) {
        context.title = patch.title.replace(/\s+/g, ' ').trim().slice(0, 80) || DEFAULT_THREAD_TITLE;
        context.title_locked = context.title !== DEFAULT_THREAD_TITLE;
    }
    if (patch.pinned !== undefined) context.pinned = patch.pinned;
    const expires_at = new Date(Date.now() + webRetentionDays(userKey, context.pinned) * 86_400_000).toISOString();
    const { error: updateError } = await supabase.from('coco_sessions')
        .update({ user_context: context, expires_at }).eq('user_key', userKey);
    return !updateError;
}

export async function deleteWebThread(userId: string, threadId: string): Promise<boolean> {
    const { error, count } = await supabase.from('coco_sessions')
        .delete({ count: 'exact' }).eq('user_key', `web:${userId}:${threadId}`);
    return !error && (count ?? 0) > 0;
}

// ── Rate limiting simple en memoria ─────────────────────────────────────────
// (Suficiente para serverless — se reinicia con cada cold start, lo cual es OK)
const rlMap = new Map<string, { count: number; reset: number }>();

export function checkRateLimit(key: string, maxPerMinute = 20): boolean {
    const now = Date.now();
    const bucket = Math.floor(now / 60_000);
    const rlKey = `${key}:${bucket}`;
    const entry = rlMap.get(rlKey);
    if (!entry) {
        rlMap.set(rlKey, { count: 1, reset: now + 60_000 });
        return true;
    }
    if (entry.count >= maxPerMinute) return false;
    entry.count++;
    return true;
}
