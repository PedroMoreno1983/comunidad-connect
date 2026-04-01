import { Resend } from 'resend';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import * as xlsx from 'xlsx';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const resend = new Resend(process.env.RESEND_API_KEY);

const EXCEL_PATH = "C:\\Users\\pedro.moreno\\Downloads\\Administradores_RM.xlsx";
const LOG_FILE = path.resolve(process.cwd(), "scripts", "envios-completados.json");

const BATCH_SIZE = 100; // Plan gratuito de Resend suele limitar a 100 diarios. Ajustar si es necesario.
const DELAY_BETWEEN_EMAILS_MS = 1000; // 1 segundo entre envíos para no sobrecargar el rate limit de Resend API.

// Cargar o inicializar el archivo de historial de correos enviados
let sentLogs: string[] = [];
if (fs.existsSync(LOG_FILE)) {
    const data = fs.readFileSync(LOG_FILE, 'utf-8');
    sentLogs = JSON.parse(data);
} else {
    fs.writeFileSync(LOG_FILE, JSON.stringify([]));
}

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

            <p style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; color: #666; font-size: 14px;">
                Atentamente,<br>
                <strong>Equipo Comunidad Connect</strong>
            </p>
        </div>
    `;
}

async function startBulkOutreach() {
    console.log('Iniciando campaña de envíos masivos...');
    console.log('Cargando Excel desde:', EXCEL_PATH);

    if (!fs.existsSync(EXCEL_PATH)) {
        console.error('❌ Archivo Excel no encontrado. Verifica la ruta.');
        process.exit(1);
    }

    const workbook = xlsx.readFile(EXCEL_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    // Cast to explicit types since columns can vary
    const rows: any[] = xlsx.utils.sheet_to_json(worksheet);

    console.log(`Total de filas detectadas en el Excel: ${rows.length}`);

    let emailsEnviadosEnEstaSesion = 0;
    
    // Iteramos por las filas
    for (const row of rows) {
        // En tu excel vimos que las columnas se llaman "Nombre", "Email", "Estado"
        const nombreCrudo = row['Nombre'] || row['NOMBRE'] || 'Estimado Administrador';
        const emailCrudo = row['Email'] || row['EMAIL'] || row['Correo'] || '';
        const estado = row['Estado'] || row['ESTADO'];

        const email = emailCrudo.toString().trim().toLowerCase();
        
        // Formatear nombre: "JUAN PEREZ" -> "Juan Perez"
        const nombreFormateado = nombreCrudo.toString().trim().split(' ')
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');

        if (!email || !email.includes('@')) {
            continue; // No es un email válido
        }

        // Filtro opcional: "todos son vigentes", pero hacemos un sanity check
        if (estado && estado.toString().toLowerCase() !== 'vigente') {
            continue;
        }

        // Si ya le enviamos un correo, nos lo saltamos
        if (sentLogs.includes(email)) {
            continue;
        }

        // Respetamos límite del plan gratuito (100 diarios, configurado en BATCH_SIZE)
        if (emailsEnviadosEnEstaSesion >= BATCH_SIZE) {
            console.log(`\n⏸️ Se ha alcanzado el límite fijado por sesión (${BATCH_SIZE}). El script se detiene preventivamente para proteger tu límite de API.`);
            break;
        }

        console.log(`Enviando [${emailsEnviadosEnEstaSesion + 1}/${BATCH_SIZE}] a: ${email} (${nombreFormateado})...`);

        try {
            const { data, error } = await resend.emails.send({
                from: 'ComunidadConnect <notificaciones@datawiseconsultoria.com>', 
                to: [email],
                subject: `Propuesta de Software para la administración de tus comunidades 🏢`,
                html: generarHtmlCorreo(nombreFormateado),
            });

            if (error) {
                console.error(`❌ Error al enviar a ${email}:`, error);
                if (error.message && error.message.includes('rate limit')) {
                    console.error('Rate limit alcanzado. Deteniendo...');
                    break;
                }
            } else {
                console.log(`✅ ¡Éxito! (ID: ${data?.id})`);
                sentLogs.push(email);
                
                // Actualizamos el json inmediatamente en caso de interrupción repentina
                fs.writeFileSync(LOG_FILE, JSON.stringify(sentLogs, null, 2));
                emailsEnviadosEnEstaSesion++;
                
                // Pausa antes del siguiente correo
                await delay(DELAY_BETWEEN_EMAILS_MS);
            }
        } catch (err: any) {
            console.error(`❌ Error inesperado con ${email}:`, err.message);
        }
    }

    console.log(`\n🎉 Campaña pausada/finalizada. Correos enviados exitosamente en esta sesión: ${emailsEnviadosEnEstaSesion}`);
    console.log(`Progreso total guardado en: ${LOG_FILE}`);
}

startBulkOutreach();
