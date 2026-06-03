/**
 * /api/coco/whatsapp/route.ts
 * Webhook de WhatsApp (Twilio) para CoCo IA.
 * Maneja autenticación de residentes por número de teléfono + sesión persistente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { askCoCo } from '@/lib/coco/agent';
import {
    getSession,
    saveSession,
    checkRateLimit,
} from '@/lib/coco/session-store';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { formatWhatsAppPhone, getWhatsAppConfigStatus } from '@/lib/whatsapp';

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
            const { reply, updatedHistory } = await askCoCo(
                message,
                session,
                { ...session.user_context, channel: 'whatsapp' }
            );
            await saveSession(sessionKey, { ...session, conversation: updatedHistory });
            return twiml(reply);
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
        const formattedPhone = formatWhatsAppPhone(waId);
        const { data: profile } = await getSupabaseAdmin()
            .from('profiles')
            .select('id, name, full_name, role, unit_id, community_id, phone_number, whatsapp_enabled, department_number, units:unit_id(id, number, unit_number, tower, community_id)')
            .in('phone_number', [formattedPhone, `+${waId}`, waId])
            .eq('whatsapp_enabled', true)
            .maybeSingle();

        const profileRecord = profile as Record<string, unknown> | null;
        let unitRecord = profileRecord ? getUnitRecord(profileRecord.units) : null;
        if (profileRecord && !unitRecord) {
            const { data: ownedUnit } = await getSupabaseAdmin()
                .from('units')
                .select('id, number, unit_number, tower, community_id')
                .eq('owner_id', String(profileRecord.id))
                .maybeSingle();
            unitRecord = (ownedUnit as Record<string, unknown> | null) || null;
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
