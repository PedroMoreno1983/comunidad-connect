import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { resend, FROM_EMAIL, formatCLP } from '@/lib/email';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { PUBLIC_SITE_URL, SUPPORT_EMAIL } from '@/lib/config';

export const dynamic = 'force-dynamic';

type ExpenseEmailItem = { label?: string | null; amount?: number | string | null };
type ExpenseEmailRow = {
    id: string;
    unit_id: string;
    amount?: number | string | null;
    due_date?: string | null;
    items?: ExpenseEmailItem[] | null;
};

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderExpenseEmail(input: {
    residentName: string;
    communityName: string;
    monthLabel: string;
    dueDate?: string | null;
    amount: number;
    items: ExpenseEmailItem[];
}) {
    const itemRows = input.items.length
        ? input.items.map(item => `
            <tr>
              <td style="padding:12px 0;border-bottom:1px solid #eee;color:#3f3a36">${escapeHtml(item.label || 'Concepto')}</td>
              <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:#1f1b18">${formatCLP(Number(item.amount || 0))}</td>
            </tr>`).join('')
        : '<tr><td colspan="2" style="padding:16px 0;color:#777;text-align:center">Sin desglose disponible</td></tr>';

    const dueDate = input.dueDate
        ? new Date(`${input.dueDate}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;

    return `<!doctype html>
<html lang="es">
<body style="margin:0;background:#f6f2ec;font-family:Arial,sans-serif;color:#1f1b18">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:36px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border:1px solid #e7ddd2;border-radius:18px;overflow:hidden">
        <tr><td style="height:6px;background:#b5664e"></td></tr>
        <tr><td style="padding:34px">
          <p style="margin:0 0 8px;color:#b5664e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">${escapeHtml(input.monthLabel)}</p>
          <h1 style="margin:0 0 18px;font-size:26px">Estado de gastos comunes</h1>
          <p style="margin:0 0 24px;line-height:1.6;color:#625b55">Hola <strong>${escapeHtml(input.residentName)}</strong>. Este es el cobro pendiente de tu unidad en <strong>${escapeHtml(input.communityName)}</strong>.</p>
          <table width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:#f4e8df;border-radius:12px">
            <tr>
              <td style="padding:18px;font-weight:700;color:#974c3c">Total a pagar</td>
              <td style="padding:18px;text-align:right;font-size:22px;font-weight:800;color:#974c3c">${formatCLP(input.amount)}</td>
            </tr>
          </table>
          ${dueDate ? `<p style="margin:18px 0 0;color:#7a5b21"><strong>Vencimiento:</strong> ${escapeHtml(dueDate)}</p>` : ''}
          <p style="margin:28px 0 0;text-align:center"><a href="${PUBLIC_SITE_URL}/expenses" style="display:inline-block;padding:14px 26px;border-radius:10px;background:#b5664e;color:#fff;text-decoration:none;font-weight:700">Revisar y pagar</a></p>
          <p style="margin:24px 0 0;color:#8a8179;font-size:12px;line-height:1.5">El pago solo se registra cuando la pasarela envia una confirmacion firmada. Consultas: <a href="mailto:${SUPPORT_EMAIL}" style="color:#974c3c">${SUPPORT_EMAIL}</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

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
        const communityId = typeof body.communityId === 'string' ? body.communityId : '';
        const month = typeof body.month === 'string' ? body.month : '';
        if (communityId !== callerProfile.community_id) {
            return NextResponse.json({ error: 'Comunidad no autorizada.' }, { status: 403 });
        }
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
            return NextResponse.json({ error: 'Periodo invalido. Usa formato YYYY-MM.' }, { status: 400 });
        }

        const [{ data: community }, { data: residents, error: residentError }, { data: expenses, error: expenseError }] = await Promise.all([
            supabaseAdmin.from('communities').select('name').eq('id', communityId).maybeSingle(),
            supabaseAdmin.from('profiles').select('id,name,email,unit_id').eq('community_id', communityId).eq('role', 'resident').not('email', 'is', null),
            supabaseAdmin.from('expenses').select('id,unit_id,amount,due_date,items:expense_items(label,amount)').eq('community_id', communityId).eq('month', month).in('status', ['pending', 'overdue']),
        ]);
        if (residentError) throw residentError;
        if (expenseError) throw expenseError;

        const expenseByUnit = new Map(
            ((expenses || []) as ExpenseEmailRow[]).map(expense => [expense.unit_id, expense]),
        );
        const recipients = (residents || []).flatMap(resident => {
            const expense = resident.unit_id ? expenseByUnit.get(resident.unit_id) : null;
            return expense && resident.email ? [{ ...resident, expense }] : [];
        });
        if (recipients.length === 0) {
            return NextResponse.json({ error: 'No hay cobros pendientes con destinatario para ese periodo.' }, { status: 404 });
        }

        const monthLabel = new Date(`${month}-02T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
        const communityName = community?.name || 'Tu comunidad';
        const results = await Promise.allSettled(recipients.map(recipient => resend.emails.send({
            from: FROM_EMAIL,
            to: [recipient.email],
            subject: `Gastos comunes ${monthLabel} - ${communityName}`,
            html: renderExpenseEmail({
                residentName: recipient.name || 'Residente',
                communityName,
                monthLabel,
                dueDate: recipient.expense.due_date,
                amount: Number(recipient.expense.amount || 0),
                items: recipient.expense.items || [],
            }),
        })));

        const sent = results.filter(result => result.status === 'fulfilled').length;
        const failed = results.length - sent;
        const totalNotifiedAmount = recipients.reduce((sum, recipient) => sum + Number(recipient.expense.amount || 0), 0);

        await recordOperationEvent({
            communityId,
            actorId: callerProfile.id,
            actorRole: callerProfile.role,
            action: 'expenses.email_batch_sent',
            entityType: 'expense_batch',
            severity: failed ? 'warning' : 'success',
            status: failed ? 'pending' : 'success',
            summary: `Recordatorios financieros enviados: ${sent} de ${recipients.length}`,
            metadata: { month, sent, failed, recipients: recipients.length, totalNotifiedAmount },
            requestId: getRequestId(request),
        });

        return NextResponse.json({ ok: true, sent, failed, total: recipients.length });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        console.error('[email/send-expenses]', message);
        return NextResponse.json({ error: 'No se pudieron enviar los recordatorios.' }, { status: 500 });
    }
}
