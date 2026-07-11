/**
 * agent.ts — CoCo IA Core
 * Loop agéntico usando Anthropic Messages API con tool use.
 * Soporta multi-turn con historial persistido en Supabase.
 */

import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, executeTool, MUTATING_TOOLS, describePendingAction } from './tools';
import { COCO_SYSTEM_PROMPT } from './system-prompt';
import type { ConversationMessage, SessionData } from './session-store';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromMessages, estimateTokensFromText, recordAiUsage } from '@/lib/ai/budget';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-5';
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

export async function askCoCo(
    message: string,
    session: SessionData | null,
    userCtx: {
        user_id?: string;
        unit_id?: string;
        role?: string;
        community_id?: string;
        name?: string;
        currentPage?: string;
        channel?: string;
    },
    options: {
        image?: CoCoImageAttachment;
        /** Si viene, esta llamada RESUELVE una tanda de acciones pendientes en vez de mandar un mensaje nuevo. */
        resolutions?: CoCoResolutions;
    } = {}
): Promise<CoCoResponse> {
    const isResuming = Boolean(options.resolutions);

    // Si estamos resolviendo una confirmación pendiente, esa tanda ya no cuenta
    // como el último turno "limpio" de la conversación persistida: se reemplaza
    // por el resultado real (ejecutado o rechazado) más abajo.
    const baseConversation = isResuming
        ? (session?.conversation ?? []).slice(0, -1)
        : (session?.conversation ?? []);

    // 1. Construir historial de mensajes
    const history: Anthropic.MessageParam[] = (session?.conversation ?? []).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content as any,
    }));

    // 2. Contexto del usuario en el system prompt
    const contextLine = [
        userCtx.name && `Nombre: ${userCtx.name}`,
        userCtx.role && `Rol: ${userCtx.role}`,
        userCtx.unit_id && `Unidad: ${userCtx.unit_id}`,
        userCtx.currentPage && `Página actual: ${userCtx.currentPage}`,
    ].filter(Boolean).join(' | ');

    const systemPrompt = contextLine
        ? `${COCO_SYSTEM_PROMPT}\n\n**Contexto del usuario:** ${contextLine}`
        : COCO_SYSTEM_PROMPT;

    if (isResuming) {
        // 3a. Resolver la tanda de tool_use pendiente (el último turno del historial).
        const pausedTurn = history[history.length - 1];
        const pendingToolUses = Array.isArray(pausedTurn?.content)
            ? (pausedTurn.content as Anthropic.ContentBlock[]).filter(
                (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
            )
            : [];

        const toolResults = await Promise.all(
            pendingToolUses.map(async (tu) => {
                const resolution = options.resolutions?.[tu.id];
                if (resolution === 'rejected') {
                    return {
                        type: 'tool_result' as const,
                        tool_use_id: tu.id,
                        content: JSON.stringify({ error: 'El usuario rechazó esta acción. No se ejecutó.' }),
                    };
                }
                const result = await executeTool(tu.name, tu.input as Record<string, string>, userCtx);
                return {
                    type: 'tool_result' as const,
                    tool_use_id: tu.id,
                    content: JSON.stringify(result),
                };
            })
        );

        history.push({ role: 'user', content: toolResults });
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
            tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
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

            if (mutatingUses.length > 0) {
                // Alguna herramienta muta datos reales: pausamos TODA la tanda (aunque
                // venga mezclada con lecturas) y esperamos confirmación explícita del
                // usuario antes de ejecutar nada. Se persiste el turno tal cual (con los
                // tool_use crudos) para poder resolverlo despues en una llamada RESUME.
                const pendingActions: CoCoPendingAction[] = toolUses.map(tu => {
                    const { title, summary } = describePendingAction(tu.name, tu.input as Record<string, unknown>);
                    return { toolUseId: tu.id, name: tu.name, input: tu.input as Record<string, unknown>, title, summary };
                });

                const updatedHistory: ConversationMessage[] = [
                    ...baseConversation,
                    ...(isResuming ? [] : [{ role: 'user' as const, content: message }]),
                    { role: 'assistant', content: response.content as unknown as object[] },
                ];

                return { reply: '', updatedHistory, pendingActions };
            }

            // Agregar respuesta de asistente con los tool_use blocks al historial
            history.push({ role: 'assistant', content: response.content });

            // Ninguna herramienta de esta tanda muta datos: se ejecutan de inmediato.
            const toolResults = await Promise.all(
                toolUses.map(async (tu) => {
                    const result = await executeTool(
                        tu.name,
                        tu.input as Record<string, string>,
                        userCtx
                    );
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
