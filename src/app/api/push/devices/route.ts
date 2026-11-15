import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import type { PushPlatform } from '@/lib/types';

export const runtime = 'nodejs';

function readToken(value: unknown): string | null {
    return typeof value === 'string' && /^[\w:.\-]{20,4096}$/.test(value) ? value : null;
}

/** La app registra el token de FCM de este teléfono para la persona con sesión. */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'push.devices', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await req.json().catch(() => ({})) as { token?: unknown; platform?: unknown };
        const token = readToken(body.token);
        const platform: PushPlatform | null = body.platform === 'android' || body.platform === 'ios' ? body.platform : null;
        if (!token || !platform) return NextResponse.json({ error: 'Token o plataforma inválidos' }, { status: 400 });

        // Un teléfono es de una persona a la vez: si otra cuenta entra en él, el token pasa a esa cuenta.
        const { error } = await getSupabaseAdmin().from('push_devices').upsert({
            token,
            user_id: profile.id,
            platform,
            last_seen_at: new Date().toISOString(),
        }, { onConflict: 'token' });
        if (error) throw error;
        return NextResponse.json({ ok: true });
    } catch (error) {
        return apiErrorResponse(req, '/api/push/devices', error);
    }
}

/** Al cerrar sesión: este teléfono deja de recibir los avisos de la cuenta. */
export async function DELETE(req: NextRequest) {
    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ ok: true });
        const body = await req.json().catch(() => ({})) as { token?: unknown };
        const token = readToken(body.token);
        if (!token) return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
        const { error } = await getSupabaseAdmin().from('push_devices')
            .delete().eq('token', token).eq('user_id', profile.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
    } catch (error) {
        return apiErrorResponse(req, '/api/push/devices', error);
    }
}
