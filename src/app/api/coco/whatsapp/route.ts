/**
 * /api/coco/whatsapp/route.ts
 * Webhook de WhatsApp (Twilio) para CoCo IA.
 * Maneja autenticación de residentes por número de teléfono + sesión persistente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { askCoCo, SYNC_REPLY_MAX_TOOL_ROUNDS } from '@/lib/coco/agent';
import { isConversationClosing, learnFromClosing, linesFromConversation } from '@/lib/coco/learnFromChat';
import { askCoCoWhatsAppFallback } from '@/lib/coco/whatsapp-fallback';
import { isAiBudgetExceededError } from '@/lib/ai/budget';
import {
    getSession,
    saveSession,
    saveDeliveredTurn,
    deleteSession,
    type SessionData,
} from '@/lib/coco/session-store';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getWhatsAppConfigStatus } from '@/lib/whatsapp';
import { COCO_WHATSAPP_PRIVACY_LINE } from '@/lib/privacy';
import {
    askCoCoGuest,
    findProviderByPhone,
    findResidentProfilesByPhone,
    phoneMatches,
    type ResidentVerifier,
} from '@/lib/coco/whatsappGuest';
import { whatsappPendingReply } from '@/lib/coco/confirmation';
import { LEGAL_DRAFT_MARKER, canDraftLegalDocuments } from '@/lib/coco/legalDraftMarker';
import { markdownToPdf } from '@/lib/coco/pdf';
import { storeOutboundMedia } from '@/lib/coco/outboundMediaStore';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { CANONICAL_SITE_URL, PUBLIC_SITE_URL, WHATSAPP_WEBHOOK_PATH } from '@/lib/config';
import { publicRequestUrl, verifyTwilioSignatureForUrls } from '@/lib/security/twilioSignature';
import { checkDistributedRateLimitBySubject } from '@/lib/security/rateLimit';
import { parseTwilioMedia } from '@/lib/coco/inboundMedia';
import { readWhatsAppAttachments } from '@/lib/coco/inboundMediaFetch';

function xml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function twiml(text: string, mediaUrl?: string): NextResponse {
    const media = mediaUrl ? `<Media>${xml(mediaUrl)}</Media>` : '';
    return new NextResponse(
        `<Response><Message>${media}<Body>${xml(text)}</Body></Message></Response>`,
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

/** Unidad del perfil: la vinculada o, si no hay, la que el perfil tiene como dueño. */
async function residentUnit(profileRecord: Record<string, unknown>) {
    const embedded = getUnitRecord(profileRecord.units);
    if (embedded) return embedded;
    const admin = getSupabaseAdmin();
    const linkedUnitId = typeof profileRecord.unit_id === 'string' ? profileRecord.unit_id : '';
    if (linkedUnitId) {
        const { data: linkedUnit } = await admin.from('units')
            .select('id, number, unit_number, tower, community_id').eq('id', linkedUnitId).maybeSingle();
        if (linkedUnit) return linkedUnit as Record<string, unknown>;
    }
    const { data: ownedUnit } = await admin.from('units')
        .select('id, number, unit_number, tower, community_id').eq('owner_id', String(profileRecord.id)).maybeSingle();
    return (ownedUnit as Record<string, unknown> | null) || null;
}

function verifiedSession(resident: Record<string, unknown>, unitRecord: Record<string, unknown> | null, unitLabel: string): SessionData {
    return {
        conversation: [],
        user_context: {
            user_id:      String(resident.id),
            unit_id:      String(resident.unit_id || unitRecord?.id || unitLabel),
            role:         String(resident.role || 'resident'),
            community_id: String(resident.community_id || ''),
            name:         String(resident.name || resident.full_name || 'vecino/a'),
            channel:      'whatsapp',
        },
        auth_state:   'verified',
        auth_attempts: 0,
    };
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

async function maybeDraftMediaUrl(reply: string, user: { user_id: string; role: string; community_id: string }): Promise<string | undefined> {
    if (!reply.includes(LEGAL_DRAFT_MARKER) || !canDraftLegalDocuments(user.role)) return undefined;
    try {
        const pdf = await markdownToPdf(reply);
        return await storeOutboundMedia({
            communityId: user.community_id,
            createdBy: user.user_id,
            filename: 'borrador-convive.pdf',
            contentType: 'application/pdf',
            body: Buffer.from(pdf),
        });
    } catch (error) {
        console.error('[CoCo WhatsApp] No se pudo adjuntar el borrador', error);
        return undefined;
    }
}

export async function GET() {
    // El webhook es público: sin un administrador no se cuenta cómo está armado
    // Twilio (SID, número ni nombres de variables). El POST de los mensajes sigue abajo.
    const profile = await getAuthenticatedAgentProfile();
    if (profile?.role !== 'admin') return NextResponse.json({ ok: true });
    return NextResponse.json(getWhatsAppConfigStatus());
}

export async function POST(req: NextRequest) {
    // Twilio envía form-urlencoded
    const formData = await req.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
        params[key] = typeof value === 'string' ? value : '';
    }

    const relayedFromNorma = req.headers.get('x-coco-shared-number') === '1';
    const authToken = (relayedFromNorma
        ? process.env.COCO_TWILIO_AUTH_TOKEN
        : process.env.TWILIO_AUTH_TOKEN)?.trim();
    if (!authToken) console.error('[CoCo WhatsApp] Token de Twilio no configurado');
    // El sitio responde en el dominio propio y en el de Vercel. Twilio firma la
    // URL que efectivamente invoco, asi que se valida contra ambas: comparar solo
    // contra PUBLIC_SITE_URL rechazaba con 401 los mensajes legitimos que
    // entraban por el otro dominio.
    const candidateUrls = [
        publicRequestUrl(req, WHATSAPP_WEBHOOK_PATH),
        `${PUBLIC_SITE_URL}${WHATSAPP_WEBHOOK_PATH}`,
        `${CANONICAL_SITE_URL}${WHATSAPP_WEBHOOK_PATH}`,
    ];
    if (!verifyTwilioSignatureForUrls(req.headers.get('x-twilio-signature'), params, candidateUrls, authToken)) {
        console.warn(
            `[CoCo WhatsApp] Firma invalida o ausente; peticion rechazada. URLs probadas: ${candidateUrls.filter(Boolean).join(', ')}`,
        );
        return new NextResponse('', { status: 401 });
    }

    // Primer contacto (sesión nueva): la respuesta lleva una línea de privacidad.
    let firstContact = false;
    const respond = (text: string, mediaUrl?: string) => {
        const body = firstContact && text ? `${text}

${COCO_WHATSAPP_PRIVACY_LINE}` : text;
        return relayedFromNorma
            ? NextResponse.json({ reply: body, ...(mediaUrl ? { mediaUrl } : {}) })
            : twiml(body, mediaUrl);
    };

    const message = ((formData.get('Body') as string) || '').trim();
    const waId    = formData.get('WaId') as string; // número sin +
    const messageSid = formData.get('MessageSid') as string | null;
    const inboundMedia = parseTwilioMedia(params);

    if (!waId || (!message && inboundMedia.length === 0)) return new NextResponse('', { status: 400 });

    if (relayedFromNorma) {
        // Por el número compartido, Scrapp manda aquí a quien saludó a CoCo, a
        // quien ya conversa con ella y a quien responde un mensaje que salió de
        // Convive (X-CoCo-Route: last-outbound). Lo demás es de Norma.
        const sessionKey = `wa:${waId}`;
        const existingSession = await getSession(sessionKey);
        const answersConvive = req.headers.get('x-coco-route') === 'last-outbound';
        if (!existingSession && !answersConvive && !/^(hola\s+)?coco[.!?]?$/i.test(message)) {
            return new NextResponse('', { status: 204 });
        }
    }

    // Anti-replay: Twilio's signature scheme has no timestamp/nonce, so a captured
    // valid request could otherwise be replayed indefinitely. MessageSid is unique
    // per message; a second delivery (replay or Twilio's own retry) is a no-op.
    if (messageSid) {
        const { error: dedupError } = await getSupabaseAdmin()
            .from('whatsapp_processed_messages')
            .insert({ message_sid: messageSid });
        if (dedupError) {
            if (dedupError.code === '23505') return relayedFromNorma
                ? NextResponse.json({ duplicate: true })
                : new NextResponse('', { status: 200 });
            console.error('[CoCo WhatsApp] No se pudo registrar MessageSid para deduplicacion', dedupError);
        }
    }

    if (relayedFromNorma && /^norma[.!]?$/i.test(message)) {
        await deleteSession(`wa:${waId}`);
        return respond('Listo, vuelves a conversar con Norma. ¿Qué necesitas?');
    }

    // Rate limit: 15 mensajes/min por número, exigido entre instancias (no solo en memoria local)
    const allowed = await checkDistributedRateLimitBySubject(`wa:${waId}`, 'coco.whatsapp.inbound', { limit: 15, windowMs: 60_000 });
    if (!allowed) {
        return respond('Demasiados mensajes en poco tiempo. Espera 1 minuto. 🙏');
    }

    try {
        const sessionKey = `wa:${waId}`;
        let session = await getSession(sessionKey);
        firstContact = !session || (session.auth_state !== 'verified' && session.auth_state !== 'guest');

        // Un solo perfil con WhatsApp activado tiene este número: es esa persona.
        // WhatsApp ya acredita que escribe desde ese teléfono, así que no se le
        // pregunta el depto. Con dos o más perfiles, el depto desempata.
        let residentProfiles: Record<string, unknown>[] | null = null;
        if (session?.auth_state !== 'verified') {
            residentProfiles = await findResidentProfilesByPhone(waId);
            if (residentProfiles.length === 1) {
                const unitRecord = await residentUnit(residentProfiles[0]);
                session = verifiedSession(residentProfiles[0], unitRecord, getUnitDisplay(unitCandidates(unitRecord, residentProfiles[0])));
                await saveSession(sessionKey, session);
            }
        }

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
                return respond('Tu sesion de CoCo debe verificarse nuevamente. Envia otro mensaje para comenzar.');
            }

            // Este mensaje abre (o renueva) la ventana de 24 horas en la que
            // WhatsApp permite responder con texto libre. Sin registrarlo, cada
            // aviso posterior tendria que salir como plantilla.
            void getSupabaseAdmin()
                .from('profiles')
                .update({ whatsapp_last_inbound_at: new Date().toISOString() })
                .eq('id', currentProfile.id)
                .then(({ error }) => {
                    if (error) console.error('[whatsapp] No se pudo marcar la ventana de servicio', error.message);
                });

            const verifiedContext = {
                user_id: String(currentProfile.id),
                unit_id: typeof currentProfile.unit_id === 'string' ? currentProfile.unit_id : undefined,
                role: String(currentProfile.role || 'resident'),
                community_id: String(currentProfile.community_id),
                name: String(currentProfile.name || currentProfile.full_name || 'vecino/a'),
                channel: 'whatsapp',
                // Por el número compartido, Norma espera la respuesta en segundo plano (90 s);
                // por la vía directa, la respuesta va en el TwiML y Twilio corta a los 15 s.
                syncReply: !relayedFromNorma,
            };
            let understood: Awaited<ReturnType<typeof readWhatsAppAttachments>> | null = null;
            if (inboundMedia.length) {
                try {
                    understood = await readWhatsAppAttachments(inboundMedia);
                } catch (mediaError) {
                    console.error('[CoCo WhatsApp] No se pudo leer el adjunto', mediaError);
                }
            }
            const messageForAgent = [message, understood?.note].filter(Boolean).join('\n\n')
                || (understood?.image || understood?.document ? 'Te envío un archivo.' : '');
            if (!messageForAgent && !understood?.image && !understood?.document) {
                return respond('Recibí el archivo, pero no pude leerlo. Prueba con una foto, un audio corto o un PDF con texto.');
            }
            let agentResponse: Awaited<ReturnType<typeof askCoCo>>;
            try {
                agentResponse = await askCoCo(messageForAgent, session, verifiedContext, {
                    ...(relayedFromNorma ? {} : { maxToolRounds: SYNC_REPLY_MAX_TOOL_ROUNDS }),
                    ...(understood?.image ? { image: understood.image } : {}),
                    ...(understood?.document?.text ? { legalDocument: understood.document } : {}),
                });
            } catch (agentError) {
                if (isAiBudgetExceededError(agentError)) throw agentError;
                const lastContent = session.conversation.at(-1)?.content;
                const hasPendingAction = Array.isArray(lastContent) && lastContent.some(block =>
                    typeof block === 'object' && block !== null && 'type' in block && block.type === 'tool_use',
                );
                // Resolver una acción pendiente puede ejecutar cambios antes de consultar al modelo.
                // Nunca se cambia a otro proveedor a mitad de esa confirmación.
                if (hasPendingAction) throw agentError;
                console.warn('[CoCo WhatsApp] Motor principal no disponible; usando respaldo de solo lectura');
                agentResponse = await askCoCoWhatsAppFallback(messageForAgent, session, verifiedContext);
            }
            const { reply, updatedHistory, pendingActions } = agentResponse;
            await saveDeliveredTurn(sessionKey, { ...session, conversation: updatedHistory, user_context: verifiedContext }, Boolean(pendingActions?.length));
            if (isConversationClosing(message)) {
                void learnFromClosing({ communityId: verifiedContext.community_id, role: verifiedContext.role, lines: linesFromConversation(updatedHistory) }).catch(error => {
                    console.error('[coco] no se pudieron proponer recuerdos', error);
                });
            }
            if (pendingActions?.length) {
                const lines = pendingActions.map(action => `${action.title}: ${action.summary}`);
                return respond(whatsappPendingReply(lines));
            }
            const draftUrl = await maybeDraftMediaUrl(reply, verifiedContext);
            return respond(draftUrl ? `${reply}\n\nTe dejo el PDF del borrador en este mensaje. Caduca en 15 minutos.` : (reply || 'La solicitud fue procesada.'), draftUrl);
        }

        // ── Conversación sin residente verificado ────────────────────────────
        // Maestros, números sin registrar y quien comparte teléfono con otro
        // residente. CoCo conversa; el depto se pide solo si hace falta.
        if (!message) {
            return respond('Recibí tu archivo. Por ahora leo fotos, audios y PDF cuando ya sé quién eres: cuéntame primero en qué te ayudo.');
        }
        const profiles = residentProfiles ?? await findResidentProfilesByPhone(waId);
        const provider = await findProviderByPhone(waId);
        const attempts = session?.auth_attempts ?? 0;
        let verified: SessionData | null = null;
        const verifyResident: ResidentVerifier | null = profiles.length ? async depto => {
            if (attempts >= 3) {
                return { ok: false, message: 'Ya hubo 3 intentos con este número. Debe revisar su depto en la app o hablar con la administración.' };
            }
            for (const profile of profiles) {
                const unitRecord = await residentUnit(profile);
                const candidates = unitCandidates(unitRecord, profile);
                if (unitMatches(depto, candidates)) {
                    verified = verifiedSession(profile, unitRecord, getUnitDisplay(candidates));
                    return { ok: true, name: String(profile.name || profile.full_name || 'vecino/a') };
                }
            }
            await saveSession(sessionKey, { ...(session || { conversation: [], user_context: { channel: 'whatsapp' } }), auth_state: 'guest', auth_attempts: attempts + 1 });
            return { ok: false, message: `Ese depto no coincide con este número (intento ${attempts + 1} de 3). Que lo revise tal como aparece en su app.` };
        } : null;

        const turn = await askCoCoGuest({ message, session: session?.auth_state === 'guest' ? session : null, waId, provider, verifyResident });
        if (turn.verifiedResident && verified) {
            const residentSession: SessionData = verified;
            await saveSession(sessionKey, residentSession);
            return respond(`¡Listo, ${residentSession.user_context.name}! ✅\nYa sé quién eres. ¿En qué te ayudo con tu comunidad?`);
        }
        const latest = await getSession(sessionKey);
        await saveSession(sessionKey, {
            conversation: turn.history,
            user_context: { channel: 'whatsapp', ...(provider ? { name: provider.name, role: 'external_provider' } : {}) },
            auth_state: 'guest',
            auth_attempts: latest?.auth_state === 'guest' ? latest.auth_attempts ?? 0 : 0,
        });
        return respond(turn.reply);

    } catch (err) {
        console.error('[CoCo WhatsApp Error]', err);
        return respond('Ocurrió un error. Intenta de nuevo en unos segundos.');
    }
}
