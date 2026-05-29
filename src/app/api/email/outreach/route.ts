import { NextResponse } from 'next/server';
import { resend, FROM_EMAIL, emailWrapper } from '@/lib/email';
import { getPublicUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const { adminName, adminEmail, condoName } = await request.json();

        if (!adminName || !adminEmail) {
            return NextResponse.json({ error: 'Faltan datos obligatorios (nombre o email)' }, { status: 400 });
        }

        const condoLabel = condoName?.trim() || 'tu comunidad';
        const subject = `Propuesta de Software para la gestión de ${condoLabel} 🏢`;

        const html = emailWrapper(`
            <h1 style="color: #1a1a1a;">Hola Estimado Administrador, 👋</h1>
            <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.6;">
                Preparamos esta propuesta pensando en <strong>${condoLabel}</strong>.
            </p>
            <p style="margin:0 0 24px;color:#475569;font-size:16px;line-height:1.6;">
                Te escribo para presentarte <strong>Convive Connect</strong>, la plataforma SaaS diseñada específicamente para modernizar la administración de condominios y edificios.
            </p>

            <div style="background:#f8fafc;border-radius:12px;padding:24px;margin-bottom:32px;border:1px solid #e2e8f0;">
                <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#974C3C;">¿Por qué elegir Convive Connect?</h2>
                
                <div style="margin-bottom:16px;">
                    <p style="margin:0;font-weight:700;color:#1e293b;">🤖 IA Onboarding</p>
                    <p style="margin:4px 0 0;font-size:14px;color:#64748b;">Nuestra Inteligencia Artificial extrae datos de residentes y gastos históricos de cualquier PDF/Excel en minutos, eliminando meses de trabajo manual.</p>
                </div>

                <div style="margin-bottom:16px;">
                    <p style="margin:0;font-weight:700;color:#1e293b;">📊 Gestión Financiera de Élite</p>
                    <p style="margin:4px 0 0;font-size:14px;color:#64748b;">Automatiza el cálculo de gastos comunes, conciliación bancaria con Haulmer y reportes detallados en un solo clic.</p>
                </div>

                <div style="margin-bottom:16px;">
                    <p style="margin:0;font-weight:700;color:#1e293b;">📱 Experiencia Digital 100%</p>
                    <p style="margin:4px 0 0;font-size:14px;color:#64748b;">Muro de noticias interactivo, reservas de amenities, votaciones digitales y botón de pánico para residentes.</p>
                </div>

                <div>
                    <p style="margin:0;font-weight:700;color:#1e293b;">🚛 Marketplace de Servicios</p>
                    <p style="margin:4px 0 0;font-size:14px;color:#64748b;">Acceso directo a proveedores certificados y servicios para la comunidad desde la misma aplicación.</p>
                </div>
            </div>

            <p style="margin:0 0 32px;color:#475569;font-size:15px;line-height:1.6;">
                Estamos convencidos de que podemos ahorrarte mucho tiempo operativo.
            </p>
            <div style="margin-top: 30px; margin-bottom: 30px;">
                <a href="${getPublicUrl('/login')}" style="display: inline-block; padding: 12px 24px; background-color: #C8705A; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                    Ver Convive Connect
                </a>
            </div>
            <p style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; color: #666;">
                Atentamente,<br>
                <strong>Equipo Convive Connect</strong>
            </p>

            <p style="margin:32px 0 0;color:#94a3b8;font-size:13px;font-style:italic;">
                Este es un correo de invitación directa de parte del equipo de Convive Connect.
                Si deseas agendar una reunión personalizada, solo responde a este email.
            </p>
        `, 'Invitación a Convive Connect');

        const { error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: [adminEmail],
            subject,
            html,
        });

        if (error) throw new Error(error.message);

        return NextResponse.json({ ok: true, message: 'Correo enviado con éxito' });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        console.error('Error sending outreach email:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
