import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { askCoCo } from '@/lib/coco/agent';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

function cleanText(value: unknown, maxLength = 200) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function secretMatches(authHeader: string | null, secret: string) {
    if (!authHeader) return false;
    const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
    const provided = Buffer.from(authHeader, 'utf8');
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

/**
 * Recibe eventos de sensores (Shelly, Tuya, etc.) e invoca a CoCo IA
 * de forma autónoma con privilegios de sistema.
 */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'webhooks.iot', { limit: 120, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const authHeader = req.headers.get('authorization');
        const globalSecret = process.env.IOT_WEBHOOK_SECRET;

        const payload = await req.json() as Record<string, unknown>;

        // Payload tipico de un evento IoT (ej. Shelly Flood o boton fisico).
        const sensor_id = cleanText(payload.sensor_id, 120);
        const type = cleanText(payload.type, 80);
        const unit_id = cleanText(payload.unit_id, 120);
        const community_id = cleanText(payload.community_id, 120);
        const severity = cleanText(payload.severity, 30) || 'ALTA';
        const location_detail = cleanText(payload.location_detail, 300) || 'No especificada';
        const timestamp = cleanText(payload.timestamp, 40);

        if (!sensor_id || !type || !unit_id || !isUuid(community_id)) {
            return NextResponse.json({ error: 'Faltan campos validos (sensor_id, type, unit_id, community_id)' }, { status: 400 });
        }

        // Anti-replay: reject events whose timestamp is missing or more than 5 minutes old/skewed.
        const eventTime = timestamp ? new Date(timestamp).getTime() : NaN;
        if (!Number.isFinite(eventTime) || Math.abs(Date.now() - eventTime) > 5 * 60_000) {
            return NextResponse.json({ error: 'Timestamp de evento invalido o expirado' }, { status: 401 });
        }

        // Per-community secret takes precedence over the legacy global one, so a
        // secret leaked from one building's gateway can't spoof another community's events.
        const { data: community } = await getSupabaseAdmin()
            .from('communities')
            .select('iot_webhook_secret')
            .eq('id', community_id)
            .maybeSingle();
        const expectedSecret = community?.iot_webhook_secret || globalSecret;
        if (!expectedSecret) {
            console.error('[IoT] No webhook secret configured for community', community_id);
            return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
        }
        if (!secretMatches(authHeader, expectedSecret)) {
            return NextResponse.json({ error: 'Unauthorized IoT webhook' }, { status: 401 });
        }

        const unitQuery = getSupabaseAdmin()
            .from('units')
            .select('id')
            .eq('community_id', community_id);
        const { data: unit } = isUuid(unit_id)
            ? await unitQuery.eq('id', unit_id).maybeSingle()
            : await unitQuery.eq('number', unit_id).maybeSingle();
        if (!unit) {
            return NextResponse.json({ error: 'La unidad no pertenece a la comunidad indicada' }, { status: 403 });
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

        // Contexto de sistema para el agente autonomo.
        const sysCtx = {
            role: 'system',
            unit_id: unit.id,
            community_id,
            name: 'AWS IoT Core Monitor',
        };


        const agentResponse = await askCoCo(systemInterventionPrompt, null, sysCtx);

        return NextResponse.json({
            success: true,
            status: 'MITIGATION_PROCESSED',
            message: 'IoT event received and processed by CoCo.',
            reply: agentResponse.reply,
            action: agentResponse.action,
            navigate: agentResponse.navigate,
            processed_at: new Date().toISOString(),
        }, { status: 200 });

    } catch (e: unknown) {
        console.error('[IoT Webhook Error]', e);
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: 'Webkhook process failed', details: errorMessage }, { status: 500 });
    }
}
