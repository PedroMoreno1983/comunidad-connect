import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM_EMAIL = 'ComunidadConnect <notificaciones@datawiseconsultoria.com>';
export const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'pedromoreno1983@gmail.com';

// Format Chilean pesos
export const formatCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n);

// Base HTML wrapper for all emails
export function emailWrapper(content: string, title: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5,#818cf8);padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:900;color:#fff;letter-spacing:-0.5px;">
              Comunidad<span style="color:#c7d2fe;">Connect</span>
            </p>
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              ComunidadConnect — Sistema de Gestión Inmobiliaria<br/>
              Si tienes dudas, escríbenos a <a href="mailto:soporte@datawiseconsultoria.com" style="color:#4f46e5;">soporte@datawiseconsultoria.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ============================================================
// Plantillas de Email Transaccional — ComunidadConnect
// ============================================================

/**
 * Alerta de gasto común pendiente de pago.
 * Se envía automáticamente cuando un gasto queda en estado 'pending'.
 */
export async function sendExpenseAlert({
    to,
    residentName,
    unitName,
    month,
    amount,
    dueDate,
}: {
    to: string;
    residentName: string;
    unitName: string;
    month: string;
    amount: number;
    dueDate: string;
}) {
    const formattedAmount = formatCLP(amount);
    const formattedDue = new Date(dueDate).toLocaleDateString('es-CL', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0f172a;">Hola, ${residentName} 👋</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
      Tienes un gasto común pendiente de pago para tu unidad <strong>${unitName}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;padding:24px;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
        <span style="color:#94a3b8;font-size:13px;">Período</span><br/>
        <strong style="color:#0f172a;font-size:16px;">${month}</strong>
      </td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
        <span style="color:#94a3b8;font-size:13px;">Vencimiento</span><br/>
        <strong style="color:#ef4444;font-size:16px;">${formattedDue}</strong>
      </td></tr>
      <tr><td style="padding:8px 0;">
        <span style="color:#94a3b8;font-size:13px;">Monto Total</span><br/>
        <strong style="color:#0f172a;font-size:28px;font-weight:900;">${formattedAmount}</strong>
      </td></tr>
    </table>
    <a href="${process.env.NEXT_PUBLIC_SITE_URL}/resident/finances"
       style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#ef4444,#db2777);color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none;margin-bottom:16px;">
      Pagar Ahora →
    </a>
    <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">
      Si ya realizaste el pago, ignora este mensaje. Los pagos pueden demorar hasta 24h en reflejarse.
    </p>`;

    return resend.emails.send({
        from: FROM_EMAIL,
        to,
        subject: `⚠️ Gasto común pendiente — ${month} — ${formattedAmount}`,
        html: emailWrapper(content, 'Gasto Común Pendiente'),
    });
}

/**
 * Confirmación de reserva de amenidad (quincho, sala, piscina, etc.)
 */
export async function sendBookingConfirmation({
    to,
    residentName,
    amenityName,
    date,
    startTime,
    endTime,
}: {
    to: string;
    residentName: string;
    amenityName: string;
    date: string;
    startTime: string;
    endTime: string;
}) {
    const formattedDate = new Date(date).toLocaleDateString('es-CL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0f172a;">¡Reserva confirmada! 🎉</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
      Hola <strong>${residentName}</strong>, tu reserva ha sido procesada exitosamente.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #bbf7d0;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #d1fae5;">
        <span style="color:#94a3b8;font-size:13px;">Instalación</span><br/>
        <strong style="color:#0f172a;font-size:18px;">🏠 ${amenityName}</strong>
      </td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #d1fae5;">
        <span style="color:#94a3b8;font-size:13px;">Fecha</span><br/>
        <strong style="color:#0f172a;font-size:16px;">${formattedDate}</strong>
      </td></tr>
      <tr><td style="padding:8px 0;">
        <span style="color:#94a3b8;font-size:13px;">Horario</span><br/>
        <strong style="color:#0f172a;font-size:16px;">${startTime} → ${endTime}</strong>
      </td></tr>
    </table>
    <a href="${process.env.NEXT_PUBLIC_SITE_URL}/amenities"
       style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#10b981,#0d9488);color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none;">
      Ver mis reservas →
    </a>
    <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">
      Para cancelar o modificar tu reserva, hazlo desde la app con al menos 2 horas de anticipación.
    </p>`;

    return resend.emails.send({
        from: FROM_EMAIL,
        to,
        subject: `✅ Reserva confirmada — ${amenityName} — ${formattedDate}`,
        html: emailWrapper(content, 'Confirmación de Reserva'),
    });
}

/**
 * Bienvenida a nuevo residente al incorporarse a la plataforma.
 */
export async function sendWelcomeEmail({
    to,
    residentName,
    unitName,
    condoName = 'ComunidadConnect',
    temporaryPassword,
}: {
    to: string;
    residentName: string;
    unitName: string;
    condoName?: string;
    temporaryPassword?: string;
}) {
    const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0f172a;">
      Bienvenido/a a ${condoName}, ${residentName}! 🏡
    </h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
      Tu cuenta ha sido activada para la unidad <strong>${unitName}</strong>.
      Ahora tienes acceso a todos los servicios de tu comunidad.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;padding:24px;margin-bottom:24px;">
      <tr><td style="padding:6px 0;"><span style="font-size:20px;">📋</span> <strong style="color:#0f172a;">Gastos comunes</strong> — Paga en línea</td></tr>
      <tr><td style="padding:6px 0;"><span style="font-size:20px;">🏊</span> <strong style="color:#0f172a;">Amenidades</strong> — Reserva en segundos</td></tr>
      <tr><td style="padding:6px 0;"><span style="font-size:20px;">🛒</span> <strong style="color:#0f172a;">Marketplace</strong> — Compra/vende con vecinos</td></tr>
      <tr><td style="padding:6px 0;"><span style="font-size:20px;">🤖</span> <strong style="color:#0f172a;">CoCo IA</strong> — Tu asistente inteligente</td></tr>
    </table>
    ${temporaryPassword ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #fde68a;">
      <tr><td>
        <p style="margin:0 0 8px;font-size:13px;color:#92400e;font-weight:700;">🔑 Contraseña temporal</p>
        <p style="margin:0;font-size:20px;font-weight:900;color:#78350f;font-family:monospace;">${temporaryPassword}</p>
        <p style="margin:8px 0 0;font-size:12px;color:#92400e;">Cámbiala al ingresar por primera vez.</p>
      </td></tr>
    </table>` : ''}
    <a href="${process.env.NEXT_PUBLIC_SITE_URL}"
       style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#4f46e5,#818cf8);color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none;">
      Entrar a la plataforma →
    </a>`;

    return resend.emails.send({
        from: FROM_EMAIL,
        to,
        subject: `🏡 Bienvenido/a a ${condoName} — Tu cuenta está lista`,
        html: emailWrapper(content, `Bienvenido a ${condoName}`),
    });
}
