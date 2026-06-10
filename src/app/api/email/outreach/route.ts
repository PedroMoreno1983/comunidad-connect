import { NextResponse } from 'next/server';
import { FROM_EMAIL, SUPERADMIN_EMAIL, emailWrapper, resend } from '@/lib/email';
import { getPublicUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

function asText(value: unknown, maxLength = 400): string {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export async function POST(request: Request) {
    try {
        const body = await request.json() as Record<string, unknown>;
        const adminName = asText(body.adminName, 120);
        const adminEmail = asText(body.adminEmail, 180);
        const condoName = asText(body.condoName, 160);
        const message = asText(body.message, 1200);

        if (!adminName || !adminEmail) {
            return NextResponse.json({ error: 'Faltan datos obligatorios (nombre o email)' }, { status: 400 });
        }

        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(adminEmail)) {
            return NextResponse.json({ error: 'Email invalido' }, { status: 400 });
        }

        const condoLabel = condoName || 'tu comunidad';
        const safeAdminName = escapeHtml(adminName);
        const safeCondoLabel = escapeHtml(condoLabel);
        const safeMessage = escapeHtml(message || 'Sin detalle adicional.');
        const subject = `Activacion inteligente Convive Connect - ${condoLabel}`;

        const html = emailWrapper(`
            <h1 style="color:#1a1a1a;">Hola ${safeAdminName},</h1>
            <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.6;">
                Recibimos la solicitud de activacion inteligente para <strong>${safeCondoLabel}</strong>.
            </p>
            <p style="margin:0 0 24px;color:#475569;font-size:16px;line-height:1.6;">
                El siguiente paso es crear la comunidad y subir los archivos disponibles para que CoCo prepare unidades, residentes, brechas y modulos iniciales antes de guardar datos reales.
            </p>

            <div style="background:#fff7ed;border-radius:12px;padding:18px;margin-bottom:24px;border:1px solid #fed7aa;">
                <p style="margin:0 0 8px;font-weight:700;color:#974C3C;">Detalle recibido</p>
                <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">${safeMessage}</p>
            </div>

            <div style="background:#f8fafc;border-radius:12px;padding:24px;margin-bottom:32px;border:1px solid #e2e8f0;">
                <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#974C3C;">Que prepara CoCo</h2>
                <div style="margin-bottom:16px;">
                    <p style="margin:0;font-weight:700;color:#1e293b;">IA Onboarding</p>
                    <p style="margin:4px 0 0;font-size:14px;color:#64748b;">Extrae datos de residentes, unidades y contactos desde Excel, PDF, CSV o documentos desordenados.</p>
                </div>
                <div style="margin-bottom:16px;">
                    <p style="margin:0;font-weight:700;color:#1e293b;">Control de brechas</p>
                    <p style="margin:4px 0 0;font-size:14px;color:#64748b;">Marca filas incompletas, unidades repetidas, contactos faltantes y datos que requieren aprobacion.</p>
                </div>
                <div>
                    <p style="margin:0;font-weight:700;color:#1e293b;">Activacion segura</p>
                    <p style="margin:4px 0 0;font-size:14px;color:#64748b;">No crea usuarios ni invita residentes hasta que la administracion revise y confirme.</p>
                </div>
            </div>

            <div style="margin-top:30px;margin-bottom:30px;">
                <a href="${getPublicUrl('/admin-onboarding')}" style="display:inline-block;padding:12px 24px;background-color:#C8705A;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">
                    Crear comunidad
                </a>
            </div>
            <p style="margin-top:30px;border-top:1px solid #eee;padding-top:20px;color:#666;">
                Atentamente,<br>
                <strong>Equipo Convive Connect</strong>
            </p>
        `, 'Activacion inteligente Convive Connect');

        const recipients = Array.from(new Set([adminEmail, SUPERADMIN_EMAIL].filter(Boolean)));
        let deliveryError: string | null = null;

        try {
            const { error } = await resend.emails.send({
                from: FROM_EMAIL,
                to: recipients,
                subject,
                html,
            });

            deliveryError = error?.message || null;
        } catch (error) {
            deliveryError = error instanceof Error ? error.message : 'No se pudo enviar el email de respaldo.';
        }

        if (deliveryError) {
            console.warn('[email/outreach] Lead accepted but email delivery failed:', {
                adminEmail,
                condoName,
                reason: deliveryError,
            });
            return NextResponse.json({
                ok: true,
                emailSent: false,
                warning: deliveryError,
                message: 'Solicitud recibida. El email de respaldo quedo pendiente.',
            });
        }

        return NextResponse.json({ ok: true, emailSent: true, message: 'Solicitud recibida' });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        console.error('[email/outreach] Unexpected error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
