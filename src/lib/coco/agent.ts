/**
 * agent.ts — CoCo IA Core
 * Loop agéntico usando Anthropic Messages API con tool use.
 * Soporta multi-turn con historial persistido en Supabase.
 */

import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, executeTool, MUTATING_TOOLS, describePendingAction, isToolAllowedForRole } from './tools';
import { COCO_SYSTEM_PROMPT } from './system-prompt';
import { COCO_LEGAL_KNOWLEDGE } from './legal-knowledge';
import type { ConversationMessage, SessionData } from './session-store';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromMessages, estimateTokensFromText, recordAiUsage } from '@/lib/ai/budget';
import { recordOperationEvent, sanitizeMetadata } from '@/lib/operations/audit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const MAX_TOOL_ROUNDS = 5; // Máximo de rondas de tool use por mensaje

export type CoCoImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface CoCoImageAttachment {
    mediaType: CoCoImageMediaType;
    data: string;
}

export interface CoCoPendingAction {
    toolUseId: string;
    name: string;
    input: Record<string, unknown>;
    title: string;
    summary: string;
}

export interface CoCoResponse {
    reply: string;
    navigate?: string;
    action?: string;
    updatedHistory: ConversationMessage[];
    /** Presente solo cuando CoCo propuso una acción que muta datos y espera confirmación. */
    pendingActions?: CoCoPendingAction[];
}

/** Resoluciones del usuario a una tanda de acciones pendientes, indexadas por tool_use_id. */
export type CoCoResolutions = Record<string, 'approved' | 'rejected'>;

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

function textualResolution(message: string, toolUses: Anthropic.ToolUseBlock[]): CoCoResolutions | undefined {
    if (!toolUses.some(toolUse => MUTATING_TOOLS.has(toolUse.name))) return undefined;
    const normalized = message.trim().toLocaleLowerCase('es-CL').replace(/[.!]+$/g, '');
    const decision = ['aprobar', 'apruebo', 'confirmar', 'confirmo', 'si, apruebo', 'si, confirmo', 'sí, apruebo', 'sí, confirmo'].includes(normalized)
        ? 'approved'
        : ['rechazar', 'rechazo', 'cancelar', 'cancelo', 'no, rechazar', 'no, cancelo'].includes(normalized)
            ? 'rejected'
            : undefined;
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
        if (metadata?.result !== undefined) return metadata.result;
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
        if (metadata?.result !== undefined) return metadata.result;
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
    return /\b(ley|legal|art[ií]culo|copropiedad|reglamento|multa|sanci[oó]n|suspender|cortar|c[aá]mara|privacidad|datos? personales?|electrodependiente|registro nacional de administradores)\b/i
        .test(`${recentText} ${message}`);
}

function requiredMutationTool(message: string, role?: string) {
    const text = message.toLocaleLowerCase('es-CL');
    if (role === 'system') return undefined;
    if (/\b(c[oó]mo|como)\b/.test(text)) return undefined;

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

export async function askCoCo(
    message: string,
    session: SessionData | null,
    userCtx: CoCoUserContext,
    options: {
        image?: CoCoImageAttachment;
        /** Si viene, esta llamada RESUELVE una tanda de acciones pendientes en vez de mandar un mensaje nuevo. */
        resolutions?: CoCoResolutions;
    } = {}
): Promise<CoCoResponse> {
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
        userCtx.name && `Nombre: ${userCtx.name}`,
        userCtx.role && `Rol: ${userCtx.role}`,
        userCtx.unit_id && `Unidad: ${userCtx.unit_id}`,
        userCtx.currentPage && `Página actual: ${userCtx.currentPage}`,
    ].filter(Boolean).join(' | ');

    const legalKnowledge = needsLegalContext(message, session) ? COCO_LEGAL_KNOWLEDGE : '';
    const requiredTool = requiredMutationTool(message, userCtx.role);
    const systemPrompt = [
        COCO_SYSTEM_PROMPT,
        legalKnowledge,
        contextLine ? `**Contexto del usuario:** ${contextLine}` : '',
    ].filter(Boolean).join('\n\n');

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
        const reply = summaries.join('\n');
        const updatedHistory: ConversationMessage[] = [
            ...baseConversation,
            { role: 'assistant', content: reply },
        ];
        return { reply, updatedHistory };
    } else {
        // 3b. Agregar mensaje del usuario al historial
        history.push({ role: 'user', content: buildUserContent(message, options.image) });
    }

    // 4. Loop agéntico
    let rounds = 0;
    let response: Anthropic.Message;

    do {
        const estimatedPromptTokens = estimateTokensFromText(systemPrompt) + estimateTokensFromMessages(history);
        const estimatedCompletionTokens = 2048;

        await enforceAiBudget({
            communityId: userCtx.community_id,
            userId: userCtx.user_id,
            role: userCtx.role,
            module: 'coco.chat',
            provider: 'anthropic',
            model: MODEL,
            actionType: 'chat',
            estimatedPromptTokens,
            estimatedCompletionTokens,
        });

        const startedAt = Date.now();
        response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 2048,
            system: systemPrompt,
            messages: history,
            tools: TOOL_DEFINITIONS
                .filter(tool => isToolAllowedForRole(tool.name, userCtx.role)) as unknown as Anthropic.Tool[],
            ...(requiredTool && rounds === 0 ? { tool_choice: { type: 'tool' as const, name: requiredTool } } : {}),
        });

        const usage = response.usage;
        const promptTokens = usage?.input_tokens ?? estimatedPromptTokens;
        const completionTokens = usage?.output_tokens ?? estimateTokensFromMessages(response.content);
        await recordAiUsage({
            communityId: userCtx.community_id,
            userId: userCtx.user_id,
            role: userCtx.role,
            module: 'coco.chat',
            provider: 'anthropic',
            model: MODEL,
            actionType: 'chat',
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            estimatedCostCents: estimateAiCostCents({
                provider: 'anthropic',
                model: MODEL,
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
    } while (response.stop_reason === 'tool_use' && rounds < MAX_TOOL_ROUNDS);

    // 5. Extraer texto final
    const rawText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

    // 6. Extraer comando de navegación y acción (UI)
    const navMatch = rawText.match(/NAVEGAR:(\/[a-zA-Z0-9/_-]+)/);
    const navigate = navMatch?.[1];
    
    const actMatch = rawText.match(/CMD:([A-Z_]+)/);
    const action = actMatch?.[1];

    let reply = rawText
        .replace(/NAVEGAR:\/[a-zA-Z0-9/_-]+/g, '')
        .replace(/CMD:[A-Z_]+/g, '')
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
