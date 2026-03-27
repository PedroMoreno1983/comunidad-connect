import { NextResponse } from 'next/server';
import { resend, FROM_EMAIL, emailWrapper, formatCLP } from '@/lib/email';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Use service role to read all profiles/emails
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const { communityId, month, items, dueDate, totalAmount } = await request.json();

        if (!communityId) {
            return NextResponse.json({ error: 'communityId requerido' }, { status: 400 });
        }

        // Get community name
        const { data: community } = await supabaseAdmin
            .from('communities')
            .select('name')
            .eq('id', communityId)
            .single();

        // Get all residents with email in the community
        const { data: residents, error: resError } = await supabaseAdmin
            .from('profiles')
            .select('id, name, email')
            .eq('community_id', communityId)
            .eq('role', 'resident')
            .not('email', 'is', null);

        if (resError) throw resError;
        if (!residents || residents.length === 0) {
            return NextResponse.json({ error: 'No hay residentes con email en esta comunidad' }, { status: 404 });
        }

        const communityName = community?.name || 'Tu Comunidad';
        const monthLabel = month
            ? new Date(month + '-01').toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
            : 'Este mes';

        // Build items table rows
        const itemRows = Array.isArray(items) && items.length > 0
            ? items.map((item: { label: string; amount: number }) => `
                <tr>
                    <td style="padding:12px 20px;color:#475569;border-bottom:1px solid #f1f5f9;">${item.label}</td>
                    <td style="padding:12px 20px;font-weight:700;color:#1e293b;text-align:right;border-bottom:1px solid #f1f5f9;">${formatCLP(item.amount)}</td>
                </tr>`).join('')
            : `<tr><td colspan="2" style="padding:14px 20px;color:#64748b;text-align:center;">Sin desglose disponible</td></tr>`;

        // Send one email per resident
        const results = await Promise.allSettled(
            residents.map((resident) => {
                const html = emailWrapper(`
                    <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#1e293b;">
                        📄 Gastos Comunes — <span style="text-transform:capitalize;">${monthLabel}</span>
                    </h1>
                    <p style="margin:0 0 8px;color:#64748b;font-size:15px;">
                        Hola <strong>${resident.name || 'Residente'}</strong>, adjuntamos el detalle de tus gastos comunes correspondientes a <strong style="text-transform:capitalize;">${monthLabel}</strong>.
                    </p>
                    <p style="margin:0 0 32px;font-size:13px;color:#94a3b8;">Comunidad: ${communityName}</p>

                    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;">
                        <tr style="background:#f8fafc;">
                            <th style="padding:12px 20px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;text-align:left;border-bottom:1px solid #e2e8f0;">Concepto</th>
                            <th style="padding:12px 20px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;text-align:right;border-bottom:1px solid #e2e8f0;">Monto</th>
                        </tr>
                        ${itemRows}
                        <tr style="background:#f8fafc;">
                            <td style="padding:16px 20px;font-weight:800;color:#1e293b;font-size:16px;">TOTAL A PAGAR</td>
                            <td style="padding:16px 20px;font-weight:900;color:#4f46e5;font-size:18px;text-align:right;">${formatCLP(totalAmount || 0)}</td>
                        </tr>
                    </table>

                    ${dueDate ? `<p style="margin:0 0 28px;font-size:14px;color:#64748b;">⏰ <strong>Fecha de vencimiento:</strong> ${new Date(dueDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</p>` : ''}

                    <a href="https://comunidad-connect-eight.vercel.app/expenses" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#818cf8);color:#fff;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;">
                        Pagar Ahora →
                    </a>
                    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">
                        Si ya realizaste el pago, puedes ignorar este mensaje. El sistema se actualizará automáticamente al confirmar la transacción.
                    </p>
                `, `Gastos Comunes ${monthLabel}`);

                return resend.emails.send({
                    from: FROM_EMAIL,
                    to: [resident.email],
                    subject: `📄 Gastos Comunes ${monthLabel} — ${communityName}`,
                    html,
                });
            })
        );

        const sent = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        return NextResponse.json({ ok: true, sent, failed, total: residents.length });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        console.error('Error sending expenses email:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
