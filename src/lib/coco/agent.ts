/**
 * agent.ts — CoCo IA Core
 * Loop agéntico usando Anthropic Messages API con tool use.
 * Soporta multi-turn con historial persistido en Supabase.
 */

import Anthropic from '@anthropic-ai/sdk';
import { askOpenAi } from './openai-agent';
import { TOOL_DEFINITIONS, executeTool, MUTATING_TOOLS, describePendingAction, isToolAllowedForRole } from './tools';
import { COCO_SYSTEM_PROMPT } from './system-prompt';
import { loadCoCoMemoryContext } from './memory';
import { interpretCoCoConfirmation } from './confirmation';
import { formatChileNow } from './reminders';
import { chileMonthISO } from '@/lib/agent-center/chileDate';
import { getProactiveContext } from './proactive';
import { COCO_LEGAL_KNOWLEDGE } from './legal-knowledge';
import { buildPlatformContext } from './platformMap';
import type { ConversationMessage, SessionData } from './session-store';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromMessages, estimateTokensFromText, recordAiUsage } from '@/lib/ai/budget';
import { anthropicModelFor } from '@/lib/ai/modelRouter';
import { recordOperationEvent, sanitizeMetadata } from '@/lib/operations/audit';
import type { CoCoPendingAction, CoCoResolutions } from '@/lib/types';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// El modelo lo decide modelRouter.ts, no una variable global: CoCo usa
// herramientas que leen y escriben datos reales, así que no baja de nivel
// aunque otras tareas del sistema sí lo hagan.
const MODEL = anthropicModelFor('coco.chat');
const OPENAI_MODEL = process.env.COCO_OPENAI_MODEL || 'gpt-5.4-mini';
// Rondas de tool use por mensaje. La web y el número compartido de Norma (+56 9 9947 4056,
// que procesa en segundo plano y espera hasta 90 s) aguantan tareas largas. Solo la vía
// directa de Twilio responde con TwiML dentro del webhook, que Twilio corta a los 15 s.
const MAX_TOOL_ROUNDS = 8;
export const SYNC_REPLY_MAX_TOOL_ROUNDS = 5;

export type CoCoImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface CoCoImageAttachment {
    mediaType: CoCoImageMediaType;
    data: string;
}

export interface CoCoResponse {
    reply: string;
    /**
     * La misma respuesta sin credenciales (enlace del portal de un maestro). Quien
     * guarda la respuesta en vez de solo mostrarla (Agent Center) usa esta.
     */
    storedReply?: string;
    navigate?: string;
    action?: string;
    updatedHistory: ConversationMessage[];
    /** Presente solo cuando CoCo propuso una acción que muta datos y espera confirmación. */
    pendingActions?: CoCoPendingAction[];
}


export class CoCoPendingResolutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CoCoPendingResolutionError';
    }
}

type CoCoUserContext = {
    user_id?: string;
    unit_id?: string;
    role?: string;
    community_id?: string;
    name?: string;
    currentPage?: string;
    channel?: string;
    /** La respuesta viaja en el mismo HTTP que el mensaje (TwiML directo, Twilio corta a los 15 s). */
    syncReply?: boolean;
};

function pendingToolUses(session: SessionData | null): Anthropic.ToolUseBlock[] {
    const lastTurn = session?.conversation?.[session.conversation.length - 1];
    if (lastTurn?.role !== 'assistant' || !Array.isArray(lastTurn.content)) return [];
    return (lastTurn.content as Anthropic.ContentBlock[]).filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
}

function pendingActionsFrom(toolUses: Anthropic.ToolUseBlock[]): CoCoPendingAction[] {
    return toolUses
        .filter(toolUse => MUTATING_TOOLS.has(toolUse.name))
        .map(toolUse => {
            const input = toolUse.input as Record<string, unknown>;
            const { title, summary } = describePendingAction(toolUse.name, input);
            return { toolUseId: toolUse.id, name: toolUse.name, input, title, summary };
        });
}

export function restorePendingActions(session: SessionData | null): CoCoPendingAction[] {
    return pendingActionsFrom(pendingToolUses(session));
}

function textualResolution(message: string, toolUses: Anthropic.ToolUseBlock[]): CoCoResolutions | undefined {
    if (!toolUses.some(toolUse => MUTATING_TOOLS.has(toolUse.name))) return undefined;
    const decision = interpretCoCoConfirmation(message);
    if (!decision) return undefined;
    return Object.fromEntries(
        toolUses
            .filter(toolUse => MUTATING_TOOLS.has(toolUse.name))
            .map(toolUse => [toolUse.id, decision]),
    );
}

function resultFailed(result: unknown) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
    const value = result as Record<string, unknown>;
    return typeof value.error === 'string' || value.success === false;
}

function resultDescription(result: unknown, fallback: string) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return fallback;
    const value = result as Record<string, unknown>;
    if (typeof value.message === 'string' && value.message.trim()) return value.message;
    if (typeof value.error === 'string' && value.error.trim()) return value.error;
    return fallback;
}

function resultEntityId(result: unknown) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
    const idEntry = Object.entries(result as Record<string, unknown>)
        .find(([key, value]) => key.endsWith('_id') && typeof value === 'string');
    return idEntry?.[1] as string | undefined || null;
}

/**
 * Un resultado con `credential` (el enlace del portal de un maestro) es una
 * credencial: se entrega una sola vez y la bitácora la guarda tachada. Si se
 * reintenta la misma aprobación, no se puede volver a mostrar ni a ejecutar;
 * se dice eso, y que basta con pedir un enlace nuevo (el anterior se revoca).
 */
export function replayableResult(result: unknown) {
    if (result && typeof result === 'object' && !Array.isArray(result) && 'credential' in result) {
        return {
            success: false,
            error: 'El enlace ya se generó, pero por seguridad no se guarda y no se puede volver a mostrar. Pide a CoCo un enlace nuevo: el anterior deja de funcionar.',
        };
    }
    return result;
}

/** Texto con la credencial de un resultado aprobado: va en la respuesta, nunca al historial. */
export function credentialReply(result: unknown): string {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return '';
    const credential = (result as Record<string, unknown>).credential;
    if (!credential || typeof credential !== 'object' || Array.isArray(credential)) return '';
    const { url, whatsapp_link: whatsapp } = credential as Record<string, unknown>;
    if (typeof url !== 'string') return '';
    return [`Enlace: ${url}`, typeof whatsapp === 'string' ? `[Enviar por WhatsApp](${whatsapp})` : ''].filter(Boolean).join('\n');
}

async function auditRejectedTool(toolUse: Anthropic.ToolUseBlock, userCtx: CoCoUserContext) {
    const result = { error: 'El usuario rechazo esta accion. No se ejecuto.' };
    await recordOperationEvent({
        communityId: userCtx.community_id,
        actorId: userCtx.user_id,
        actorRole: userCtx.role,
        action: `coco.tool.${toolUse.name}`,
        entityType: 'coco_tool_action',
        severity: 'warning',
        status: 'blocked',
        summary: `Accion de CoCo rechazada por el usuario: ${toolUse.name}`,
        metadata: { decision: 'rejected', channel: userCtx.channel, input: toolUse.input, result },
        requestId: toolUse.id,
    });
}

async function executeAuditedTool(toolUse: Anthropic.ToolUseBlock, userCtx: CoCoUserContext, decisionSource: 'user_confirmation' | 'system_automation') {
    const action = `coco.tool.${toolUse.name}`;
    const admin = getSupabaseAdmin();
    const readReceipt = async () => admin
        .from('operation_events')
        .select('status,metadata')
        .eq('community_id', userCtx.community_id)
        .eq('action', action)
        .eq('request_id', toolUse.id)
        .maybeSingle();
    const existing = await readReceipt();
    if (existing.data) {
        const metadata = existing.data.metadata as Record<string, unknown> | null;
        if (metadata?.result !== undefined) return replayableResult(metadata.result);
        return { error: 'Esta accion ya se esta procesando. Espera unos segundos antes de reintentar.' };
    }

    const claim = await recordOperationEvent({
        communityId: userCtx.community_id,
        actorId: userCtx.user_id,
        actorRole: userCtx.role,
        action,
        entityType: 'coco_tool_action',
        severity: 'info',
        status: 'pending',
        summary: `Accion de CoCo en proceso: ${toolUse.name}`,
        metadata: { decision: 'approved', decisionSource, channel: userCtx.channel, input: toolUse.input },
        requestId: toolUse.id,
    });
    if (!claim.ok) {
        const concurrentReceipt = await readReceipt();
        const metadata = concurrentReceipt.data?.metadata as Record<string, unknown> | null;
        if (metadata?.result !== undefined) return replayableResult(metadata.result);
        return { error: concurrentReceipt.data
            ? 'Esta accion ya se esta procesando. Espera unos segundos antes de reintentar.'
            : 'No se pudo asegurar la ejecucion unica de la accion. No se realizaron cambios.' };
    }

    const result = await executeTool(toolUse.name, toolUse.input as Record<string, string>, userCtx);
    const failed = resultFailed(result);
    const { error: receiptError } = await admin
        .from('operation_events')
        .update({
            entity_id: resultEntityId(result),
            severity: failed ? 'error' : 'success',
            status: failed ? 'error' : 'success',
            summary: failed
                ? `Accion de CoCo no ejecutada: ${toolUse.name}`
                : `Accion de CoCo ejecutada: ${toolUse.name}`,
            metadata: sanitizeMetadata({ decision: 'approved', decisionSource, channel: userCtx.channel, input: toolUse.input, result }),
        })
        .eq('community_id', userCtx.community_id)
        .eq('action', action)
        .eq('request_id', toolUse.id);
    if (receiptError) console.error('[CoCo Audit] No se pudo cerrar el recibo de accion:', receiptError.message);
    console.info(JSON.stringify({
        type: 'operation_event_update',
        community_id: userCtx.community_id,
        actor_id: userCtx.user_id || null,
        actor_role: userCtx.role || null,
        action,
        entity_type: 'coco_tool_action',
        entity_id: resultEntityId(result),
        severity: failed ? 'error' : 'success',
        status: failed ? 'error' : 'success',
        request_id: toolUse.id,
    }));
    return result;
}

function buildUserContent(message: string, image?: CoCoImageAttachment): Anthropic.MessageParam['content'] {
    if (!image) return message;

    return [
        { type: 'text', text: message },
        {
            type: 'image',
            source: {
                type: 'base64',
                media_type: image.mediaType,
                data: image.data,
            },
        },
    ];
}

function needsLegalContext(message: string, session: SessionData | null) {
    const recentText = (session?.conversation ?? [])
        .slice(-4)
        .map(turn => typeof turn.content === 'string' ? turn.content : '')
        .join(' ');
    return /\b(ley|legal|art[ií]culo|copropiedad|reglamento|multa|sanci[oó]n|suspender|cortar|c[aá]mara|privacidad|datos? personales?|electrodependiente|registro nacional de administradores|dom|seremi|minvu|lguc|oguc|construcci[oó]n|vivienda|permiso|recepci[oó]n|urbanismo|subdivisi[oó]n|plano|escritura)\b/i
        .test(`${recentText} ${message}`);
}

function requiredMutationTool(message: string, role?: string) {
    const text = message.toLocaleLowerCase('es-CL');
    if (role === 'system') return undefined;
    if (/\b(c[oó]mo|como)\b/.test(text)) return undefined;

    if (/\b(guarda|guardar|gu[aá]rdame|salva|salvar)\b.*\b(lista|compras|supermercado)\b/.test(text)) return 'save_shopping_list';

    if (/\b(recu[eé]rdame|recuerdame|av[ií]same|avisame)\b/.test(text)) return 'create_reminder';
    if (role === 'admin' && /\b(avisa|avisar|notifica|notificar)\b/.test(text) && /\b(cobros pendientes|morosos|d[ií]a\s+\d{1,2})\b/.test(text)) return 'create_reminder';
    if (role === 'admin' && /\b(guarda|anota|recuerda que)\b/.test(text) && /\b(reglamento|proveedor|acuerdo)\b/.test(text)) return 'remember_community_fact';

    if (/\b(cierra|cerrar|prepara|preparar|finaliza|finalizar)\b.*\bcompra\s+(grupal|comunitaria)\b/.test(text)) return 'lock_supermarket_group_order';
    if (/\b(s[uú]mame|sumarme|agrega|agregar|a[nñ]ade|a[nñ]adir)\b.*\bcompra\s+(grupal|comunitaria)\b/.test(text)) return 'join_supermarket_group_order';
    if (/\b(crea|crear|abre|abrir)\b.*\bcompra\s+(grupal|comunitaria)\b/.test(text)) return 'create_supermarket_group_order';
    // Estacionamiento tiene search_parking / book_parking. No forzar create_reservation
    // (quincho/piscina): "reservame un estacionamiento" no es una amenidad.
    // Tampoco forzar book_parking: necesita un spot_id de search_parking primero.
    if (/\b(estacionamiento|parking|aparcamiento)\b/.test(text)) return undefined;
    // "Agenda un gasfiter" es un servicio de un proveedor, no un espacio común: no
    // se fuerza nada, porque request_service necesita antes el provider_id de
    // list_services.
    if (/(gasf[ií]ter|plomer|electricist|cerrajer|pintor|carpinter|t[eé]cnico|maestro|jardiner|proveedor|fumigad|lavado de alfombras)/.test(text)) return undefined;
    if (/\b(reserva|reservar|res[eé]rvame|agenda|agendar)\b/.test(text)) return 'create_reservation';
    if (/\b(registra|registrar|anota|anotar)\b.*\b(visita|visitante)\b|\bva a llegar\b/.test(text)) return 'register_visitor';
    if ((role === 'admin' || role === 'concierge') && /\b(registra|registrar|recib[ií]|lleg[oó])\b.*\b(paquete|encomienda)\b/.test(text)) return 'register_package';
    if ((role === 'admin' || role === 'concierge') && /\b(env[ií]a|mandar|manda)\b.*\bwhatsapp\b/.test(text)) return 'send_whatsapp_notification';
    if (role === 'admin' && /\b(publica|publicar|env[ií]a|mandar|manda)\b.*\b(circular|comunicado oficial)\b/.test(text)) return 'create_circular';
    if (role === 'admin' && /\b(crea|crear)\b.*\b(votaci[oó]n|encuesta)\b/.test(text)) return 'create_poll';
    if (role === 'resident' && /\b(vota|votar|mi voto)\b/.test(text)) return 'vote_in_poll';
    if (/\b(publica|publicar|postea|postear)\b.*\b(muro|social|aviso)\b/.test(text)) return 'create_social_post';
    if (/\b(registra|registrar|crea|crear|reporta|reportar)\b.*\b(reclamo|caso|problema|filtraci[oó]n|ruido|falla)\b/.test(text)) return 'create_claim';
    return undefined;
}

export { requiredMutationTool };

export async function askCoCo(
    message: string,
    session: SessionData | null,
    userCtx: CoCoUserContext,
    options: {
        image?: CoCoImageAttachment;
        legalDocument?: { name: string; text: string; truncated: boolean; pageImages?: CoCoImageAttachment[]; pageCount?: number };
        /** Si viene, esta llamada RESUELVE una tanda de acciones pendientes en vez de mandar un mensaje nuevo. */
        resolutions?: CoCoResolutions;
        /** Tope de rondas de herramientas. Por defecto MAX_TOOL_ROUNDS. */
        maxToolRounds?: number;
    } = {}
): Promise<CoCoResponse> {
    const maxToolRounds = Math.max(1, Math.min(MAX_TOOL_ROUNDS, options.maxToolRounds ?? MAX_TOOL_ROUNDS));
    const persistedToolUses = pendingToolUses(session);
    const persistedActions = pendingActionsFrom(persistedToolUses);
    const effectiveResolutions = options.resolutions || textualResolution(message, persistedToolUses);

    if (persistedActions.length > 0 && !effectiveResolutions) {
        return {
            reply: 'Tienes acciones pendientes. Apruebalas o rechazalas antes de enviar una nueva solicitud.',
            updatedHistory: session?.conversation ?? [],
            pendingActions: persistedActions,
        };
    }

    const isResuming = Boolean(effectiveResolutions);

    // Si estamos resolviendo una confirmación pendiente, esa tanda ya no cuenta
    // como el último turno "limpio" de la conversación persistida: se reemplaza
    // por el resultado real (ejecutado o rechazado) más abajo.
    const baseConversation = isResuming
        ? (session?.conversation ?? []).slice(0, -1)
        : (session?.conversation ?? []);

    // 1. Construir historial de mensajes
    const history: Anthropic.MessageParam[] = (session?.conversation ?? []).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content as Anthropic.MessageParam['content'],
    }));

    // 2. Contexto del usuario en el system prompt
    const contextLine = [
        `Fecha actual en Chile: ${formatChileNow()}`,
        userCtx.name && `Nombre: ${userCtx.name}`,
        userCtx.role && `Rol: ${userCtx.role}`,
        userCtx.unit_id && `Unidad: ${userCtx.unit_id}`,
        userCtx.currentPage && `Página actual: ${userCtx.currentPage}`,
    ].filter(Boolean).join(' | ');

    const legalKnowledge = needsLegalContext(message, session) ? COCO_LEGAL_KNOWLEDGE : '';
    const requiredTool = requiredMutationTool(message, userCtx.role);
    // Memoria entre sesiones: hechos durables que CoCo recuerda de esta persona.
    const memoryContext = isResuming ? '' : await loadCoCoMemoryContext({
        userId: userCtx.user_id,
        communityId: userCtx.community_id,
        role: userCtx.role,
        message,
    });
    // Proactividad: estado actual relevante (deuda, morosidad). Solo en el primer
    // turno de la conversación, para no consultar la base en cada mensaje.
    const isFirstTurn = !(session?.conversation && session.conversation.length > 0);
    const proactiveContext = isFirstTurn && !isResuming ? await getProactiveContext(userCtx) : '';
    let communityContext = '';
    if (userCtx.community_id && userCtx.role === 'admin') {
        const { count, error } = await getSupabaseAdmin()
            .from('units')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', userCtx.community_id);
        if (!error && count !== null) {
            communityContext = `Datos actuales de esta comunidad: ${count} unidades registradas. Si preguntan cuántos sitios, casas o unidades hay, usa esta cifra y aclara que corresponde a las unidades registradas en Convive.`;
        }
    }
    // Todo lo que varía por request (ley, memoria, proactivo, contexto del usuario)
    // va DESPUÉS del prefijo cacheado; si se colara antes invalidaría la cache.
    // Mapa de la plataforma: solo la pantalla actual (el resto, vía get_platform_guide).
    // WhatsApp no tiene pantalla actual, pero igual recibe la regla de uso.
    const platformContext = buildPlatformContext(userCtx.currentPage, userCtx.role);
    const volatileSystem = [
        legalKnowledge,
        memoryContext,
        proactiveContext,
        communityContext,
        platformContext,
        contextLine ? `**Contexto del usuario:** ${contextLine}` : '',
    ].filter(Boolean);

    // Solo para estimar el presupuesto antes de la llamada.
    const systemPrompt = [COCO_SYSTEM_PROMPT, ...volatileSystem].join('\n\n');

    // Prompt caching: COCO_SYSTEM_PROMPT es idéntico byte a byte en toda la app y
    // el orden de render es tools -> system -> messages, así que el breakpoint en
    // este primer bloque cachea las TOOL_DEFINITIONS y el prompt maestro juntos.
    const systemBlocks: Anthropic.TextBlockParam[] = [
        { type: 'text', text: COCO_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ...volatileSystem.map(text => ({ type: 'text' as const, text })),
    ];

    if (isResuming) {
        // 3a. Resolver la tanda de tool_use pendiente (el último turno del historial).
        const pausedTurn = history[history.length - 1];
        const pendingToolUses = Array.isArray(pausedTurn?.content)
            ? (pausedTurn.content as Anthropic.ContentBlock[]).filter(
                (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
            )
            : [];
        const mutatingPendingToolUses = pendingToolUses.filter(toolUse => MUTATING_TOOLS.has(toolUse.name));
        const expectedResolutionIds = new Set(mutatingPendingToolUses.map(toolUse => toolUse.id));
        const providedResolutionIds = Object.keys(effectiveResolutions || {});

        if (mutatingPendingToolUses.length === 0) {
            throw new CoCoPendingResolutionError('No hay una accion pendiente de confirmacion en esta conversacion.');
        }
        if (
            providedResolutionIds.length !== expectedResolutionIds.size
            || providedResolutionIds.some(id => !expectedResolutionIds.has(id))
        ) {
            throw new CoCoPendingResolutionError('Debes aprobar o rechazar explicitamente cada accion pendiente.');
        }

        const resolvedResults = await Promise.all(
            pendingToolUses.map(async (tu) => {
                const resolution = effectiveResolutions?.[tu.id];
                if (MUTATING_TOOLS.has(tu.name) && resolution !== 'approved') {
                    await auditRejectedTool(tu, userCtx);
                    return {
                        toolUse: tu,
                        resolution: 'rejected' as const,
                        result: { error: 'El usuario rechazo esta accion. No se ejecuto.' },
                    };
                }
                const result = MUTATING_TOOLS.has(tu.name)
                    ? await executeAuditedTool(tu, userCtx, 'user_confirmation')
                    : await executeTool(tu.name, tu.input as Record<string, string>, userCtx);
                return {
                    toolUse: tu,
                    resolution: 'approved' as const,
                    result,
                };
            })
        );

        const toolResults: Anthropic.ToolResultBlockParam[] = resolvedResults.map(resolved => ({
            type: 'tool_result',
            tool_use_id: resolved.toolUse.id,
            content: JSON.stringify(resolved.result),
        }));
        history.push({ role: 'user', content: toolResults });

        const summaries = resolvedResults
            .filter(resolved => MUTATING_TOOLS.has(resolved.toolUse.name))
            .map(resolved => {
                const { title } = describePendingAction(
                    resolved.toolUse.name,
                    resolved.toolUse.input as Record<string, unknown>,
                );
                if (resolved.resolution === 'rejected') return `${title}: rechazada. No se realizaron cambios.`;
                return resultFailed(resolved.result)
                    ? `${title}: no se pudo completar. ${resultDescription(resolved.result, 'La operacion fallo.')}`
                    : `${title}: completada. ${resultDescription(resolved.result, 'La operacion se ejecuto correctamente.')}`;
            });
        // Las credenciales (enlace del portal de un maestro) se muestran en esta
        // respuesta y no quedan en el historial guardado de la conversación.
        const credentials = resolvedResults
            .filter(resolved => resolved.resolution === 'approved' && !resultFailed(resolved.result))
            .map(resolved => credentialReply(resolved.result))
            .filter(Boolean);
        const summary = summaries.join('\n');
        const reply = credentials.length ? `${summary}\n\n${credentials.join('\n\n')}` : summary;
        const storedReply = credentials.length
            ? `${summary}\n\n(El enlace se muestra una sola vez en el chat y no queda guardado. Si se pierde, pide uno nuevo.)`
            : summary;
        const updatedHistory: ConversationMessage[] = [
            ...baseConversation,
            { role: 'assistant', content: storedReply },
        ];
        return { reply, storedReply, updatedHistory };
    } else {
        // 3b. Agregar mensaje del usuario al historial
        const documentText = options.legalDocument
            ? `\n\nDocumento aportado: ${options.legalDocument.name}. ${options.legalDocument.truncated ? 'Extracto parcial; no es el documento completo.' : 'Texto extraído.'} ${options.legalDocument.pageCount ? `Páginas del PDF: ${options.legalDocument.pageCount}.` : ''} Las páginas visuales son solo una muestra; no certifiques deslindes, superficies, firmas ni vigencia sin cotejo oficial.\n<documento>\n${options.legalDocument.text}\n</documento>`
            : '';
        const content = buildUserContent(`${message}${documentText}`, options.image);
        const pages = options.legalDocument?.pageImages || [];
        history.push({ role: 'user', content: pages.length ? [
            ...(typeof content === 'string' ? [{ type: 'text' as const, text: content }] : content),
            ...pages.map((page, index) => ({ type: 'text' as const, text: `Página visual ${index + 1} del documento aportado:` })),
            ...pages.map(page => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: page.mediaType, data: page.data } })),
        ] : content });
    }

    // 4. Loop agéntico
    let rounds = 0;
    let response: {
        content: Anthropic.ContentBlock[];
        stop_reason: Anthropic.Message['stop_reason'];
        usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
    };
    let useOpenAi = Boolean(process.env.OPENAI_API_KEY);

    do {
        let provider = useOpenAi ? 'openai' : 'anthropic';
        let model = useOpenAi ? OPENAI_MODEL : MODEL;
        const estimatedPromptTokens = estimateTokensFromText(systemPrompt) + estimateTokensFromMessages(history);
        const estimatedCompletionTokens = 2048;

        await enforceAiBudget({
            communityId: userCtx.community_id,
            userId: userCtx.user_id,
            role: userCtx.role,
            module: 'coco.chat',
            provider,
            model,
            actionType: 'chat',
            estimatedPromptTokens,
            estimatedCompletionTokens,
        });

        const startedAt = Date.now();
        try {
        response = useOpenAi ? await askOpenAi({
            apiKey: process.env.OPENAI_API_KEY!,
            model,
            systemPrompt,
            history,
            tools: TOOL_DEFINITIONS.filter(tool => isToolAllowedForRole(tool.name, userCtx.role)) as { name: string; description: string; input_schema: Record<string, unknown> }[],
            requiredTool: rounds === 0 ? requiredTool : undefined,
        }) : await anthropic.messages.create({
            model: MODEL,
            max_tokens: 2048,
            system: systemBlocks,
            messages: history,
            tools: TOOL_DEFINITIONS
                .filter(tool => isToolAllowedForRole(tool.name, userCtx.role)) as unknown as Anthropic.Tool[],
            ...(requiredTool && rounds === 0 ? { tool_choice: { type: 'tool' as const, name: requiredTool } } : {}),
        });
        } catch (error) {
            const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
            if (useOpenAi && status === 401 && process.env.ANTHROPIC_API_KEY) {
                console.warn('[CoCo] OpenAI rechazó su clave; se continúa con Anthropic en esta conversación.');
                useOpenAi = false;
                provider = 'anthropic';
                model = MODEL;
                await enforceAiBudget({
                    communityId: userCtx.community_id, userId: userCtx.user_id, role: userCtx.role,
                    module: 'coco.chat', provider, model, actionType: 'chat',
                    estimatedPromptTokens, estimatedCompletionTokens,
                });
                response = await anthropic.messages.create({
                    model: MODEL, max_tokens: 2048, system: systemBlocks, messages: history,
                    tools: TOOL_DEFINITIONS.filter(tool => isToolAllowedForRole(tool.name, userCtx.role)) as unknown as Anthropic.Tool[],
                    ...(requiredTool && rounds === 0 ? { tool_choice: { type: 'tool' as const, name: requiredTool } } : {}),
                });
            } else {
                throw error;
            }
        }

        const usage = response.usage;
        // input_tokens es SOLO el remanente no cacheado. El input real es la suma de
        // los tres campos; sin sumarlos, el control de presupuesto subcontaría casi
        // todo el prefijo apenas la cache empieza a acertar.
        const cacheWriteTokens = usage?.cache_creation_input_tokens ?? 0;
        const cacheReadTokens = usage?.cache_read_input_tokens ?? 0;
        const promptTokens = usage
            ? usage.input_tokens + cacheWriteTokens + cacheReadTokens
            : estimatedPromptTokens;
        const completionTokens = usage?.output_tokens ?? estimateTokensFromMessages(response.content);
        await recordAiUsage({
            communityId: userCtx.community_id,
            userId: userCtx.user_id,
            role: userCtx.role,
            module: 'coco.chat',
            provider,
            model,
            actionType: 'chat',
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            estimatedCostCents: estimateAiCostCents({
                provider,
                model,
                promptTokens,
                completionTokens,
            }),
            status: 'success',
            metadata: {
                latencyMs: Date.now() - startedAt,
                stopReason: response.stop_reason,
                toolRounds: rounds,
            },
        });

        // Si Claude quiere usar herramientas
        if (response.stop_reason === 'tool_use') {
            const toolUses = response.content.filter(
                (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
            );
            if (/\b(este mes|mes actual)\b/i.test(message)) {
                const currentMonth = chileMonthISO();
                for (const toolUse of toolUses) {
                    if (['get_payment_status', 'get_water_consumption', 'get_defaulters_list'].includes(toolUse.name)) {
                        toolUse.input = { ...(toolUse.input as Record<string, unknown>), month: currentMonth };
                    }
                }
            }
            const mutatingUses = toolUses.filter(tu => MUTATING_TOOLS.has(tu.name));

            if (mutatingUses.length > 0 && userCtx.role !== 'system') {
                // Alguna herramienta muta datos reales: pausamos TODA la tanda (aunque
                // venga mezclada con lecturas) y esperamos confirmación explícita del
                // usuario antes de ejecutar nada. Se persiste el turno tal cual (con los
                // tool_use crudos) para poder resolverlo despues en una llamada RESUME.
                const pendingActions = pendingActionsFrom(toolUses);

                const updatedHistory: ConversationMessage[] = [
                    ...history.map(historyMessage => ({
                        role: historyMessage.role,
                        content: historyMessage.content as string | object[],
                    })),
                    { role: 'assistant', content: response.content as unknown as object[] },
                ];

                return { reply: '', updatedHistory, pendingActions };
            }

            // Agregar respuesta de asistente con los tool_use blocks al historial
            history.push({ role: 'assistant', content: response.content });

            // Ninguna herramienta de esta tanda muta datos: se ejecutan de inmediato.
            const toolResults = await Promise.all(
                toolUses.map(async (tu) => {
                    const result = MUTATING_TOOLS.has(tu.name)
                        ? await executeAuditedTool(tu, userCtx, 'system_automation')
                        : await executeTool(tu.name, tu.input as Record<string, string>, userCtx);
                    return {
                        type: 'tool_result' as const,
                        tool_use_id: tu.id,
                        content: JSON.stringify(result),
                    };
                })
            );

            // Agregar resultados al historial para la siguiente ronda
            history.push({ role: 'user', content: toolResults });
        }

        rounds++;
    } while (response.stop_reason === 'tool_use' && rounds < maxToolRounds);

    // Se agotaron las rondas de herramientas sin que el modelo produjera una
    // respuesta final: mejor un mensaje honesto que un reply vacio y silencioso.
    if (response.stop_reason === 'tool_use' && rounds >= maxToolRounds) {
        return {
            reply: 'Estoy procesando varias consultas para responderte bien y me tome mas tiempo del esperado. Intenta reformular tu pregunta de forma mas especifica.',
            updatedHistory: history.map(historyMessage => ({
                role: historyMessage.role,
                content: historyMessage.content as string | object[],
            })),
        };
    }

    // 5. Extraer texto final
    const rawText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

    // 6. Extraer comando de navegación y acción (UI)
    const navMatch = rawText.match(/NAVEGAR:(\/[a-zA-Z0-9/_-]+)/);
    const navigate = navMatch?.[1];
    
    const actMatch = rawText.match(/CMD:([A-Z_]+)/);
    let action = actMatch?.[1];
    // LOGOUT ends the user's session — never trust it from model output alone
    // (a prompt-injection payload in tool-result content could otherwise force
    // it). Only honor it if the user's own message plausibly asked for it.
    if (action === 'LOGOUT' && !/cerrar sesi[oó]n|cierra mi sesi[oó]n|me voy|logout|salir de (la cuenta|mi cuenta)/i.test(message)) {
        action = undefined;
    }

    let reply = rawText
        .replace(/NAVEGAR:\/[a-zA-Z0-9/_-]+/g, '')
        .replace(/CMD:[A-Z_]+/g, '')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, 'identificador interno protegido')
        .trim();

    if (requiredTool) {
        reply = 'No pude preparar la accion solicitada con datos verificables. No se realizaron cambios; intenta nuevamente.';
    }

    // 7. Actualizar historial con la respuesta final del asistente
    const finalAssistantMessage: ConversationMessage = {
        role: 'assistant',
        content: reply, // Solo guardar la respuesta limpia en historial
    };

    const updatedHistory: ConversationMessage[] = [
        ...baseConversation,
        ...(isResuming ? [] : [{ role: 'user' as const, content: message }]),
        finalAssistantMessage,
    ];

    return { reply, navigate, action, updatedHistory };
}
