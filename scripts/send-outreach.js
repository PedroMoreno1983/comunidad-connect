
const { Resend } = require('resend');
const dotenv = require('dotenv');
const path = require('path');

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOutreach() {
    const adminEmail = "corporativo@datawiseconsultoria.com";

    console.log(`Enviando correo formal a: ${adminEmail}...`);

    try {
        const result = await resend.emails.send({
            from: 'ComunidadConnect <notificaciones@datawiseconsultoria.com>',
            to: [adminEmail],
            subject: `Propuesta de Software para la gestión de condominios 🏢`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px;">
                    <h1 style="color: #1a1a1a;">Hola Estimado Administrador, 👋</h1>
                    <p style="font-size: 16px; line-height: 1.6;">Soy del equipo de <strong>ComunidadConnect</strong>.</p>
                    <p style="font-size: 16px; line-height: 1.6;">Te escribo para presentarte nuestra plataforma SaaS diseñada para modernizar la administración de condominios.</p>
                    <ul style="font-size: 16px; line-height: 1.6;">
                        <li><strong>IA Onboarding:</strong> Extrae datos de PDFs en minutos.</li>
                        <li><strong>Gestión Financiera:</strong> Automatización de gastos comunes.</li>
                        <li><strong>App Residente:</strong> Muro de noticias, reservas y más.</li>
                    </ul>
                    <p style="font-size: 16px; line-height: 1.6;">Estamos convencidos de que podemos ahorrarte mucho tiempo operativo.</p>
                    
                    <div style="margin: 30px 0;">
                        <a href="https://comunidad-connect-eight.vercel.app/login" style="display: inline-block; padding: 14px 28px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                            Ver Demo Gratis
                        </a>
                    </div>

                    <p style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; color: #666; font-size: 14px;">
                        Atentamente,<br>
                        <strong>Equipo Comunidad Connect</strong>
                    </p>
                </div>
            `,
        });

        if (result.error) {
            console.error('Error al enviar:', result.error);
            process.exit(1);
        }

        console.log('¡Correo enviado con éxito!', result.data);
    } catch (err) {
        console.error('Error inesperado:', err);
        process.exit(1);
    }
}

sendOutreach();
