import Anthropic from '@anthropic-ai/sdk';
import { anthropicModelFor } from '@/lib/ai/modelRouter';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromText, recordAiUsage } from '@/lib/ai/budget';
import type { CommitteeDigestWriter } from './compose';

const MODULE = 'agent-center.committee-digest';

/**
 * Redactor con el proveedor que ya usa el Agent Center (Anthropic), con
 * presupuesto de IA por comunidad y registro de consumo. Devuelve null si no
 * hay credencial: el resumen sale entonces con el texto determinista.
 */
export function anthropicCommitteeDigestWriter(context: { communityId: string; userId: string | null }): CommitteeDigestWriter | null {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    const model = anthropicModelFor('agent-center.committee-digest');
    return async ({ system, user }) => {
        const estimatedPromptTokens = estimateTokensFromText(`${system}\n${user}`);
        await enforceAiBudget({
            communityId: context.communityId, userId: context.userId, role: 'admin',
            module: MODULE, provider: 'anthropic', model, actionType: 'other',
            estimatedPromptTokens, estimatedCompletionTokens: 700,
        });
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 25_000, maxRetries: 1 });
        const startedAt = Date.now();
        try {
            const response = await client.messages.create({
                model,
                max_tokens: 900,
                system,
                messages: [{ role: 'user', content: user }],
            });
            const text = response.content
                .filter((block): block is Anthropic.TextBlock => block.type === 'text')
                .map(block => block.text).join('\n').trim();
            const promptTokens = response.usage?.input_tokens || estimatedPromptTokens;
            const completionTokens = response.usage?.output_tokens || estimateTokensFromText(text);
            await recordAiUsage({
                communityId: context.communityId, userId: context.userId, role: 'admin',
                module: MODULE, provider: 'anthropic', model, actionType: 'other',
                promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
                estimatedCostCents: estimateAiCostCents({ provider: 'anthropic', model, promptTokens, completionTokens }),
                status: 'success', metadata: { latencyMs: Date.now() - startedAt },
            });
            return text;
        } catch (error) {
            await recordAiUsage({
                communityId: context.communityId, userId: context.userId, role: 'admin',
                module: MODULE, provider: 'anthropic', model, actionType: 'other',
                promptTokens: estimatedPromptTokens, completionTokens: 0, totalTokens: estimatedPromptTokens,
                status: 'error', metadata: { latencyMs: Date.now() - startedAt },
            });
            throw error;
        }
    };
}
