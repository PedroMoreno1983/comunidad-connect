import { NextResponse } from 'next/server';
import { resend, FROM_EMAIL, formatCLP } from '@/lib/email';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// Use service role to read all profiles/emails
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        // ─── Auth gate: only authenticated admins can send mass emails ───
        const cookieStore = await cookies();
        const supabaseUser = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
        );
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        // Verify caller is admin and get their communityId
        const { data: callerProfile } = await supabaseAdmin
            .from('profiles')
            .select('role, community_id')
            .eq('id', user.id)
            .single();

        if (!callerProfile || callerProfile.role !== 'admin') {
            return NextResponse.json({ error: 'Acceso denegado: solo administradores pueden enviar correos masivos' }, { status: 403 });
        }
        // ─────────────────────────────────────────────────────────────────

        const { communityId, month, items, dueDate, totalAmount } = await request.json();

        // Ensure communityId matches the caller's own community — prevents cross-community abuse
        if (!communityId || communityId !== callerProfile.community_id) {
            return NextResponse.json({ error: 'communityId no válido' }, { status: 403 });
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
                  <td style="padding:14px 0;color:#374151;font-size:15px;border-bottom:1px solid #f3f4f6;">${item.label}</td>
                  <td style="padding:14px 0;color:#111827;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6;">${formatCLP(item.amount)}</td>
                </tr>`).join('')
            : `<tr><td colspan="2" style="padding:14px 0;color:#9ca3af;text-align:center;">Sin desglose disponible</td></tr>`;

        // Send one email per resident
        const results = await Promise.allSettled(
            residents.map((resident) => {
                const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Gastos Comunes ${monthLabel}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:48px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="width:100%;max-width:580px;">

  <!-- Logo header -->
  <tr>
    <td align="center" style="padding-bottom:32px;">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:14px;padding:10px 20px;">
            <span style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Comunidad<span style="color:#c4b5fd;">Connect</span></span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Card -->
  <tr>
    <td style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 1px 16px rgba(0,0,0,0.07);">

      <!-- Card top accent -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:linear-gradient(90deg,#4f46e5,#7c3aed);height:5px;"></td>
        </tr>
      </table>

      <!-- Card body -->
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:0 40px;">

        <!-- Month badge + title -->
        <tr>
          <td style="padding-top:40px;padding-bottom:6px;">
            <span style="background:#ede9fe;color:#6d28d9;font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;padding:5px 12px;border-radius:20px;text-transform:capitalize;">${monthLabel}</span>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:8px;">
            <h1 style="margin:0;font-size:26px;font-weight:800;color:#111827;letter-spacing:-0.5px;">Estado de tus Gastos Comunes</h1>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:36px;">
            <p style="margin:0;font-size:15px;color:#6b7280;">Hola <strong style="color:#111827;">${resident.name || 'Residente'}</strong> — aquí está el detalle de cobro para tu unidad en <strong style="color:#111827;">${communityName}</strong>.</p>
          </td>
        </tr>

        <!-- Items table -->
        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <th style="padding:10px 0;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.6px;text-align:left;border-bottom:2px solid #e5e7eb;">Concepto</th>
                <th style="padding:10px 0;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.6px;text-align:right;border-bottom:2px solid #e5e7eb;">Monto</th>
              </tr>
              ${itemRows}
            </table>
          </td>
        </tr>

        <!-- Total -->
        <tr>
          <td style="padding-top:0;padding-bottom:36px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;border-radius:12px;margin-top:4px;">
              <tr>
                <td style="padding:18px 20px;font-size:14px;font-weight:700;color:#6d28d9;">TOTAL A PAGAR</td>
                <td style="padding:18px 20px;font-size:22px;font-weight:900;color:#4f46e5;text-align:right;">${formatCLP(totalAmount || 0)}</td>
              </tr>
            </table>
          </td>
        </tr>

        ${dueDate ? `
        <!-- Due date -->
        <tr>
          <td style="padding-bottom:32px;">
            <table cellpadding="0" cellspacing="0" style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;width:100%;">
              <tr>
                <td style="padding:14px 20px;font-size:14px;color:#92400e;">
                  ⏰ <strong>Fecha límite de pago:</strong> ${new Date(dueDate).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        <!-- CTA -->
        <tr>
          <td align="center" style="padding-bottom:48px;">
            <a href="https://comunidad-connect-eight.vercel.app/expenses"
               style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:12px;letter-spacing:-.2px;">
              Pagar en línea &rarr;
            </a>
            <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">También puedes pagar por transferencia bancaria según las instrucciones de tu administrador.</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td align="center" style="padding:32px 0 0;">
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
        ComunidadConnect &mdash; Sistema de Gestión Inmobiliaria<br/>
        Preguntas: <a href="mailto:soporte@datawiseconsultoria.com" style="color:#6d28d9;text-decoration:none;">soporte@datawiseconsultoria.com</a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;


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
