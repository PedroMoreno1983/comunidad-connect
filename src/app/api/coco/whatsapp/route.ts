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
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

        // Verificar residente en Supabase
        const { data: resident } = await supabase
            .from('residents')
            .select('id, name, role, unit_id, units(community_id, unit_number), communities(name)')
            .eq('phone', `+${waId}`)
            .ilike('units.unit_number', `%${message}%`)
            .maybeSingle();

        if (resident) {
            await saveSession(sessionKey, {
                conversation: [],
                user_context: {
                    unit_id:      resident.unit_id,
                    role:         resident.role || 'resident',
                    community_id: (resident.units as any)?.[0]?.community_id || (resident.units as any)?.community_id,
                    name:         resident.name,
                    channel:      'whatsapp',
                },
                auth_state:   'verified',
                auth_attempts: 0,
            });
            return twiml(
                `¡Listo, ${resident.name}! ✅\n` +
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
