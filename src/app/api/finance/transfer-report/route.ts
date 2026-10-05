import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export const runtime = 'nodejs';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * El residente informa una transferencia y el mes al que corresponde.
 * No registra el pago: el saldo cambia solo cuando administración verifica el comprobante.
 */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'finance.transfer_report', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (profile.role === 'admin') {
            return NextResponse.json({ error: 'El registro del pago se hace en cobranza.' }, { status: 403 });
        }
        if (!profile.community_id || !profile.unit_id) {
            return NextResponse.json({ error: 'Tu perfil todavía no tiene una unidad asignada.' }, { status: 400 });
        }

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const amount = Math.round(Number(body.amount));
        const paidAt = cleanText(body.paidAt, 10);
        const reference = cleanText(body.reference, 120);
        const expenseId = cleanText(body.expenseId, 60);
        if (!Number.isFinite(amount) || amount <= 0) {
            return NextResponse.json({ error: 'El monto debe ser mayor que cero.' }, { status: 400 });
        }
        if (!DATE_PATTERN.test(paidAt)) {
            return NextResponse.json({ error: 'Indica la fecha de la transferencia.' }, { status: 400 });
        }
        if (reference.length < 4) {
            return NextResponse.json({ error: 'Indica el número de comprobante.' }, { status: 400 });
        }
        if (!expenseId) {
            return NextResponse.json({ error: 'Elige el mes al que corresponde la transferencia.' }, { status: 400 });
        }

        const admin = getSupabaseAdmin();
        const { data: expense, error: expenseError } = await admin.from('expenses')
            .select('id, month, unit_id')
            .eq('id', expenseId)
            .eq('community_id', profile.community_id)
            .eq('unit_id', profile.unit_id)
            .maybeSingle();
        if (expenseError) throw expenseError;
        if (!expense) return NextResponse.json({ error: 'Ese cobro no pertenece a tu unidad.' }, { status: 404 });

        const { data: unit } = await admin.from('units').select('number, tower').eq('id', profile.unit_id).maybeSingle();
        const unitLabel = [unit?.tower, unit?.number].filter(Boolean).join(' ') || 'tu unidad';
        const { data: admins, error: adminError } = await admin.from('profiles')
            .select('id')
            .eq('community_id', profile.community_id)
            .eq('role', 'admin');
        if (adminError) throw adminError;

        const bodyText = `${unitLabel} informa una transferencia de $${amount.toLocaleString('es-CL')} del ${paidAt}, comprobante ${reference}, para el gasto común ${expense.month}. Verifica el comprobante y regístralo en cobranza imputado a ese mes. El saldo no cambia hasta ese registro.`;
        const recipients = (admins ?? []).map(row => ({
            user_id: String(row.id),
            type: 'info',
            category: 'finance_transfer_report',
            title: 'Transferencia informada',
            body: bodyText,
            link: '/admin/finanzas/cobranza',
            community_id: profile.community_id,
        }));
        if (recipients.length > 0) {
            const { error: notifyError } = await admin.from('notifications').insert(recipients);
            if (notifyError) throw notifyError;
        }

        return NextResponse.json({ reported: true, notified: recipients.length }, { status: 201 });
    } catch (error) {
        return apiErrorResponse(req, '/api/finance/transfer-report', error, {
            publicMessage: 'No se pudo informar la transferencia.',
        });
    }
}
