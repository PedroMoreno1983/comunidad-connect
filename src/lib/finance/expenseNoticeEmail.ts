/**
 * Aviso masivo de gasto común: correo con desglose y, si se pide, el PDF
 * del art. 31. Lo usan la emisión y /api/email/send-expenses.
 */

import { resend, FROM_EMAIL, formatCLP, escapeEmailHtml } from '@/lib/email';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';
import { PUBLIC_SITE_URL, SUPPORT_EMAIL } from '@/lib/config';
import { getBillNotices } from './billNotice';
import { renderBillNoticesPdf } from './billPdf';
import { todayInChile } from './chileDates';

type ExpenseEmailItem = { label?: string | null; amount?: number | string | null };
type ExpenseEmailRow = {
    id: string;
    unit_id: string;
    amount?: number | string | null;
    due_date?: string | null;
    items?: ExpenseEmailItem[] | null;
};

export interface ExpenseNoticeSendResult {
    sent: number;
    failed: number;
    total: number;
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
              <td style="padding:12px 0;border-bottom:1px solid #eee;color:#3f3a36">${escapeEmailHtml(item.label || 'Concepto')}</td>
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
          <p style="margin:0 0 8px;color:#b5664e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">${escapeEmailHtml(input.monthLabel)}</p>
          <h1 style="margin:0 0 18px;font-size:26px">Estado de gastos comunes</h1>
          <p style="margin:0 0 24px;line-height:1.6;color:#625b55">Hola <strong>${escapeEmailHtml(input.residentName)}</strong>. Este es el cobro pendiente de tu unidad en <strong>${escapeEmailHtml(input.communityName)}</strong>.</p>
          <table width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:#f4e8df;border-radius:12px">
            <tr>
              <td style="padding:18px;font-weight:700;color:#733D24">Total a pagar</td>
              <td style="padding:18px;text-align:right;font-size:22px;font-weight:800;color:#733D24">${formatCLP(input.amount)}</td>
            </tr>
          </table>
          ${dueDate ? `<p style="margin:18px 0 0;color:#7a5b21"><strong>Vencimiento:</strong> ${escapeEmailHtml(dueDate)}</p>` : ''}
          <p style="margin:28px 0 0;text-align:center"><a href="${PUBLIC_SITE_URL}/expenses" style="display:inline-block;padding:14px 26px;border-radius:10px;background:#b5664e;color:#fff;text-decoration:none;font-weight:700">Revisar y pagar</a></p>
          <p style="margin:24px 0 0;color:#8a8179;font-size:12px;line-height:1.5">El pago solo se registra cuando la pasarela envia una confirmacion firmada. Consultas: <a href="mailto:${SUPPORT_EMAIL}" style="color:#733D24">${SUPPORT_EMAIL}</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendExpenseNotices(input: {
    communityId: string;
    month: string;
    actorId?: string | null;
    actorRole?: string | null;
    requestId?: string | null;
    attachPdf?: boolean;
    cashBalance?: number | null;
}): Promise<ExpenseNoticeSendResult> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) {
        return { sent: 0, failed: 0, total: 0 };
    }

    const admin = getSupabaseAdmin();
    const [{ data: community }, { data: residents, error: residentError }, { data: owners }, { data: expenses, error: expenseError }] = await Promise.all([
        admin.from('communities').select('name').eq('id', input.communityId).maybeSingle(),
        admin.from('profiles').select('id,name,email,unit_id').eq('community_id', input.communityId).not('email', 'is', null),
        admin.from('units').select('id, owner_id').eq('community_id', input.communityId),
        admin.from('expenses').select('id,unit_id,amount,due_date,items:expense_items(label,amount)').eq('community_id', input.communityId).eq('month', input.month).in('status', ['pending', 'overdue']),
    ]);
    if (residentError) throw residentError;
    if (expenseError) throw expenseError;

    const expenseByUnit = new Map(
        ((expenses || []) as ExpenseEmailRow[]).map(expense => [expense.unit_id, expense]),
    );
    const ownerByUnit = new Map((owners || []).map(row => [String(row.id), row.owner_id ? String(row.owner_id) : null]));
    const profileById = new Map((residents || []).map(row => [String(row.id), row]));

    const recipients: Array<{ email: string; name: string; expense: ExpenseEmailRow }> = [];
    const seen = new Set<string>();
    for (const profile of residents || []) {
        const expense = profile.unit_id ? expenseByUnit.get(profile.unit_id) : null;
        if (!expense || !profile.email) continue;
        const key = `${profile.email}:${expense.unit_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        recipients.push({ email: profile.email, name: profile.name || 'Residente', expense });
    }
    for (const [unitId, ownerId] of ownerByUnit) {
        const expense = expenseByUnit.get(unitId);
        const owner = ownerId ? profileById.get(ownerId) : null;
        if (!expense || !owner?.email) continue;
        const key = `${owner.email}:${unitId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        recipients.push({ email: owner.email, name: owner.name || 'Residente', expense });
    }

    if (recipients.length === 0) return { sent: 0, failed: 0, total: 0 };

    const monthLabel = new Date(`${input.month}-02T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    const communityName = community?.name || 'Tu comunidad';
    const generatedAt = todayInChile();

    const pdfByUnit = new Map<string, Uint8Array>();
    if (input.attachPdf) {
        const notices = await getBillNotices(input.communityId, input.month, { cashBalance: input.cashBalance });
        for (const notice of notices) {
            pdfByUnit.set(notice.unit.id, await renderBillNoticesPdf([notice], {
                siteUrl: PUBLIC_SITE_URL,
                generatedAt,
            }));
        }
    }

    const results = await Promise.allSettled(recipients.map(recipient => {
        const pdf = pdfByUnit.get(recipient.expense.unit_id);
        const fileName = `aviso-cobro-${input.month}.pdf`;
        return resend.emails.send({
            from: FROM_EMAIL,
            to: [recipient.email],
            subject: `Gastos comunes ${monthLabel} - ${communityName}`,
            html: renderExpenseEmail({
                residentName: recipient.name,
                communityName,
                monthLabel,
                dueDate: recipient.expense.due_date,
                amount: Number(recipient.expense.amount || 0),
                items: recipient.expense.items || [],
            }),
            attachments: pdf
                ? [{ filename: fileName, content: Buffer.from(pdf) }]
                : undefined,
        });
    }));

    const sent = results.filter(result => result.status === 'fulfilled'
        && result.value.error === null
        && Boolean(result.value.data?.id)).length;
    const failed = results.length - sent;
    const totalNotifiedAmount = recipients.reduce((sum, recipient) => sum + Number(recipient.expense.amount || 0), 0);

    await recordOperationEvent({
        communityId: input.communityId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: 'expenses.email_batch_sent',
        entityType: 'expense_batch',
        severity: failed ? 'warning' : 'success',
        status: failed ? 'pending' : 'success',
        summary: `Recordatorios aceptados por el proveedor: ${sent} de ${recipients.length}`,
        metadata: {
            month: input.month,
            sent,
            failed,
            recipients: recipients.length,
            totalNotifiedAmount,
            attachedPdf: Boolean(input.attachPdf),
        },
        requestId: input.requestId ?? getRequestId(),
    });

    return { sent, failed, total: recipients.length };
}
