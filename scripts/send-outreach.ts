import { Resend } from 'resend';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const resend = new Resend(process.env.RESEND_API_KEY);

function generarHtmlCorreo(nombre: string) {
    return `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px;">
            <h1 style="color: #1a1a1a;">Hola ${nombre}, 👋</h1>
            <p style="font-size: 16px; line-height: 1.6;">Soy del equipo de <strong>ComunidadConnect</strong>.</p>
            <p style="font-size: 16px; line-height: 1.6;">Te escribo para presentarte nuestra plataforma SaaS diseñada para modernizar y facilitar la administración de condominios en la Región Metropolitana.</p>
            <ul style="font-size: 16px; line-height: 1.6;">
                <li><strong>IA Onboarding:</strong> Extrae datos de PDFs y lee boletas en minutos.</li>
                <li><strong>Gestión Financiera:</strong> Automatización de cobro y conciliación de gastos comunes.</li>
                <li><strong>App Residente:</strong> Aula virtual, muro de noticias, reserva de espacios y más.</li>
            </ul>
            <p style="font-size: 16px; line-height: 1.6;">Estamos convencidos de que podemos ahorrarte mucho tiempo operativo en las comunidades que administras.</p>
            
            <div style="margin: 30px 0;">
                <a href="https://comunidad-connect-eight.vercel.app/login" style="display: inline-block; padding: 14px 28px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                    Ver Demo Gratis
                </a>
            </div>

            <p style="font-size: 16px; line-height: 1.6;">Si estás interesado en implementar esta solución o tienes alguna duda, no dudes en contactarnos escribiéndonos a <strong>corporativo@datawiseconsultoria.com</strong>, o simplemente respondiendo a este correo.</p>

            <p style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; color: #666; font-size: 14px;">
                Atentamente,<br>
                <strong>Equipo Comunidad Connect</strong>
            </p>
        </div>
    `;
}

async function startTestSend() {
    const email = "corporativo@datawiseconsultoria.com";
    const nombreFormateado = "Pedro (Demo Datawise)";

    console.log(`Enviando UN SOLO COREO de prueba a: ${email} (${nombreFormateado})...`);

    try {
        const { data, error } = await resend.emails.send({
            from: 'ComunidadConnect <notificaciones@datawiseconsultoria.com>', 
            replyTo: 'corporativo@datawiseconsultoria.com',
            to: [email],
            subject: `Propuesta de Software para la administración de tus comunidades 🏢`,
            html: generarHtmlCorreo(nombreFormateado),
        });

        if (error) {
            console.error(`❌ Error al enviar la prueba:`, error);
        } else {
            console.log(`✅ ¡Correo de prueba enviado con éxito! (ID: ${data?.id})`);
            console.log('Por favor revisa la bandeja de entrada de corporativo@datawiseconsultoria.com (o la pestaña de Spam).');
        }
    } catch (err: any) {
        console.error(`❌ Error inesperado:`, err.message);
    }
}

startTestSend();
