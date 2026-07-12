import { NextRequest, NextResponse } from 'next/server';
import { sendExpenseAlert } from '@/lib/email';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

function clean(value: unknown, max = 200) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'email.expense_alert', { limit: 8, windowMs: 60_000 });
    if (limited) return limited;

    try {
        if (!process.env.RESEND_API_KEY) {
            return NextResponse.json({ ok: true, skipped: true, reason: 'RESEND_API_KEY missing' });
        }

        const profile = await getAuthenticatedAgentProfile();
        if (!profile || profile.role !== 'admin' || !profile.community_id) {
            return NextResponse.json({ error: 'Solo administradores pueden enviar alertas.' }, { status: 403 });
        }

        const body = await req.json() as Record<string, unknown>;
        const requestedEmail = clean(body.to, 320).toLowerCase();
        const { data: resident } = await getSupabaseAdmin()
            .from('profiles')
            .select('email,name')
            .eq('community_id', profile.community_id)
            .eq('role', 'resident')
            .ilike('email', requestedEmail)
            .maybeSingle();

        if (!resident?.email) {
            return NextResponse.json({ error: 'Destinatario no autorizado para esta comunidad.' }, { status: 404 });
        }

        const to = resident.email;
        const residentName = clean(resident.name, 120) || 'Residente';
        const unitName = clean(body.unitName, 50) || 'Unidad';
        const month = clean(body.month, 30) || 'Este mes';
        const amount = Number(body.amount);
        const dueDate = clean(body.dueDate, 30);

        if (!to || isNaN(amount) || !dueDate) {
            return NextResponse.json({ error: 'Faltan datos obligatorios (to, amount, dueDate)' }, { status: 400 });
        }

        const { error } = await sendExpenseAlert({
            to,
            residentName,
            unitName,
            month,
            amount,
            dueDate,
        });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 502 });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
