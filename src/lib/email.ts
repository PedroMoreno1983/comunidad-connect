import { Resend } from 'resend';
import { PUBLIC_SITE_URL, SUPPORT_EMAIL, getPublicUrl } from '@/lib/config';

let resendClient: Resend | null = null;

type ResendSendResult = Awaited<ReturnType<Resend['emails']['send']>>;

function getResendClient() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        throw new Error('RESEND_API_KEY no configurada');
    }

    resendClient ??= new Resend(apiKey);
    return resendClient;
}

export const resend = {
    emails: {
        send: async (...args: Parameters<Resend['emails']['send']>): Promise<ResendSendResult> => {
            if (!process.env.RESEND_API_KEY) {
                console.warn('[Email] RESEND_API_KEY missing; transactional email skipped.', {
                    to: args[0]?.to,
                    subject: args[0]?.subject,
                });

                return {
                    data: null,
                    error: {
                        name: 'configuration_error',
                        message: 'RESEND_API_KEY missing; email skipped safely.',
                        statusCode: 503,
                    },
                } as unknown as ResendSendResult;
            }

            return getResendClient().emails.send(...args);
        },
    },
};

export const FROM_EMAIL = 'Convive Connect <notificaciones@datawiseconsultoria.com>';
export const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'pedromoreno1983@gmail.com';

export function escapeEmailHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function cleanEmailSubject(value: unknown): string {
    return String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 180);
}

// Format Chilean pesos
/**
 * Formatea una fecha para el correo sin que se corra un día.
 *
 * `new Date('2026-09-14')` se interpreta como medianoche UTC, y al
 * formatearla en horario de Chile (UTC-3/-4) retrocede al 13. Los correos
 * mostraban las reservas y los vencimientos un día antes de lo real.
 * Una fecha sin hora es una fecha de calendario, así que se construye en
 * horario local.
 */
export function formatEmailDate(value: string, options: Intl.DateTimeFormatOptions): string {
    const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    const fecha = soloFecha
        ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
        : new Date(value);
    return fecha.toLocaleDateString('es-CL', options);
}

export const formatCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n);

// Base HTML wrapper for all emails
/**
 * Paleta y tipografía de la marca, tomadas de handoff/tokens.css.
 *
 * El correo tiene que parecerse al producto: antes usaba el gris azulado
 * por defecto de Tailwind (#f1f5f9 / #0f172a), que no aparece en ninguna
 * pantalla de la aplicación y le daba aire de plantilla genérica.
 *
 * Instrument Serif no se puede cargar en la mayoría de los clientes de
 * correo, así que la pila cae en Georgia: no es la misma letra, pero
 * conserva el carácter editorial de la marca en vez de saltar a Arial.
 */
export const BRAND = {
    ivory: '#F4EFE6',
    paper: '#FAF7F1',
    paperWarm: '#F8F2E7',
    ink: '#1A1611',
    inkMuted: '#524A40',
    inkTertiary: '#8B8278',
    line: '#E6DFD3',
    copper: '#B5664E',
    copperDeep: '#8E4A35',
    copperBg: '#F2DDD0',
    sage: '#6E8268',
    serif: "'Instrument Serif', Georgia, 'Times New Roman', serif",
    sans: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
} as const;

/** Wordmark: "Convive" en tinta y "Connect" en cursiva cobre, como en la app. */
function brandWordmark(): string {
    return `<span style="font-family:${BRAND.serif};font-size:26px;color:${BRAND.ink};letter-spacing:-0.2px;">Convive <em style="font-style:italic;color:${BRAND.copper};">Connect</em></span>`;
}

export function emailWrapper(content: string, title: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.ivory};font-family:${BRAND.sans};-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BRAND.ivory};padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:600px;background:${BRAND.paper};border:1px solid ${BRAND.line};border-radius:18px;overflow:hidden;">

        <!-- Cabecera: sobria, sin banda de color -->
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid ${BRAND.line};">
            ${brandWordmark()}
          </td>
        </tr>

        <!-- Cuerpo -->
        <tr><td style="padding:36px 40px 40px;">
          ${content}
        </td></tr>

        <!-- Pie -->
        <tr>
          <td style="padding:22px 40px 26px;background:${BRAND.paperWarm};border-top:1px solid ${BRAND.line};">
            <p style="margin:0;font-size:12px;line-height:1.7;color:${BRAND.inkTertiary};">
              Convive Connect — la plataforma de tu comunidad.<br/>
              ¿Dudas? Escríbenos a <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.copperDeep};text-decoration:underline;">${SUPPORT_EMAIL}</a>
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
// Plantillas de Email Transaccional — Convive Connect
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
    residentName = escapeEmailHtml(residentName);
    unitName = escapeEmailHtml(unitName);
    month = escapeEmailHtml(month);
    const formattedAmount = formatCLP(amount);
    const formattedDue = formatEmailDate(dueDate, { day: 'numeric', month: 'long', year: 'numeric' });

    const content = `
    <h1 style="margin:0 0 10px;font-family:${BRAND.serif};font-size:30px;font-weight:400;line-height:1.2;color:${BRAND.ink};letter-spacing:-0.3px;">
      Hola, <em style="font-style:italic;color:${BRAND.copper};">${residentName}</em>
    </h1>
    <p style="margin:0 0 28px;color:${BRAND.inkMuted};font-size:15px;line-height:1.65;">
      Tienes un gasto común pendiente para tu unidad <strong style="color:${BRAND.ink};font-weight:600;">${unitName}</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BRAND.paperWarm};border:1px solid ${BRAND.line};border-radius:14px;margin-bottom:28px;">
      <tr><td style="padding:24px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.inkTertiary};">Monto total</div>
        <div style="font-family:${BRAND.serif};font-size:38px;line-height:1.1;color:${BRAND.ink};margin:6px 0 20px;">${formattedAmount}</div>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-top:1px solid ${BRAND.line};">
          <tr>
            <td style="padding:14px 0 0;width:50%;vertical-align:top;">
              <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.inkTertiary};">Período</div>
              <div style="font-size:15px;color:${BRAND.ink};margin-top:3px;">${month}</div>
            </td>
            <td style="padding:14px 0 0;width:50%;vertical-align:top;">
              <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.inkTertiary};">Vencimiento</div>
              <div style="font-size:15px;font-weight:600;color:${BRAND.copperDeep};margin-top:3px;">${formattedDue}</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table cellpadding="0" cellspacing="0" role="presentation">
      <tr><td style="background:${BRAND.ink};border-radius:10px;">
        <a href="${getPublicUrl('/resident/finances')}"
           style="display:inline-block;padding:14px 28px;color:${BRAND.paper};font-size:15px;font-weight:600;text-decoration:none;">
          Pagar ahora
        </a>
      </td></tr>
    </table>

    <p style="margin:20px 0 0;color:${BRAND.inkTertiary};font-size:13px;line-height:1.6;">
      Si ya pagaste, ignora este mensaje. Los pagos pueden tardar hasta 24 horas en reflejarse.
    </p>`;

    return resend.emails.send({
        from: FROM_EMAIL,
        to,
        subject: cleanEmailSubject(`Gasto común pendiente — ${month} — ${formattedAmount}`),
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
    residentName = escapeEmailHtml(residentName);
    amenityName = escapeEmailHtml(amenityName);
    startTime = escapeEmailHtml(startTime);
    endTime = escapeEmailHtml(endTime);
    const formattedDate = formatEmailDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const content = `
    <h1 style="margin:0 0 10px;font-family:${BRAND.serif};font-size:30px;font-weight:400;line-height:1.2;color:${BRAND.ink};letter-spacing:-0.3px;">
      Reserva <em style="font-style:italic;color:${BRAND.sage};">confirmada</em>
    </h1>
    <p style="margin:0 0 28px;color:${BRAND.inkMuted};font-size:15px;line-height:1.65;">
      Hola <strong style="color:${BRAND.ink};font-weight:600;">${residentName}</strong>, ya quedó agendada.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BRAND.paperWarm};border:1px solid ${BRAND.line};border-radius:14px;margin-bottom:28px;">
      <tr><td style="padding:24px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.inkTertiary};">Instalación</div>
        <div style="font-family:${BRAND.serif};font-size:26px;line-height:1.2;color:${BRAND.ink};margin:6px 0 20px;">${amenityName}</div>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-top:1px solid ${BRAND.line};">
          <tr>
            <td style="padding:14px 0 0;width:58%;vertical-align:top;">
              <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.inkTertiary};">Fecha</div>
              <div style="font-size:15px;color:${BRAND.ink};margin-top:3px;">${formattedDate}</div>
            </td>
            <td style="padding:14px 0 0;width:42%;vertical-align:top;">
              <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.inkTertiary};">Horario</div>
              <div style="font-size:15px;font-weight:600;color:${BRAND.ink};margin-top:3px;">${startTime} a ${endTime}</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table cellpadding="0" cellspacing="0" role="presentation">
      <tr><td style="background:${BRAND.ink};border-radius:10px;">
        <a href="${getPublicUrl('/amenities')}"
           style="display:inline-block;padding:14px 28px;color:${BRAND.paper};font-size:15px;font-weight:600;text-decoration:none;">
          Ver mis reservas
        </a>
      </td></tr>
    </table>

    <p style="margin:20px 0 0;color:${BRAND.inkTertiary};font-size:13px;line-height:1.6;">
      Para cancelar o cambiar la reserva, hazlo desde la plataforma con al menos 2 horas de anticipación.
    </p>`;

    return resend.emails.send({
        from: FROM_EMAIL,
        to,
        subject: cleanEmailSubject(`Reserva confirmada — ${amenityName} — ${formattedDate}`),
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
    condoName = 'Convive Connect',
    temporaryPassword,
    requiresConfirmation = false,
}: {
    to: string;
    residentName: string;
    unitName: string;
    condoName?: string;
    temporaryPassword?: string;
    /**
     * La cuenta existe pero el correo todavía no está verificado.
     *
     * El registro envía este mensaje junto al de verificación, así que
     * invitar a "entrar a la plataforma" mandaba al residente a una puerta
     * cerrada: sin confirmar no puede iniciar sesión. Con esto el correo
     * reconoce el paso que falta en vez de contradecirlo.
     */
    requiresConfirmation?: boolean;
}) {
    residentName = escapeEmailHtml(residentName);
    unitName = escapeEmailHtml(unitName);
    condoName = escapeEmailHtml(condoName);
    temporaryPassword = temporaryPassword ? escapeEmailHtml(temporaryPassword) : undefined;
    // Sin emoji a propósito: Gmail los sustituye por recuadros de color y
    // rompían la lista entera. La jerarquía la lleva la tipografía.
    const servicios: Array<[string, string]> = [
        ['Gastos comunes', 'Revisa tu cartola y paga en línea'],
        ['Estacionamientos', 'Reserva o arrienda un espacio'],
        ['Espacios comunes', 'Agenda quinchos, salas y gimnasio'],
        ['Marketplace', 'Compra y vende con tus vecinos'],
        ['Supermercado', 'Pedidos y compras en grupo con el edificio'],
        ['CoCo', 'Tu asistente para dudas y trámites'],
    ];
    const filasServicios = servicios.map(([nombre, detalle], index) => `
      <tr>
        <td style="padding:${index === 0 ? '0' : '14px'} 0 14px;${index === servicios.length - 1 ? 'padding-bottom:0;' : `border-bottom:1px solid ${BRAND.line};`}">
          <div style="font-size:15px;font-weight:600;color:${BRAND.ink};line-height:1.4;">${nombre}</div>
          <div style="font-size:14px;color:${BRAND.inkMuted};line-height:1.5;margin-top:2px;">${detalle}</div>
        </td>
      </tr>`).join('');

    const content = `
    <h1 style="margin:0 0 10px;font-family:${BRAND.serif};font-size:32px;font-weight:400;line-height:1.15;color:${BRAND.ink};letter-spacing:-0.3px;">
      Bienvenido a ${condoName},<br/><em style="font-style:italic;color:${BRAND.copper};">${residentName}</em>
    </h1>
    <p style="margin:0 0 28px;color:${BRAND.inkMuted};font-size:15px;line-height:1.65;">
      Tu cuenta quedó creada para la unidad <strong style="color:${BRAND.ink};font-weight:600;">${unitName}</strong>.
      ${requiresConfirmation
        ? 'Te enviamos aparte un correo para verificar tu dirección: al confirmarlo tendrás acceso a todo esto.'
        : 'Desde ahora tienes acceso a todo lo de tu comunidad.'}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BRAND.paperWarm};border:1px solid ${BRAND.line};border-radius:14px;margin-bottom:28px;">
      <tr><td style="padding:22px 24px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.copper};margin-bottom:16px;">Lo que tienes disponible</div>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          ${filasServicios}
        </table>
      </td></tr>
    </table>
    ${temporaryPassword ? `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BRAND.copperBg};border:1px solid ${BRAND.copper};border-radius:14px;margin-bottom:28px;">
      <tr><td style="padding:20px 24px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.copperDeep};margin-bottom:8px;">Contraseña temporal</div>
        <div style="font-size:22px;font-weight:600;color:${BRAND.ink};font-family:'Geist Mono',ui-monospace,Menlo,monospace;letter-spacing:0.5px;">${temporaryPassword}</div>
        <div style="margin-top:8px;font-size:13px;color:${BRAND.inkMuted};">Cámbiala la primera vez que entres.</div>
      </td></tr>
    </table>` : ''}

    ${requiresConfirmation ? `
    <p style="margin:0;color:${BRAND.inkMuted};font-size:15px;line-height:1.65;">
      Busca el correo <strong style="color:${BRAND.ink};font-weight:600;">«Confirma tu correo»</strong> en tu bandeja.
      Si no aparece, revisa el spam o pídelo de nuevo desde
      <a href="${PUBLIC_SITE_URL}/login" style="color:${BRAND.copperDeep};text-decoration:underline;">el inicio de sesión</a>.
    </p>` : `
    <table cellpadding="0" cellspacing="0" role="presentation">
      <tr><td style="background:${BRAND.ink};border-radius:10px;">
        <a href="${PUBLIC_SITE_URL}"
           style="display:inline-block;padding:14px 28px;color:${BRAND.paper};font-size:15px;font-weight:600;text-decoration:none;">
          Entrar a la plataforma
        </a>
      </td></tr>
    </table>`}`;

    return resend.emails.send({
        from: FROM_EMAIL,
        to,
        subject: cleanEmailSubject(`Bienvenido/a a ${condoName} — Tu cuenta está lista`),
        html: emailWrapper(content, `Bienvenido a ${condoName}`),
    });
}
