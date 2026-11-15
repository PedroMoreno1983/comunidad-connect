import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { apiErrorResponse } from '@/lib/observability/logger';
import { dispatchNotificationPush } from '@/lib/push/dispatch';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lo llama el trigger `notifications_dispatch_push` (pg_net) con el id de un
 * aviso recién creado. No necesita secreto: solo envía el aviso real a su
 * dueño, una vez, y solo si es reciente. Llamarlo de nuevo no hace nada.
 */
export async function POST(req: NextRequest) {
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
