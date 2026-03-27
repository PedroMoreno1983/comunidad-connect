import { NextResponse } from 'next/server';
import { resend, FROM_EMAIL, SUPERADMIN_EMAIL, emailWrapper } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const { communityName, address, planName, adminEmail, adminName } = await request.json();

        const html = emailWrapper(`
            <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#1e293b;">
                🏢 Nuevo Edificio Registrado
            </h1>
            <p style="margin:0 0 32px;color:#64748b;font-size:15px;">
                Un administrador acaba de registrar su condominio en ComunidadConnect.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:32px;">
                <tr style="background:#f8fafc;">
                    <td style="padding:12px 20px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e2e8f0;">Detalle</td>
                    <td style="padding:12px 20px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e2e8f0;">Valor</td>
                </tr>
                <tr><td style="padding:14px 20px;font-weight:600;color:#475569;border-bottom:1px solid #f1f5f9;">Condominio</td><td style="padding:14px 20px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${communityName}</td></tr>
                <tr style="background:#fafafa;"><td style="padding:14px 20px;font-weight:600;color:#475569;border-bottom:1px solid #f1f5f9;">Dirección</td><td style="padding:14px 20px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${address || '—'}</td></tr>
                <tr><td style="padding:14px 20px;font-weight:600;color:#475569;border-bottom:1px solid #f1f5f9;">Plan</td><td style="padding:14px 20px;border-bottom:1px solid #f1f5f9;"><span style="background:#ede9fe;color:#6d28d9;padding:4px 10px;border-radius:20px;font-size:13px;font-weight:700;">${planName || 'Sin plan'}</span></td></tr>
                <tr style="background:#fafafa;"><td style="padding:14px 20px;font-weight:600;color:#475569;">Administrador</td><td style="padding:14px 20px;color:#1e293b;">${adminName} &lt;${adminEmail}&gt;</td></tr>
            </table>

            <a href="https://comunidad-connect-eight.vercel.app" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#818cf8);color:#fff;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;">
                Ver en SuperAdmin →
            </a>
        `, 'Nuevo Edificio Registrado');

        const { error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: [SUPERADMIN_EMAIL],
            subject: `🏢 Nuevo edificio: ${communityName}`,
            html,
        });

        if (error) throw new Error(error.message);

        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        console.error('Error sending new-community email:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
