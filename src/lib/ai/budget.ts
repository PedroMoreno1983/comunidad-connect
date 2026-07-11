import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export type AiActionType = 'chat' | 'image' | 'embedding' | 'extraction' | 'course' | 'fallback' | 'other';
export type AiUsageStatus = 'success' | 'error' | 'blocked' | 'skipped' | 'fallback';

export interface AiBudgetContext {
    communityId?: string | null;
    userId?: string | null;
    role?: string | null;
    module: string;
    provider: string;
    model?: string | null;
    actionType?: AiActionType;
    metadata?: Record<string, unknown>;
}

export interface AiBudgetCheck extends AiBudgetContext {
    estimatedPromptTokens?: number;
    estimatedCompletionTokens?: number;
    estimatedTotalTokens?: number;
    estimatedImages?: number;
    estimatedCostCents?: number;
}

export interface AiUsageRecord extends AiBudgetContext {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    imageCount?: number;
    estimatedCostCents?: number;
    status?: AiUsageStatus;
    blockedReason?: string;
}

type AiBudget = {
    is_enabled: boolean;
    monthly_token_limit: number;
    monthly_image_limit: number;
    monthly_cost_limit_cents: number;
    resident_daily_token_limit: number;
    staff_daily_token_limit: number;
    heavy_action_daily_limit: number;
};

type AiUsageEvent = {
    user_id: string | null;
    total_tokens: number | null;
    image_count: number | null;
    estimated_cost_cents: number | null;
    action_type: AiActionType | null;
    status: AiUsageStatus | null;
    created_at: string;
};

export class AiBudgetExceededError extends Error {
    status = 429;

    constructor(public reason: string) {
        super(reason);
        this.name = 'AiBudgetExceededError';
    }
}

export function isAiBudgetExceededError(error: unknown): error is AiBudgetExceededError {
    return error instanceof AiBudgetExceededError || (error instanceof Error && error.name === 'AiBudgetExceededError');
}

export function estimateTokensFromText(text: string) {
    return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateTokensFromMessages(value: unknown) {
    return estimateTokensFromText(JSON.stringify(value ?? ''));
}

export function estimateAiCostCents(input: {
    provider: string;
    model?: string | null;
    promptTokens?: number;
    completionTokens?: number;
    imageCount?: number;
}) {
    const provider = input.provider.toLowerCase();
    const model = (input.model || '').toLowerCase();
    const prompt = input.promptTokens ?? 0;
    const completion = input.completionTokens ?? 0;
    const images = input.imageCount ?? 0;

    if (provider === 'openai' && images > 0) return images * 4;
    if (provider === 'voyage') return ((prompt + completion) / 1_000_000) * 0.2;
    if (provider === 'gemini') return (prompt / 1_000_000) * 8 + (completion / 1_000_000) * 30;
    if (provider === 'anthropic' && model.includes('opus')) return (prompt / 1_000_000) * 1500 + (completion / 1_000_000) * 7500;
    if (provider === 'anthropic') return (prompt / 1_000_000) * 300 + (completion / 1_000_000) * 1500;
    return ((prompt + completion) / 1_000_000) * 100;
}

function monthStart() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function dayStart() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function defaultBudget(): AiBudget {
    return {
        is_enabled: true,
        monthly_token_limit: Number(process.env.AI_DEFAULT_MONTHLY_TOKEN_LIMIT || 10_000_000),
        monthly_image_limit: Number(process.env.AI_DEFAULT_MONTHLY_IMAGE_LIMIT || 30),
        monthly_cost_limit_cents: Number(process.env.AI_DEFAULT_MONTHLY_COST_LIMIT_CENTS || 10_000),
        resident_daily_token_limit: Number(process.env.AI_RESIDENT_DAILY_TOKEN_LIMIT || 100_000),
        staff_daily_token_limit: Number(process.env.AI_STAFF_DAILY_TOKEN_LIMIT || 300_000),
        heavy_action_daily_limit: Number(process.env.AI_HEAVY_DAILY_LIMIT || 20),
    };
}

function isUuid(value?: string | null) {
    return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function dailyLimitForRole(budget: AiBudget, role?: string | null) {
    return role === 'admin' || role === 'concierge'
        ? budget.staff_daily_token_limit
        : budget.resident_daily_token_limit;
}

function isHeavyAction(actionType?: AiActionType) {
    return actionType === 'image' || actionType === 'course' || actionType === 'extraction';
}

function userMessage(reason: string) {
    if (reason === 'community_ai_disabled') return 'La IA esta desactivada para esta comunidad.';
    if (reason === 'monthly_token_limit') return 'La comunidad alcanzo su bolsa mensual de IA. Un administrador puede ampliar el plan o esperar el proximo ciclo.';
    if (reason === 'daily_role_token_limit') return 'Alcanzaste el limite diario de IA para tu rol. Intenta nuevamente manana o solicita ampliacion a administracion.';
    if (reason === 'monthly_image_limit') return 'La comunidad alcanzo el limite mensual de imagenes generadas con IA.';
    if (reason === 'monthly_cost_limit') return 'La comunidad alcanzo el presupuesto mensual de IA.';
    if (reason === 'daily_heavy_action_limit') return 'La comunidad alcanzo el limite diario de acciones pesadas de IA.';
    return 'No queda presupuesto disponible para esta accion de IA.';
}

async function fetchBudget(communityId?: string | null): Promise<AiBudget> {
    if (!isUuid(communityId)) return defaultBudget();

    try {
        const { data, error } = await getSupabaseAdmin()
            .from('ai_budgets')
            .select('is_enabled, monthly_token_limit, monthly_image_limit, monthly_cost_limit_cents, resident_daily_token_limit, staff_daily_token_limit, heavy_action_daily_limit')
            .eq('community_id', communityId)
            .maybeSingle();

        if (error) {
            console.warn('[AI Budget] Could not read ai_budgets:', error.message);
            return defaultBudget();
        }

        return data ? { ...defaultBudget(), ...data } : defaultBudget();
    } catch (error) {
        console.warn('[AI Budget] Budget lookup unavailable:', error);
        return defaultBudget();
    }
}

async function fetchUsage(communityId: string | null | undefined, userId: string | null | undefined) {
    if (!isUuid(communityId)) {
        return {
            monthlyTokens: 0,
            monthlyImages: 0,
            monthlyCostCents: 0,
            dailyUserTokens: 0,
            dailyHeavyActions: 0,
        };
    }

    const { data, error } = await getSupabaseAdmin()
        .from('ai_usage_events')
        .select('user_id, total_tokens, image_count, estimated_cost_cents, action_type, status, created_at')
        .eq('community_id', communityId)
        .gte('created_at', monthStart());

    if (error) {
        console.warn('[AI Budget] Could not read ai_usage_events:', error.message);
        return {
            monthlyTokens: 0,
            monthlyImages: 0,
            monthlyCostCents: 0,
            dailyUserTokens: 0,
            dailyHeavyActions: 0,
        };
    }

    const events = (data ?? []) as AiUsageEvent[];
    const day = dayStart();
    const successful = events.filter(event => event.status !== 'blocked');

    return {
        monthlyTokens: successful.reduce((sum, event) => sum + (event.total_tokens ?? 0), 0),
        monthlyImages: successful.reduce((sum, event) => sum + (event.image_count ?? 0), 0),
        monthlyCostCents: successful.reduce((sum, event) => sum + Number(event.estimated_cost_cents ?? 0), 0),
        dailyUserTokens: isUuid(userId)
            ? successful
                .filter(event => event.created_at >= day)
                .filter(event => event.user_id === userId)
                .reduce((sum, event) => sum + (event.total_tokens ?? 0), 0)
            : 0,
        dailyHeavyActions: successful
            .filter(event => event.created_at >= day && isHeavyAction(event.action_type ?? undefined))
            .length,
    };
}

export async function recordAiUsage(input: AiUsageRecord) {
    if (!isUuid(input.communityId) && !isUuid(input.userId)) return;

    const promptTokens = Math.max(0, Math.round(input.promptTokens ?? 0));
    const completionTokens = Math.max(0, Math.round(input.completionTokens ?? 0));
    const totalTokens = Math.max(0, Math.round(input.totalTokens ?? promptTokens + completionTokens));
    const imageCount = Math.max(0, Math.round(input.imageCount ?? 0));
    const cost = input.estimatedCostCents ?? estimateAiCostCents({
        provider: input.provider,
        model: input.model,
        promptTokens,
        completionTokens,
        imageCount,
    });

    try {
        await getSupabaseAdmin().from('ai_usage_events').insert({
            community_id: isUuid(input.communityId) ? input.communityId : null,
            user_id: isUuid(input.userId) ? input.userId : null,
            role: input.role ?? null,
            module: input.module,
            provider: input.provider,
            model: input.model ?? null,
            action_type: input.actionType ?? 'chat',
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            image_count: imageCount,
            estimated_cost_cents: cost,
            status: input.status ?? 'success',
            blocked_reason: input.blockedReason ?? null,
            metadata: input.metadata ?? {},
        });
    } catch (error) {
        console.warn('[AI Budget] Could not record AI usage:', error);
    }
}

export async function enforceAiBudget(input: AiBudgetCheck) {
    if (process.env.AI_BUDGET_ENFORCEMENT === 'off') return;

    const estimatedPrompt = Math.max(0, Math.round(input.estimatedPromptTokens ?? 0));
    const estimatedCompletion = Math.max(0, Math.round(input.estimatedCompletionTokens ?? 0));
    const estimatedTotal = Math.max(0, Math.round(input.estimatedTotalTokens ?? estimatedPrompt + estimatedCompletion));
    const estimatedImages = Math.max(0, Math.round(input.estimatedImages ?? 0));
    const estimatedCost = input.estimatedCostCents ?? estimateAiCostCents({
        provider: input.provider,
        model: input.model,
        promptTokens: estimatedPrompt,
        completionTokens: estimatedCompletion,
        imageCount: estimatedImages,
    });

    const budget = await fetchBudget(input.communityId);
    const usage = await fetchUsage(input.communityId, input.userId);

    let reason: string | null = null;
    if (!budget.is_enabled) reason = 'community_ai_disabled';
    else if (budget.monthly_token_limit > 0 && usage.monthlyTokens + estimatedTotal > budget.monthly_token_limit) reason = 'monthly_token_limit';
    else if (budget.monthly_image_limit > 0 && usage.monthlyImages + estimatedImages > budget.monthly_image_limit) reason = 'monthly_image_limit';
    else if (budget.monthly_cost_limit_cents > 0 && usage.monthlyCostCents + estimatedCost > budget.monthly_cost_limit_cents) reason = 'monthly_cost_limit';
    else if (dailyLimitForRole(budget, input.role) > 0 && usage.dailyUserTokens + estimatedTotal > dailyLimitForRole(budget, input.role)) reason = 'daily_role_token_limit';
    else if (isHeavyAction(input.actionType) && budget.heavy_action_daily_limit > 0 && usage.dailyHeavyActions + 1 > budget.heavy_action_daily_limit) reason = 'daily_heavy_action_limit';

    if (!reason) return;

    await recordAiUsage({
        ...input,
        promptTokens: estimatedPrompt,
        completionTokens: estimatedCompletion,
        totalTokens: estimatedTotal,
        imageCount: estimatedImages,
        estimatedCostCents: estimatedCost,
        status: 'blocked',
        blockedReason: reason,
    });

    throw new AiBudgetExceededError(userMessage(reason));
}
