/**
 * session-store.ts — CoCo IA
 * Persiste sesiones de conversación en Supabase (tabla coco_sessions).
 * Funciona en Vercel serverless sin Redis.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MAX_HISTORY = 20; // máximo de mensajes a persistir por sesión

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string | object[];
}

export interface SessionData {
    conversation: ConversationMessage[];
    user_context: {
        unit_id?: string;
        role?: string;
        community_id?: string;
        token?: string;
        channel?: string;
        name?: string;
    };
    auth_state?: 'pending' | 'verified';
    auth_attempts?: number;
    last_activity?: string;
}

// ── Sesión Web / App ─────────────────────────────────────────────────────────

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
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await supabase
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
}

export async function deleteSession(userKey: string): Promise<void> {
    await supabase.from('coco_sessions').delete().eq('user_key', userKey);
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
