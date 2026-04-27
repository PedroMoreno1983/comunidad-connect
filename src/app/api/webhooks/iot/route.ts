import { NextRequest, NextResponse } from 'next/server';
import { askCoCo } from '@/lib/coco/agent';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Recibe eventos de sensores (Shelly, Tuya, etc.) e invoca a CoCo IA
 * de forma autónoma con privilegios de sistema.
 */
export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        const secret = process.env.IOT_WEBHOOK_SECRET;
        if (!secret) {
            console.error('[IoT] IOT_WEBHOOK_SECRET env var not set');
            return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
        }
        if (!authHeader || authHeader !== `Bearer ${secret}`) {
            return NextResponse.json({ error: 'Unauthorized IoT webhook' }, { status: 401 });
        }

        const payload = await req.json();
        
        // Payload típico de un evento (ej. Shelly Flood o botón de demo)
        const { sensor_id, type, unit_id, community_id, severity, location_detail } = payload;

        if (!sensor_id || !type || !unit_id) {
            return NextResponse.json({ error: 'Faltan campos (sensor_id, type, unit_id)' }, { status: 400 });
        }

        // Construir un mensaje del sistema que desencadene el loop agéntico de CoCo.
        // En lugar de que un humano hable con CoCo, el sistema le inyecta el reporte de máquina.
        const systemInterventionPrompt = `
Alerta CRÍTICA del Sistema Biotérmico / IoT del edificio.
DATOS DEL SENSOR:
- Sensor ID: ${sensor_id}
- Tipo de Alarma: ${type}
- Unidad Afectada: ${unit_id}
- Severidad: ${severity || 'ALTA'}
- Locación: ${location_detail || 'No especificada'}

Instrucciones para Agente Autónomo:
1. Registra de inmediato un reclamo/alerta de MANTENCIÓN con prioridad URGENTE.
2. Encuentra un proveedor ('plumbing' o 'general') disponible.
3. Despacha al proveedor contactándolo (dispatch_provider) enviando el detalle de la urgencia.
4. MUY IMPORTANTE: Genera una solicitud de acceso (request_urgent_access_approval) para el residente de la unidad indicándole el peligro inminente y pidiendo permiso para entrar con el proveedor.

Reporta los pasos que has tomado de forma secuencial. ¡No hagas preguntas, ejecuta el protocolo y mitiga la alarma estructural en esta misma iteración!`;

        // Contexto simulado para el Agente (Rol de Sistema / Root)
        const sysCtx = {
            role: 'system',
            unit_id,
            community_id: community_id || 'COMM-DEFAULT',
            name: 'AWS IoT Core Monitor',
        };


        // Disparamos la IA sin bloquear el webhook indefinidamente (Fire-and-Forget).
        // Next.js (fuera de serverless functions estrictas o usando waitUntil en Vercel) continuará ejecutando.
        // Como no tenemos waitUntil nativo importado, lo dejamos como Promesa flotante
        askCoCo(systemInterventionPrompt, null, sysCtx).catch(err => {
            console.error('[IoT Webhook Async Error]', err);
        });

        // Respondemos HTTP 202 ACCEPTED de inmediato
        return NextResponse.json({
            success: true,
            status: 'MITIGATION_STARTED',
            message: 'IoT event received, AI agent dispatched in background.'
        }, { status: 202 });

    } catch (e: unknown) {
        console.error('[IoT Webhook Error]', e);
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: 'Webkhook process failed', details: errorMessage }, { status: 500 });
    }
}
