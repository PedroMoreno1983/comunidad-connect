import OpenAI from 'openai';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromText, recordAiUsage } from '@/lib/ai/budget';
import { fallbackToolsForRole, isFallbackReadOnlyTool, type AnthropicStyleTool } from '@/lib/ai/toolBridge';
import { buildPlatformContext } from '@/lib/coco/platformMap';
import { COCO_SYSTEM_PROMPT } from '@/lib/coco/system-prompt';
import { executeTool, isToolAllowedForRole, TOOL_DEFINITIONS } from '@/lib/coco/tools';
import type { ConversationMessage, SessionData } from '@/lib/coco/session-store';

const MODEL = 'gemini-2.5-flash';
const MAX_ROUNDS = 3;

function plainText(content: ConversationMessage['content']): string {
    if (typeof content === 'string') return content;
    return content
        .filter((part): part is { type: string; text: string } =>
            typeof part === 'object' && part !== null && 'type' in part && part.type === 'text' &&
            'text' in part && typeof part.text === 'string')
        .map(part => part.text)
        .join('\n');
}

/** Respaldo conversacional de WhatsApp. Sus herramientas son exclusivamente de lectura. */
export async function askCoCoWhatsAppFallback(
    message: string,
    session: SessionData,
    context: SessionData['user_context'],
): Promise<{ reply: string; updatedHistory: ConversationMessage[] }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

    const client = new OpenAI({
        apiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        timeout: 70_000,
        maxRetries: 0,
    });
    const tools = fallbackToolsForRole(
        TOOL_DEFINITIONS as unknown as AnthropicStyleTool[],
        context.role,
        isToolAllowedForRole,
    );
    const system = `${COCO_SYSTEM_PROMPT}\n\n${buildPlatformContext('/chat', context.role)}\n\n` +
        'Canal WhatsApp. El motor principal de acciones no está disponible. ' +
        'Usa las herramientas de lectura para consultas de esta comunidad. ' +
        'No ejecutes ni afirmes haber ejecutado cambios, reservas, pagos, avisos o solicitudes. ' +
        'Si te piden una acción, explica brevemente que está temporalmente indisponible. ' +
        'No muestres identificadores internos ni comandos de navegación.';
    const recentMessages = session.conversation.slice(-8)
        .map(turn => ({ role: turn.role, content: plainText(turn.content) }))
        .filter(turn => turn.content.trim());
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: system },
        { role: 'system', content: `Residente: ${context.name || 'vecino/a'}. Rol: ${context.role || 'resident'}.` },
        ...recentMessages,
        { role: 'user', content: message },
    ];

    for (let round = 0; round <= MAX_ROUNDS; round += 1) {
        const estimatedPromptTokens = estimateTokensFromText(system) +
            messages.reduce((total, entry) => total + estimateTokensFromText(
                typeof entry.content === 'string' ? entry.content : (JSON.stringify(entry) || ''),
            ), 0);
        await enforceAiBudget({
            communityId: context.community_id,
            userId: context.user_id,
            role: context.role,
            module: 'coco.chat.fallback',
            provider: 'gemini',
            model: MODEL,
            actionType: 'fallback',
            estimatedPromptTokens,
            estimatedCompletionTokens: 700,
        });

        const startedAt = Date.now();
        const completion = await client.chat.completions.create({
            model: MODEL,
            max_tokens: 700,
            messages,
            ...(round < MAX_ROUNDS && tools.length ? { tools } : {}),
        });
        const usage = completion.usage;
        const promptTokens = usage?.prompt_tokens ?? estimatedPromptTokens;
        const completionTokens = usage?.completion_tokens ?? 0;
        await recordAiUsage({
            communityId: context.community_id,
            userId: context.user_id,
            role: context.role,
            module: 'coco.chat.fallback',
            provider: 'gemini',
            model: MODEL,
            actionType: 'fallback',
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            estimatedCostCents: estimateAiCostCents({ provider: 'gemini', model: MODEL, promptTokens, completionTokens }),
            status: 'success',
            metadata: { latencyMs: Date.now() - startedAt, toolRound: round },
        });

        const answer = completion.choices[0]?.message;
        const toolCalls = answer?.tool_calls ?? [];
        if (!toolCalls.length) {
            const reply = (answer?.content || '')
                .replace(/NAVEGAR:\/[a-zA-Z0-9/_-]+/g, '')
                .replace(/CMD:[A-Z_]+/g, '')
                .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, 'identificador interno protegido')
                .trim() || 'No pude responder con claridad. ¿Puedes decirlo de otra forma?';
            return {
                reply,
                updatedHistory: [
                    ...session.conversation,
                    { role: 'user', content: message },
                    { role: 'assistant', content: reply },
                ],
            };
        }

        messages.push(answer as OpenAI.Chat.ChatCompletionMessageParam);
        for (const call of toolCalls) {
            if (call.type !== 'function') continue;
            let result: unknown;
            try {
                if (!isFallbackReadOnlyTool(call.function.name) || !isToolAllowedForRole(call.function.name, context.role)) {
                    result = { error: 'Herramienta no disponible en modo de respaldo.' };
                } else {
                    const args = JSON.parse(call.function.arguments || '{}') as Record<string, string>;
                    result = await executeTool(call.function.name, args, {
                        user_id: context.user_id,
                        unit_id: context.unit_id,
                        community_id: context.community_id,
                        role: context.role,
                        name: context.name,
                        channel: 'whatsapp',
                    });
                }
            } catch (error) {
                result = { error: error instanceof Error ? error.message : 'Error consultando la herramienta.' };
            }
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result ?? null) });
        }
    }

    throw new Error('Gemini no terminó la consulta dentro del límite de herramientas');
}
