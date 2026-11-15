import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { apiErrorResponse } from '@/lib/observability/logger';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { dispatchNotificationPush } from '@/lib/push/dispatch';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secretMatches(given: string | null, expected: string): boolean {
    if (!given) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Lo llama el trigger `notifications_dispatch_push` (pg_net) con el id de un
 * aviso recién creado y la cabecera x-push-secret (Vault ↔ PUSH_DISPATCH_SECRET).
 * Envía el aviso real a su dueño, una vez y solo si es reciente.
 */
export async function POST(req: NextRequest) {
    const expected = process.env.PUSH_DISPATCH_SECRET;
    if (!expected) return NextResponse.json({ error: 'Push sin configurar' }, { status: 503 });
    if (!secretMatches(req.headers.get('x-push-secret'), expected)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    // Defensa extra; alto porque un aviso masivo llega todo junto desde las IP de Supabase.
    const limited = await enforceDistributedRateLimit(req, 'push.dispatch', { limit: 1200, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const body = await req.json().catch(() => ({})) as { id?: unknown };
        const id = typeof body.id === 'string' ? body.id : '';
        if (!UUID.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

        const result = await dispatchNotificationPush(getSupabaseAdmin(), id);
        return NextResponse.json({ status: result.status, sent: result.sent });
    } catch (error) {
        return apiErrorResponse(req, '/api/push/dispatch', error);
    }
}
