/**
 * agent.ts — CoCo IA Core
 * Loop agéntico usando Anthropic Messages API con tool use.
 * Soporta multi-turn con historial persistido en Supabase.
 */

import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, executeTool } from './tools';
import { COCO_SYSTEM_PROMPT } from './system-prompt';
import type { ConversationMessage, SessionData } from './session-store';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-opus-4-5'; // Cambiar a claude-3-5-haiku-20241022 para reducir costo
const MAX_TOOL_ROUNDS = 5; // Máximo de rondas de tool use por mensaje

export interface CoCoResponse {
    reply: string;
    navigate?: string;
    updatedHistory: ConversationMessage[];
}

export async function askCoCo(
    message: string,
    session: SessionData | null,
    userCtx: {
        unit_id?: string;
        role?: string;
        community_id?: string;
        name?: string;
        currentPage?: string;
        channel?: string;
    }
): Promise<CoCoResponse> {
    // 1. Construir historial de mensajes
    const history: Anthropic.MessageParam[] = (session?.conversation ?? []).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : msg.content as Anthropic.ContentBlock[],
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

    // 3. Agregar mensaje del usuario al historial
    history.push({ role: 'user', content: message });

    // 4. Loop agéntico
    let rounds = 0;
    let response: Anthropic.Message;

    do {
        response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 2048,
            system: systemPrompt,
            messages: history,
            tools: TOOL_DEFINITIONS as Anthropic.Tool[],
        });

        // Si Claude quiere usar herramientas
        if (response.stop_reason === 'tool_use') {
            const toolUses = response.content.filter(
                (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
            );

            // Agregar respuesta de asistente con los tool_use blocks al historial
            history.push({ role: 'assistant', content: response.content });

            // Ejecutar herramientas en paralelo
            const toolResults = await Promise.all(
                toolUses.map(async (tu) => {
                    console.log(`[CoCo] Ejecutando herramienta: ${tu.name}`, tu.input);
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

    // 6. Extraer comando de navegación si existe (compatibilidad con sistema actual)
    const navMatch = rawText.match(/NAVEGAR:(\/[a-zA-Z0-9/_-]+)/);
    const navigate = navMatch?.[1];
    const reply = rawText.replace(/NAVEGAR:\/[a-zA-Z0-9/_-]+/g, '').trim();

    // 7. Actualizar historial con la respuesta final del asistente
    const finalAssistantMessage: ConversationMessage = {
        role: 'assistant',
        content: rawText,
    };

    const updatedHistory: ConversationMessage[] = [
        ...(session?.conversation ?? []),
        { role: 'user', content: message },
        finalAssistantMessage,
    ];

    return { reply, navigate, updatedHistory };
}
