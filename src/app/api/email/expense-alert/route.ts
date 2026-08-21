import { NextRequest, NextResponse } from 'next/server';
import { sendExpenseAlert } from '@/lib/email';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { apiErrorResponse } from '@/lib/observability/logger';

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

        const admin = getSupabaseAdmin();
        const body = await req.json() as Record<string, unknown>;
        const requestedEmail = clean(body.to, 320).toLowerCase();
        const { data: resident } = await admin
            .from('profiles')
            .select('email,name,unit_id')
            .eq('community_id', profile.community_id)
            .eq('role', 'resident')
            .ilike('email', requestedEmail)
            .maybeSingle();

        if (!resident?.email) {
            return NextResponse.json({ error: 'Destinatario no autorizado para esta comunidad.' }, { status: 404 });
        }
        if (!resident.unit_id) {
            return NextResponse.json({ error: 'El residente no tiene una unidad asociada.' }, { status: 409 });
        }

        // El monto, el mes y el vencimiento salen del gasto real, nunca del
        // cuerpo de la petición: antes un administrador podía enviar a un vecino
        // un correo con la marca de Convive anunciando la cifra que quisiera.
        const requestedExpenseId = clean(body.expenseId, 40);
        let query = admin
            .from('expenses')
            .select('total_amount,month,due_date,units(tower,number)')
            .eq('community_id', profile.community_id)
            .eq('unit_id', resident.unit_id);

        query = requestedExpenseId
            ? query.eq('id', requestedExpenseId)
            : query.neq('status', 'paid').order('due_date', { ascending: true }).limit(1);

        const { data: expense } = await query.maybeSingle();

        if (!expense) {
            return NextResponse.json(
                { error: 'No hay un gasto pendiente para esa unidad en tu comunidad.' },
                { status: 404 },
            );
        }

        const unit = Array.isArray(expense.units) ? expense.units[0] : expense.units;
        const { error } = await sendExpenseAlert({
            to: resident.email,
            residentName: clean(resident.name, 120) || 'Residente',
            unitName: unit ? `${unit.tower} ${unit.number}`.trim() : 'Unidad',
            month: clean(expense.month, 30) || 'Este mes',
            amount: Number(expense.total_amount),
            dueDate: clean(String(expense.due_date ?? ''), 30),
        });

        if (error) {
            return apiErrorResponse(req, '/api/email/expense-alert', error, {
                status: 502,
                publicMessage: 'No se pudo enviar la alerta de gasto.',
            });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        return apiErrorResponse(req, '/api/email/expense-alert', error, {
            publicMessage: 'No se pudo enviar la alerta de gasto.',
        });
    }
}
