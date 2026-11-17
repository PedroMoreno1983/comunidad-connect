import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { enforceAiBudget, estimateTokensFromText, recordAiUsage } from '@/lib/ai/budget';
import { anthropicModelFor } from '@/lib/ai/modelRouter';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordOperationEvent, recordPlatformOperationEvent } from '@/lib/operations/audit';
import { providerProfileUpdate } from '@/lib/services/providerProfile';
import { createProviderInvite, isInternalProvider } from '@/lib/services/providerPortal';
import { formatWhatsAppPhone } from '@/lib/whatsapp';
import type { ConversationMessage, SessionData } from '@/lib/coco/session-store';

/**
 * CoCo por WhatsApp para quien todavía no es un residente verificado.
 *
 * Antes, cualquier número que no tuviera sesión recibía la misma pregunta:
 * "¿cuál es tu depto?". Un maestro que respondía al aviso para completar su
 * perfil quedaba atrapado ahí. Ahora CoCo conversa: reconoce al maestro por su
 * teléfono y lo ayuda con su perfil, y a un número desconocido le responde lo
 * que pregunte. Si la persona dice ser residente, recién ahí le pide el depto.
 *
 * No toca datos de ninguna comunidad: sus herramientas son el perfil del
 * propio maestro y la verificación de residente.
 */

type Row = Record<string, unknown>;

const MAX_ROUNDS = 4;
const HISTORY_TURNS = 10;
const MODULE = 'coco.whatsapp.guest';

const TRADE_LABEL: Record<string, string> = {
    plumbing: 'gasfitería', electrical: 'electricidad', locksmith: 'cerrajería', cleaning: 'aseo', general: 'mantención general',
};

export function phoneDigits(value: unknown) {
    return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export function canonicalChileanPhone(value: unknown) {
    const digits = phoneDigits(value);
    if (/^56\d{9}$/.test(digits)) return digits;
    if (/^9\d{8}$/.test(digits)) return `56${digits}`;
    return '';
}

export function phoneMatches(savedPhone: unknown, waId: string) {
    const saved = canonicalChileanPhone(savedPhone);
    const incoming = canonicalChileanPhone(formatWhatsAppPhone(waId));
    return Boolean(saved && incoming && saved === incoming);
}

/** Los últimos 8 dígitos: sirven para filtrar en la base sin depender del formato guardado. */
function phoneTail(waId: string) {
    return phoneDigits(waId).slice(-8);
}

export interface WhatsAppProvider {
    id: string;
    name: string;
    category: string;
    communityId: string | null;
}

/** El maestro externo (sin cuenta) cuyo teléfono es este número, si existe. */
export async function findProviderByPhone(waId: string): Promise<WhatsAppProvider | null> {
    const tail = phoneTail(waId);
    if (tail.length < 8) return null;
    const { data } = await getSupabaseAdmin()
        .from('service_providers')
        .select('id, name, category, community_id, contact_phone, user_id')
        .ilike('contact_phone', `%${tail.slice(0, 4)}%${tail.slice(4)}%`)
        .is('user_id', null)
        .limit(10);
    const match = (data || []).find(row => phoneMatches(row.contact_phone, waId) && !isInternalProvider(row));
    if (!match) return null;
    return {
        id: String(match.id),
        name: String(match.name || '').trim(),
        category: String(match.category || 'general'),
        communityId: match.community_id ? String(match.community_id) : null,
    };
}

/** Perfiles con WhatsApp activado cuyo teléfono es este número. */
export async function findResidentProfilesByPhone(waId: string): Promise<Row[]> {
    const tail = phoneTail(waId);
    if (tail.length < 8) return [];
    const { data } = await getSupabaseAdmin()
        .from('profiles')
        .select('id, name, full_name, role, unit_id, community_id, phone_number, whatsapp_enabled, department_number')
        .eq('whatsapp_enabled', true)
        .ilike('phone_number', `%${tail.slice(0, 4)}%${tail.slice(4)}%`)
        .limit(10);
    return (data || []).filter(row => phoneMatches(row.phone_number, waId));
}

const PROFILE_FIELDS: Array<{ key: string; label: string; filled: (row: Row) => boolean }> = [
    { key: 'photo', label: 'foto', filled: row => Boolean(row.photo) },
    { key: 'bio', label: 'descripción de tu trabajo', filled: row => String(row.bio || '').trim().length >= 20 },
    { key: 'years_experience', label: 'años de experiencia', filled: row => Number(row.years_experience || 0) > 0 },
    { key: 'specialties', label: 'especialidades', filled: row => Array.isArray(row.specialties) && row.specialties.length > 0 },
    { key: 'service_address', label: 'zona donde trabajas', filled: row => Boolean(row.service_address) },
    { key: 'hourly_rate', label: 'tarifa referencial', filled: row => row.hourly_rate !== null && row.hourly_rate !== undefined },
];

/** Qué tiene y qué le falta al perfil: lo mismo que ve el maestro en su link. */
export function profileStatus(row: Row) {
    return {
        completos: PROFILE_FIELDS.filter(field => field.filled(row)).map(field => field.label),
        faltan: PROFILE_FIELDS.filter(field => !field.filled(row)).map(field => field.label),
    };
}

export type ResidentVerifier = (depto: string) => Promise<{ ok: true; name: string } | { ok: false; message: string }>;

interface GuestTurnInput {
    message: string;
    session: SessionData | null;
    waId: string;
    provider: WhatsAppProvider | null;
    /** Solo si hay un perfil con WhatsApp activo para este número. */
    verifyResident: ResidentVerifier | null;
}

export interface GuestTurnResult {
    reply: string;
    history: ConversationMessage[];
    /** El residente quedó verificado en este turno: la ruta guarda su sesión. */
    verifiedResident: boolean;
}

const TOOLS: Record<string, Anthropic.Tool> = {
    ver_mi_perfil: {
        name: 'ver_mi_perfil',
        description: 'Muestra qué datos del perfil del maestro que escribe están completos y cuáles faltan.',
        input_schema: { type: 'object', properties: {} },
    },
    actualizar_mi_perfil: {
        name: 'actualizar_mi_perfil',
        description: 'Guarda en el perfil del maestro que escribe los datos que él mismo dio en la conversación. Solo los campos que dijo; no inventes ninguno. La foto no se sube por aquí: va por su link.',
        input_schema: {
            type: 'object',
            properties: {
                bio: { type: 'string', description: 'Descripción de su trabajo, en sus palabras.' },
                yearsExperience: { type: 'number', description: 'Años de experiencia.' },
                specialties: { type: 'array', items: { type: 'string' }, description: 'Especialidades, por ejemplo "instalaciones eléctricas".' },
                serviceAddress: { type: 'string', description: 'Comunas o zona donde trabaja.' },
                hourlyRate: { type: 'number', description: 'Tarifa referencial en pesos.' },
                email: { type: 'string', description: 'Correo de contacto.' },
            },
        },
    },
    enviar_link_perfil: {
        name: 'enviar_link_perfil',
        description: 'Crea el link personal del maestro para ver y editar su perfil (y subir su foto). Anula el link anterior. Úsalo cuando lo pida o lo necesite.',
        input_schema: { type: 'object', properties: {} },
    },
    verificar_residente: {
        name: 'verificar_residente',
        description: 'Verifica a un residente con el número o nombre de su depto. Úsalo solo cuando la persona diga que vive en una comunidad con Convive y te dé su depto.',
        input_schema: {
            type: 'object',
            properties: { depto: { type: 'string', description: 'Depto tal como lo escribió: 8B, 101, Casa 3.' } },
            required: ['depto'],
        },
    },
};

/**
 * Lo que Convive hace hoy, para que CoCo no lo adorne. En la primera prueba en
 * producción ofreció "pagar expensas": la palabra es argentina y el pago en
 * línea todavía espera la habilitación de Haulmer.
 */
export const CONVIVE_HOY = [
    'Qué ofrece Convive hoy (no nombres nada que no esté aquí):',
    '- Gastos comunes: la administración los emite y cada vecino ve su estado de cuenta. El pago en línea todavía no está disponible; los pagos los registra la administración.',
    '- Avisos y circulares de la administración, votaciones y asambleas.',
    '- Reservas de espacios comunes, como quinchos o salas.',
    '- Maestros recomendados (gasfíter, electricista, cerrajero) y solicitudes de mantención.',
    '- Compraventa entre vecinos y arriendo de estacionamientos y bodegas.',
    '- CoCo, que ayuda con todo eso conversando.',
    'En Chile se dice *gastos comunes*, nunca "expensas".',
].join('\n');

function systemPrompt(provider: WhatsAppProvider | null, canVerify: boolean) {
    const base = [
        'Eres CoCo, la asistente de Convive Connect (conviveconnect.com), la plataforma para administrar comunidades y condominios en Chile.',
        'Conversas por WhatsApp: respuestas cortas, tuteando, en español de Chile. Usa *negrita* de WhatsApp, sin títulos ni tablas.',
        'Este número es compartido con Norma, la asistente legal de DataWise: si la persona busca a Norma, dile que escriba *norma*.',
        'No tienes datos de ninguna comunidad ni de sus residentes, y no los inventes. No pidas contraseñas ni datos bancarios.',
        CONVIVE_HOY,
    ];
    if (provider) {
        base.push(
            `Te escribe ${provider.name}, maestro de ${TRADE_LABEL[provider.category] || 'mantención'} en la ${provider.communityId ? 'red de maestros de su comunidad' : 'Red Convive de maestros'}. Lo reconociste por su teléfono.`,
            'Lo más probable es que responda al mensaje en que le pedimos completar su perfil, para que los vecinos lo encuentren y lo contacten.',
            'Ayúdalo de verdad: mira qué le falta (ver_mi_perfil), ofrécele completarlo aquí mismo por chat y guarda lo que te diga (actualizar_mi_perfil), y mándale su link si lo pide o para la foto (enviar_link_perfil).',
            'Pregunta de a un dato o dos por mensaje. Si responde algo que no tiene que ver, contéstale con naturalidad.',
            'Registrarse en Convive es gratis para el maestro. No prometas trabajos, clientes ni montos.',
        );
    } else {
        base.push(
            'No sabes quién escribe: su número no está registrado en Convive. Respóndele lo que pregunte sobre Convive.',
            canVerify
                ? 'Si dice que vive en una comunidad que usa Convive y quiere hacer algo de su comunidad, pídele el número de su depto y usa verificar_residente.'
                : 'Si dice que vive en una comunidad que usa Convive, explícale que en la app (conviveconnect.com) debe registrar este número de WhatsApp en su perfil y activar WhatsApp; después podrá hablar contigo aquí.',
            'Si es administrador o quiere Convive para su edificio, invítalo a conocerlo en conviveconnect.com.',
        );
    }
    return base.join('\n');
}

function plainHistory(session: SessionData | null): Anthropic.MessageParam[] {
    const turns = (session?.conversation || [])
        .filter(turn => typeof turn.content === 'string' && turn.content.trim())
        .slice(-HISTORY_TURNS)
        .map(turn => ({ role: turn.role, content: turn.content as string }));
    // La API exige empezar por el usuario.
    while (turns.length && turns[0].role !== 'user') turns.shift();
    return turns;
}

async function runTool(
    name: string,
    input: Record<string, unknown>,
    ctx: GuestTurnInput,
    state: { verified: boolean },
): Promise<Record<string, unknown>> {
    const admin = getSupabaseAdmin();
    const provider = ctx.provider;
    if (name === 'verificar_residente') {
        if (!ctx.verifyResident) return { ok: false, mensaje: 'Este número no está registrado en ninguna comunidad con WhatsApp activado.' };
        const result = await ctx.verifyResident(String(input.depto || ''));
        if (result.ok) state.verified = true;
        return result.ok ? { ok: true, nombre: result.name } : { ok: false, mensaje: result.message };
    }
    if (!provider) return { error: 'Esta herramienta es solo para maestros registrados.' };

    if (name === 'ver_mi_perfil') {
        const { data } = await admin.from('service_providers')
            .select('name, category, bio, photo, years_experience, specialties, service_address, hourly_rate, email')
            .eq('id', provider.id).maybeSingle();
        if (!data) return { error: 'No encontré el perfil.' };
        return { nombre: data.name, oficio: TRADE_LABEL[String(data.category)] || data.category, ...profileStatus(data) };
    }
    if (name === 'enviar_link_perfil') {
        const invite = await createProviderInvite(provider.communityId, null, provider.id);
        const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://conviveconnect.com').replace(/\/$/, '');
        return { link: `${base}/proveedor/${invite.token}`, vence: invite.expiresAt.slice(0, 10), nota: 'Es personal: no lo compartas. El link anterior dejó de funcionar.' };
    }
    if (name === 'actualizar_mi_perfil') {
        const result = providerProfileUpdate(input);
        if ('error' in result) return { error: result.error };
        if (!Object.keys(result.update).length) return { error: 'No hay datos para guardar.' };
        // El maestro tiene que seguir en el alcance con que se le reconoció.
        const update = admin.from('service_providers').update(result.update).eq('id', provider.id);
        const { error } = provider.communityId ? await update.eq('community_id', provider.communityId) : await update.is('community_id', null);
        if (error) return { error: 'No se pudo guardar el perfil.' };
        const fields = Object.keys(result.update);
        if (provider.communityId) {
            await recordOperationEvent({
                communityId: provider.communityId, actorRole: 'external_provider', action: 'service_provider.profile_updated',
                entityType: 'service_provider', entityId: provider.id, severity: 'success', status: 'success',
                summary: 'El maestro actualizó su perfil conversando con CoCo por WhatsApp', metadata: { fields, channel: 'whatsapp' },
            });
        } else {
            await recordPlatformOperationEvent({
                action: 'provider_network.profile_updated', entityType: 'service_provider', entityId: provider.id,
                summary: 'El maestro de la Red Convive actualizó su perfil conversando con CoCo por WhatsApp',
                metadata: { fields, actor: 'external_provider', channel: 'whatsapp' },
            });
        }
        return { ok: true, guardado: fields };
    }
    return { error: `Herramienta desconocida: ${name}` };
}

/** Un turno de conversación con quien no es residente verificado. */
export async function askCoCoGuest(input: GuestTurnInput): Promise<GuestTurnResult> {
    const model = anthropicModelFor('coco.whatsapp.guest');
    const tools = input.provider
        ? [TOOLS.ver_mi_perfil, TOOLS.actualizar_mi_perfil, TOOLS.enviar_link_perfil]
        : input.verifyResident ? [TOOLS.verificar_residente] : [];
    const system = systemPrompt(input.provider, Boolean(input.verifyResident));
    const messages: Anthropic.MessageParam[] = [...plainHistory(input.session), { role: 'user', content: input.message }];
    const budget = { communityId: input.provider?.communityId ?? null, role: input.provider ? 'external_provider' : 'whatsapp_guest', module: MODULE, provider: 'anthropic', model, actionType: 'chat' as const };

    await enforceAiBudget({ ...budget, estimatedPromptTokens: estimateTokensFromText(system) + estimateTokensFromText(JSON.stringify(messages)), estimatedCompletionTokens: 600 });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 });
    const state = { verified: false };
    let reply = '';
    let promptTokens = 0;
    let completionTokens = 0;
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const response = await client.messages.create({ model, max_tokens: 700, system, messages, ...(tools.length ? { tools } : {}) });
        promptTokens += response.usage.input_tokens;
        completionTokens += response.usage.output_tokens;
        const text = response.content.filter((block): block is Anthropic.TextBlock => block.type === 'text').map(block => block.text).join('\n').trim();
        const calls = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
        if (response.stop_reason !== 'tool_use' || !calls.length) {
            reply = text;
            break;
        }
        messages.push({ role: 'assistant', content: response.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const call of calls) {
            let output: Record<string, unknown>;
            try {
                output = await runTool(call.name, (call.input || {}) as Record<string, unknown>, input, state);
            } catch (error) {
                console.error(`[CoCo WhatsApp invitado] ${call.name} falló`, error);
                output = { error: 'No se pudo completar ahora.' };
            }
            results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(output) });
        }
        messages.push({ role: 'user', content: results });
        if (state.verified) break;
    }

    await recordAiUsage({ ...budget, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens }).catch(() => undefined);

    if (state.verified) {
        return { reply: '', history: [], verifiedResident: true };
    }
    if (!reply) reply = 'Perdón, no alcancé a responder. ¿Me lo repites?';
    const newTurns: ConversationMessage[] = [
        { role: 'user', content: input.message },
        { role: 'assistant', content: reply },
    ];
    const history = [
        ...(input.session?.conversation || []).filter(turn => typeof turn.content === 'string'),
        ...newTurns,
    ].slice(-HISTORY_TURNS * 2);
    return { reply, history, verifiedResident: false };
}
