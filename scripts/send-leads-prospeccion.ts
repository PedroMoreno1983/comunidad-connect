/**
 * Envío de correos de prospección a administradoras de condominios (leads de regiones).
 *
 * Uso:
 *   node scripts/send-leads-prospeccion.ts --dry-run            # solo muestra qué se enviaría
 *   node scripts/send-leads-prospeccion.ts --test tu@correo.cl  # envía UN correo de prueba
 *   node scripts/send-leads-prospeccion.ts --send               # envía a todos los leads con correo
 *
 * Requiere RESEND_API_KEY en .env.local (mismo dominio verificado: datawiseconsultoria.com).
 * Lee los leads desde leads_administradoras_regiones.csv (raíz del proyecto).
 * Conserva cada resultado en scripts/envios_leads_log.csv y omite correos ya aceptados.
 */
import { Resend } from 'resend';
import * as fs from 'fs';
import * as path from 'path';

try {
    process.loadEnvFile(path.resolve(process.cwd(), '.env.local'));
} catch {
    // si no existe .env.local, se asume que RESEND_API_KEY viene del entorno
}

const FROM = 'Pedro Moreno <corporativo@datawiseconsultoria.com>';
const REPLY_TO = 'corporativo@datawiseconsultoria.com';
const CSV_PATH = path.resolve(process.cwd(), 'leads_administradoras_regiones.csv');
const LOG_PATH = path.resolve(process.cwd(), 'scripts', 'envios_leads_log.csv');
const DELAY_MS = 700; // Resend: límite ~2 req/s; 700ms es seguro
const LOG_HEADER = 'fecha;empresa;correo;resultado;detalle';

type Lead = {
    empresa: string;
    ciudad: string;
    correo: string;
};

// --- CSV parsing (soporta campos con comillas y comas internas) ---
function parseCsv(content: string): string[][] {
    const rows: string[][] = [];
    let field = '';
    let row: string[] = [];
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (inQuotes) {
            if (ch === '"') {
                if (content[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && content[i + 1] === '\n') i++;
            row.push(field);
            field = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
        } else {
            field += ch;
        }
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

function loadLeads(): Lead[] {
    const raw = fs.readFileSync(CSV_PATH, 'utf-8').replace(/^﻿/, '');
    const rows = parseCsv(raw);
    const leads: Lead[] = [];

    for (const r of rows.slice(1)) {
        const [empresa = '', ciudad = '', correo = ''] = r;
        const email = correo.trim();
        if (!email || !email.includes('@')) continue; // solo leads con correo
        leads.push({
            empresa: empresa.trim(),
            ciudad: ciudad.trim(),
            correo: email,
        });
    }
    return leads;
}

function acceptedEmails(): Set<string> {
    if (!fs.existsSync(LOG_PATH)) return new Set();
    const rows = fs.readFileSync(LOG_PATH, 'utf-8').replace(/^\uFEFF/, '').split(/\r?\n/);
    return new Set(rows.slice(1)
        .map(line => line.split(';'))
        .filter(fields => fields.length >= 4 && fields[3] === 'OK')
        .map(fields => fields[2].trim().toLowerCase()));
}

function appendResult(lead: Lead, result: 'OK' | 'ERROR', detail: string) {
    if (!fs.existsSync(LOG_PATH) || fs.statSync(LOG_PATH).size === 0) {
        fs.appendFileSync(LOG_PATH, `${LOG_HEADER}\n`, 'utf-8');
    }
    const safe = (value: string) => value.replace(/[;\r\n]/g, ' ').trim();
    fs.appendFileSync(LOG_PATH,
        `${new Date().toISOString()};${safe(lead.empresa)};${safe(lead.correo)};${result};${safe(detail)}\n`, 'utf-8');
}

// "Temuco (por confirmar)" -> "Temuco"; "Quinta Región (...)" -> "la Quinta Región"
function ciudadFrase(ciudad: string): string {
    let c = ciudad.replace(/\s*\(.*?\)/g, '').trim();
    if (c.toLowerCase().startsWith('quinta región')) return 'la Quinta Región';
    if (c.toLowerCase().startsWith('región')) return c;
    if (/^chile$/i.test(c) || c === '') return 'su región';
    return c;
}

function buildHtml(lead: Lead): string {
    const ciudad = ciudadFrase(lead.ciudad);
    return `
<div style="font-family: sans-serif; padding: 24px; color: #333; max-width: 640px; margin: 0 auto;">
  <p>Estimado equipo de <strong>${lead.empresa}</strong>:</p>

  <p>Mi nombre es Pedro Moreno, cofundador de <strong>ComunidadConnect</strong> (<a href="https://conviveconnect.com">conviveconnect.com</a>), una plataforma chilena de gestión integral de condominios.</p>

  <p>Sabemos que administrar comunidades en ${ciudad} implica horas en cobranzas, rendiciones, reservas y comunicación con residentes. ComunidadConnect fue diseñada justamente para aliviar esa carga y elevar el estándar del servicio que ustedes entregan:</p>

  <ul>
    <li><strong>Gastos comunes:</strong> cobro, seguimiento de morosidad y rendiciones transparentes.</li>
    <li><strong>Reservas de amenidades:</strong> quinchos, salones y multicanchas con calendario online.</li>
    <li><strong>Estacionamientos:</strong> gestión y control de estacionamientos de visita y residentes.</li>
    <li><strong>Compras de supermercado:</strong> los residentes arman su compra desde la app y el agente de IA sugiere productos y recetas.</li>
    <li><strong>Votaciones y asambleas:</strong> decisiones comunitarias con registro digital.</li>
    <li><strong>Comunicados y feed:</strong> avisos oficiales a residentes sin depender de grupos de WhatsApp.</li>
    <li><strong>CoCo, nuestro agente de IA:</strong> responde consultas de residentes 24/7 y deriva solicitudes.</li>
    <li><strong>Multi-condominio:</strong> gestionan todas sus comunidades desde un solo panel.</li>
  </ul>

  <p>Nos encantaría mostrarles la plataforma en una <strong>demo breve de 15 minutos</strong>, sin costo ni compromiso, y conversar cómo podría integrarse a su operación actual.</p>

  <p>¿Les acomoda esta semana o la próxima? Quedo atento a sus horarios.</p>

  <p style="margin-top: 32px;">
    Saludos cordiales,<br/>
    <strong>Pedro Moreno</strong><br/>
    Cofundador — ComunidadConnect<br/>
    <a href="https://conviveconnect.com">https://conviveconnect.com</a><br/>
    corporativo@datawiseconsultoria.com<br/>
    +56 9 7397 1567
  </p>
</div>`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const sendAll = args.includes('--send');
    const testIdx = args.indexOf('--test');
    const testEmail = testIdx >= 0 ? args[testIdx + 1] : null;

    if (!dryRun && !sendAll && !testEmail) {
        console.log('Indica un modo: --dry-run | --test <correo> | --send');
        process.exit(1);
    }

    if (!process.env.RESEND_API_KEY && !dryRun) {
        console.error('❌ RESEND_API_KEY no está configurada (revisa .env.local)');
        process.exit(1);
    }

    const accepted = acceptedEmails();
    const seen = new Set<string>();
    const leads = loadLeads().filter(lead => {
        const email = lead.correo.toLowerCase();
        if (accepted.has(email) || seen.has(email)) return false;
        seen.add(email);
        return true;
    });
    console.log(`📋 Leads pendientes con correo: ${leads.length} (${accepted.size} ya aceptados)`);

    if (dryRun) {
        for (const lead of leads) {
            console.log(`\n--- ${lead.empresa} <${lead.correo}> (${lead.ciudad})`);
            console.log(`    Asunto: Herramienta de gestión para ${lead.empresa} — demo de 15 min`);
        }
        console.log('\n(dry-run: no se envió nada)');
        return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const targets = testEmail
        ? [{ empresa: 'Empresa de Prueba SpA', ciudad: 'Temuco', correo: testEmail }]
        : leads;

    let ok = 0;
    let fail = 0;

    for (const lead of targets) {
        const subject = `Herramienta de gestión para ${lead.empresa} — demo de 15 min`;
        let delivery: Awaited<ReturnType<typeof resend.emails.send>>;
        try {
            delivery = await resend.emails.send({
                from: FROM,
                replyTo: REPLY_TO,
                to: [lead.correo],
                bcc: REPLY_TO, // copia de respaldo al corporativo
                subject,
                html: buildHtml(lead),
            });
        } catch (error) {
            fail++;
            const detail = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${lead.empresa} <${lead.correo}>: ${detail}`);
            appendResult(lead, 'ERROR', detail);
            await sleep(DELAY_MS);
            continue;
        }
        if (delivery.error) {
            fail++;
            console.error(`❌ ${lead.empresa} <${lead.correo}>: ${delivery.error.message}`);
            appendResult(lead, 'ERROR', delivery.error.message);
        } else {
            ok++;
            console.log(`✅ ${lead.empresa} <${lead.correo}> — ID: ${delivery.data?.id}`);
            appendResult(lead, 'OK', delivery.data?.id || 'Aceptado sin ID');
        }

        await sleep(DELAY_MS);
    }

    console.log(`\n📊 Resultado: ${ok} enviados, ${fail} fallidos. Log: ${LOG_PATH}`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
