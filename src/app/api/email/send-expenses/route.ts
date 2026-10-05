import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getRequestId } from '@/lib/operations/audit';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { sendExpenseNotices } from '@/lib/finance/expenseNoticeEmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
    const limited = enforceRateLimit(request, 'email.send_expenses', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const cookieStore = await cookies();
        const supabaseUser = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
        );
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const supabaseAdmin = getSupabaseAdmin();
        const { data: callerProfile } = await supabaseAdmin
            .from('profiles')
            .select('id,role,community_id')
            .eq('id', user.id)
            .maybeSingle();
        if (!callerProfile || callerProfile.role !== 'admin') {
            return NextResponse.json({ error: 'Solo administradores pueden enviar recordatorios.' }, { status: 403 });
        }

        const body = await request.json() as Record<string, unknown>;
        const communityId = typeof body.communityId === 'string' && body.communityId
            ? body.communityId
            : String(callerProfile.community_id || '');
        const month = typeof body.month === 'string' ? body.month : '';
        if (communityId !== callerProfile.community_id) {
            return NextResponse.json({ error: 'Comunidad no autorizada.' }, { status: 403 });
        }
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
            return NextResponse.json({ error: 'Periodo invalido. Usa formato YYYY-MM.' }, { status: 400 });
        }

        const cashRaw = body.cashBalance;
        const cashBalance = typeof cashRaw === 'number' && Number.isFinite(cashRaw) ? Math.round(cashRaw) : null;

        const result = await sendExpenseNotices({
            communityId,
            month,
            actorId: callerProfile.id,
            actorRole: callerProfile.role,
            requestId: getRequestId(request),
            attachPdf: body.attachPdf !== false,
            cashBalance,
        });
        if (result.total === 0) {
            return NextResponse.json({ error: 'No hay cobros pendientes con destinatario para ese periodo.' }, { status: 404 });
        }

        return NextResponse.json({ ok: result.failed === 0, ...result });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        console.error('[email/send-expenses]', message);
        return NextResponse.json({ error: 'No se pudieron enviar los recordatorios.' }, { status: 500 });
    }
}
