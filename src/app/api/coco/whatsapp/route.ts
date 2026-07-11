/**
 * /api/coco/whatsapp/route.ts
 * Webhook de WhatsApp (Twilio) para CoCo IA.
 * Maneja autenticación de residentes por número de teléfono + sesión persistente.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { askCoCo } from '@/lib/coco/agent';
import {
    getSession,
    saveSession,
    deleteSession,
    checkRateLimit,
} from '@/lib/coco/session-store';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { formatWhatsAppPhone, getWhatsAppConfigStatus } from '@/lib/whatsapp';
import { PUBLIC_SITE_URL, WHATSAPP_WEBHOOK_PATH } from '@/lib/config';

/**
 * Valida que el POST venga realmente de Twilio (algoritmo oficial:
 * HMAC-SHA1 de la URL exacta del webhook + parametros ordenados, con el
 * Auth Token como llave). Sin esto, cualquiera que conozca la URL puede
 * hacerse pasar por un numero de WhatsApp verificado.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
function verifyTwilioSignature(signature: string | null, params: Record<string, string>): boolean {
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    if (!authToken) {
        console.error('[CoCo WhatsApp] TWILIO_AUTH_TOKEN no configurado');
        return false;
    }
    if (!signature) return false;

    const url = `${PUBLIC_SITE_URL}${WHATSAPP_WEBHOOK_PATH}`;
    const sortedBody = Object.keys(params)
        .sort()
        .map(key => `${key}${params[key]}`)
        .join('');

    const expected = crypto
        .createHmac('sha1', authToken)
        .update(url + sortedBody, 'utf8')
        .digest('base64');

    const provided = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    return provided.length === expectedBuf.length && crypto.timingSafeEqual(provided, expectedBuf);
}

function twiml(text: string): NextResponse {
    const safe = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return new NextResponse(
        `<Response><Message>${safe}</Message></Response>`,
        { headers: { 'Content-Type': 'text/xml' } }
    );
}

function getUnitRecord(unit: unknown): Record<string, unknown> | null {
    const record = Array.isArray(unit) ? unit[0] : unit;
    if (!record || typeof record !== 'object') return null;
    return record as Record<string, unknown>;
}

function unitCandidates(unit: Record<string, unknown> | null, profile: Record<string, unknown>) {
    const values = new Set<string>();
    const add = (value: unknown) => {
        const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
        if (text) values.add(text);
    };

    add(profile.department_number);

    if (unit) {
        const number = String(unit.unit_number || unit.number || '').trim();
        const tower = String(unit.tower || '').trim();
        add(number);
        add(tower);
        if (tower && number) {
            add(`${tower}${number}`);
            add(`${tower}-${number}`);
            add(`${tower} ${number}`);
            add(`${number}${tower}`);
            add(`${number}-${tower}`);
        }
    }

    return Array.from(values);
}

function cleanUnitValue(value: string) {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function phoneDigits(value: unknown) {
    return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function phoneMatches(savedPhone: unknown, waId: string) {
    const saved = phoneDigits(savedPhone);
    const incoming = phoneDigits(formatWhatsAppPhone(waId));
    const localIncoming = incoming.startsWith('56') ? incoming.slice(2) : incoming;
    const localSaved = saved.startsWith('56') ? saved.slice(2) : saved;

    return Boolean(
        saved &&
        incoming &&
        (saved === incoming ||
            localSaved === localIncoming ||
            saved.endsWith(localIncoming) ||
            incoming.endsWith(localSaved))
    );
}

function unitMatches(input: string, candidates: string[]) {
    const cleanInput = cleanUnitValue(input);
    return candidates.some(candidate => {
        const cleanCandidate = cleanUnitValue(candidate);
        return Boolean(cleanInput && cleanCandidate && cleanInput === cleanCandidate);
    });
}

function getUnitDisplay(candidates: string[]) {
    return candidates[0] || 'Unidad';
}

export async function GET() {
    return NextResponse.json(getWhatsAppConfigStatus());
}

export async function POST(req: NextRequest) {
    // Twilio envía form-urlencoded
    const formData = await req.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
        params[key] = typeof value === 'string' ? value : '';
    }

    if (!verifyTwilioSignature(req.headers.get('x-twilio-signature'), params)) {
        console.warn('[CoCo WhatsApp] Firma de Twilio invalida o ausente; peticion rechazada.');
        return new NextResponse('', { status: 401 });
    }

    const message = (formData.get('Body') as string)?.trim();
    const waId    = formData.get('WaId') as string; // número sin +

    if (!message || !waId) return new NextResponse('', { status: 400 });

    // Rate limit: 15 mensajes/min por número
    if (!checkRateLimit(`wa:${waId}`, 15)) {
        return twiml('Demasiados mensajes en poco tiempo. Espera 1 minuto. 🙏');
    }

    try {
        const sessionKey = `wa:${waId}`;
        const session = await getSession(sessionKey);

        // ── ¿Ya está autenticado? ────────────────────────────────────────────
        if (session?.auth_state === 'verified') {
            const authenticatedUserId = session.user_context.user_id;
            const { data: currentProfile } = authenticatedUserId
                ? await getSupabaseAdmin()
                    .from('profiles')
                    .select('id,name,full_name,role,unit_id,community_id,phone_number,whatsapp_enabled')
                    .eq('id', authenticatedUserId)
                    .maybeSingle()
                : { data: null };
            if (
                !currentProfile
                || !currentProfile.whatsapp_enabled
                || !phoneMatches(currentProfile.phone_number, waId)
                || !currentProfile.community_id
            ) {
                await deleteSession(sessionKey);
                return twiml('Tu sesion de CoCo debe verificarse nuevamente. Envia otro mensaje para comenzar.');
            }

            const verifiedContext = {
                user_id: String(currentProfile.id),
                unit_id: typeof currentProfile.unit_id === 'string' ? currentProfile.unit_id : undefined,
                role: String(currentProfile.role || 'resident'),
                community_id: String(currentProfile.community_id),
                name: String(currentProfile.name || currentProfile.full_name || 'vecino/a'),
                channel: 'whatsapp',
            };
            const { reply, updatedHistory, pendingActions } = await askCoCo(
                message,
                session,
                verifiedContext,
            );
            await saveSession(sessionKey, { ...session, conversation: updatedHistory, user_context: verifiedContext });
            if (pendingActions?.length) {
                const actionList = pendingActions.map(action => `- ${action.title}: ${action.summary}`).join('\n');
                return twiml(`${reply || 'Necesito tu confirmacion antes de continuar.'}\n\n${actionList}\n\nResponde APROBAR para ejecutar o RECHAZAR para cancelar.`);
            }
            return twiml(reply || 'La solicitud fue procesada.');
        }

        // ── Flujo de autenticación ───────────────────────────────────────────
        const attempts = session?.auth_attempts ?? 0;

        if (attempts === 0) {
            // Primer mensaje → pedir número de depto
            await saveSession(sessionKey, {
                conversation: [],
                user_context: { channel: 'whatsapp' },
                auth_state: 'pending',
                auth_attempts: 1,
            });
            return twiml(
                '👋 Hola, soy *CoCo*, el asistente de tu comunidad.\n\n' +
                'Para ayudarte necesito verificar que eres residente. ' +
                '¿Cuál es tu número de depto? (ej: *8B*, *101*, *Casa 3*)'
            );
        }

        // Verificar residente en Supabase usando profiles + units reales del schema actual.
        const admin = getSupabaseAdmin();
        const { data: enabledProfiles } = await admin
            .from('profiles')
            .select('id, name, full_name, role, unit_id, community_id, phone_number, whatsapp_enabled, department_number')
            .eq('whatsapp_enabled', true)
            .limit(500);

        const profileRecord = (enabledProfiles || [])
            .find(profile => phoneMatches((profile as Record<string, unknown>).phone_number, waId)) as Record<string, unknown> | undefined;
        let unitRecord = profileRecord ? getUnitRecord(profileRecord.units) : null;
        if (profileRecord && !unitRecord) {
            const linkedUnitId = typeof profileRecord.unit_id === 'string' ? profileRecord.unit_id : '';
            const unitQuery = admin
                .from('units')
                .select('id, number, unit_number, tower, community_id');

            const { data: linkedUnit } = linkedUnitId
                ? await unitQuery.eq('id', linkedUnitId).maybeSingle()
                : { data: null };

            if (linkedUnit) {
                unitRecord = linkedUnit as Record<string, unknown>;
            } else {
                const { data: ownedUnit } = await admin
                    .from('units')
                    .select('id, number, unit_number, tower, community_id')
                    .eq('owner_id', String(profileRecord.id))
                    .maybeSingle();
                unitRecord = (ownedUnit as Record<string, unknown> | null) || null;
            }
        }
        const candidates = profileRecord ? unitCandidates(unitRecord, profileRecord) : [];
        const resident = profileRecord && unitMatches(message, candidates) ? profileRecord : null;
        const unitLabel = getUnitDisplay(candidates);

        if (resident) {
            const name = String(resident.name || resident.full_name || 'vecino/a');
            await saveSession(sessionKey, {
                conversation: [],
                user_context: {
                    user_id:      String(resident.id),
                    unit_id:      String(resident.unit_id || unitRecord?.id || unitLabel),
                    role:         String(resident.role || 'resident'),
                    community_id: String(resident.community_id || ''),
                    name,
                    channel:      'whatsapp',
                },
                auth_state:   'verified',
                auth_attempts: 0,
            });
            return twiml(
                `¡Listo, ${name}! ✅\n` +
                `Soy CoCo, tu asistente en tu comunidad. ¿En qué te ayudo?`
            );
        }

        // Intento fallido
        const newAttempts = attempts + 1;
        if (newAttempts > 3) {
            await saveSession(sessionKey, {
                conversation: [],
                user_context: { channel: 'whatsapp' },
                auth_state: 'pending',
                auth_attempts: 0,
            });
            return twiml(
                'No pude verificar tu identidad. Si crees que hay un error, ' +
                'contacta al administrador de tu comunidad.'
            );
        }

        await saveSession(sessionKey, {
            conversation: [],
            user_context: { channel: 'whatsapp' },
            auth_state: 'pending',
            auth_attempts: newAttempts,
        });
        return twiml(
            `No encontré ese depto con tu número. Intento ${newAttempts - 1}/3. ` +
            '¿Puedes revisar cómo aparece en tu app?'
        );

    } catch (err) {
        console.error('[CoCo WhatsApp Error]', err);
        return twiml('Ocurrió un error. Intenta de nuevo en unos segundos.');
    }
}
