import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { anthropicModelFor, deepSeekIsAvailable, resolveAiModel } from '@/lib/ai/modelRouter';
import { completeDeepSeekText } from '@/lib/ai/deepseek';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromText, recordAiUsage } from '@/lib/ai/budget';

const MODULE = 'assemblies.writer';

export interface AssemblyProse {
    text: string;
    provider: 'anthropic' | 'deepseek';
}

/**
 * Redacción de prosa para asambleas: primero Anthropic (el proveedor del
 * proyecto), luego DeepSeek si hay credencial, con presupuesto de IA y registro
 * de consumo. Devuelve null si ninguno responde: quien llama usa el texto
 * determinista de `compose.ts`.
 */
export async function writeAssemblyProse(context: { communityId: string; userId: string | null }, prompt: { system: string; user: string; maxTokens: number }): Promise<AssemblyProse | null> {
    const estimatedPromptTokens = estimateTokensFromText(`${prompt.system}\n${prompt.user}`);
    if (process.env.ANTHROPIC_API_KEY) {
        const model = anthropicModelFor('assemblies.writer');
        const startedAt = Date.now();
        try {
            await enforceAiBudget({
                communityId: context.communityId, userId: context.userId, role: 'admin', module: MODULE,
                provider: 'anthropic', model, actionType: 'other', estimatedPromptTokens, estimatedCompletionTokens: prompt.maxTokens,
            });
            const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 25_000, maxRetries: 1 });
            const response = await client.messages.create({
                model, max_tokens: prompt.maxTokens, system: prompt.system, messages: [{ role: 'user', content: prompt.user }],
            });
            const text = response.content
                .filter((block): block is Anthropic.TextBlock => block.type === 'text')
                .map(block => block.text).join('\n').trim();
            const promptTokens = response.usage?.input_tokens || estimatedPromptTokens;
            const completionTokens = response.usage?.output_tokens || estimateTokensFromText(text);
            await recordAiUsage({
                communityId: context.communityId, userId: context.userId, role: 'admin', module: MODULE, provider: 'anthropic', model,
                actionType: 'other', promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
                estimatedCostCents: estimateAiCostCents({ provider: 'anthropic', model, promptTokens, completionTokens }),
                status: 'success', metadata: { latencyMs: Date.now() - startedAt },
            });
            if (text) return { text, provider: 'anthropic' };
        } catch (error) {
            console.error('[assemblies] Anthropic no respondió, se intenta el respaldo', error);
            await recordAiUsage({
                communityId: context.communityId, userId: context.userId, role: 'admin', module: MODULE, provider: 'anthropic', model,
                actionType: 'other', promptTokens: estimatedPromptTokens, completionTokens: 0, totalTokens: estimatedPromptTokens,
                status: 'error', metadata: { latencyMs: Date.now() - startedAt },
            }).catch(() => undefined);
        }
    }
    if (deepSeekIsAvailable()) {
        const routed = resolveAiModel('assemblies.writer.fallback');
        if (routed.provider === 'deepseek') {
            try {
                const result = await completeDeepSeekText({ model: routed.model, system: prompt.system, user: prompt.user, maxTokens: prompt.maxTokens });
                await recordAiUsage({
                    communityId: context.communityId, userId: context.userId, role: 'admin', module: MODULE, provider: 'deepseek', model: routed.model,
                    actionType: 'fallback', promptTokens: result.promptTokens, completionTokens: result.completionTokens,
                    totalTokens: result.promptTokens + result.completionTokens, status: 'success',
                }).catch(() => undefined);
                if (result.text.trim()) return { text: result.text.trim(), provider: 'deepseek' };
            } catch (error) {
                console.error('[assemblies] DeepSeek tampoco respondió', error);
            }
        }
    }
    return null;
}
