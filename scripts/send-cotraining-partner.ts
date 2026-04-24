import { Resend } from 'resend';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const resend = new Resend(process.env.RESEND_API_KEY);

const html = `
<div style="font-family: sans-serif; padding: 24px; color: #333; max-width: 640px; margin: 0 auto;">
  <p>Hola equipo de CoTraining,</p>

  <p>Mi nombre es Pedro Moreno, soy fundador de <strong>DataWise</strong> (<a href="https://www.datawiseconsultoria.com">datawiseconsultoria.com</a>), empresa que opera con dos verticales de producto:</p>

  <ul>
    <li><strong>ComunidadConnect</strong> — plataforma SaaS de administración de condominios residenciales</li>
    <li><strong>People Analytics</strong> — solución de analítica de personas para equipos de RRHH y L&amp;D</li>
  </ul>

  <p>Me comunico a raíz de una conversación que tuve con Ignacia la semana pasada, quien me presentó el Programa de Partners. Tras revisar los niveles disponibles, queremos avanzar formalmente con una solicitud para <strong>dos modalidades de partnership</strong>:</p>

  <hr style="border:none; border-top:1px solid #eee; margin: 24px 0;" />

  <p><strong>🔹 Nivel 2 — Technology Partner: ComunidadConnect</strong><br/>
  ComunidadConnect cuenta con un módulo de <strong>Aula Virtual IA</strong> orientado a la capacitación de residentes, conserjes y administradores de comunidades. Queremos integrar CoTraining como el motor de generación de cursos dentro de la plataforma, bajo el modelo "Powered by CoTraining". Nuestro stack es <strong>Next.js + Supabase</strong> y contamos con equipo técnico disponible para ejecutar la integración.</p>

  <hr style="border:none; border-top:1px solid #eee; margin: 24px 0;" />

  <p><strong>🔹 Nivel 1 — Solution Partner: DataWise People Analytics</strong><br/>
  Nuestra vertical de People Analytics trabaja directamente con empresas que tienen equipos activos de RRHH y L&amp;D. Queremos incorporar CoTraining en nuestras propuestas de transformación de talento y recomendarla activamente a nuestros clientes, quienes son exactamente el perfil que CoTraining resuelve.</p>

  <hr style="border:none; border-top:1px solid #eee; margin: 24px 0;" />

  <p>Quedo disponible para que me cuenten cómo seguimos.</p>

  <p style="margin-top: 32px;">
    Saludos cordiales,<br/>
    <strong>Pedro Moreno</strong><br/>
    <a href="https://www.datawiseconsultoria.com/">https://www.datawiseconsultoria.com/</a><br/>
    corporativo@datawiseconsultoria.com
  </p>
</div>
`;

async function send() {
    const { data, error } = await resend.emails.send({
        from: 'Pedro Moreno <corporativo@datawiseconsultoria.com>',
        replyTo: 'corporativo@datawiseconsultoria.com',
        to: ['partners@cotraining.ai'],
        subject: 'Solicitud de Partnership — Technology Partner + Solution Partner | DataWise',
        html,
    });

    if (error) {
        console.error('❌ Error al enviar:', error);
    } else {
        console.log('✅ Correo enviado exitosamente. ID:', data?.id);
    }
}

send();
