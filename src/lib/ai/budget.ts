import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { CoCoAllowance } from '@/lib/types';

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
    /** Tope de costo por persona, en centavos de dólar. 0 = sin tope. */
    staff_daily_cost_cents: number;
    staff_weekly_cost_cents: number;
    resident_daily_cost_cents: number;
    resident_weekly_cost_cents: number;
};

type AiUsageEvent = {
    user_id: string | null;
    total_tokens: number | null;
    image_count: number | null;
    estimated_cost_cents: number | null;
    action_type: AiActionType | null;
    status: AiUsageStatus | null;
    created_at: string;
    metadata?: Record<string, unknown> | null;
};

/**
 * Tokens que cuentan para el cupo diario de una persona. La caché leída de
 * Anthropic (el prefijo de herramientas y sistema que se repite en cada ronda)
 * cuenta al 10 %, como se cobra; antes cada ronda contaba ~33 mil tokens enteros.
 */
export function dailyTokensOf(event: Pick<AiUsageEvent, 'total_tokens' | 'metadata'>) {
    const total = Math.max(0, event.total_tokens ?? 0);
    const cached = Number(event.metadata?.cacheReadTokens ?? 0);
    const read = Number.isFinite(cached) ? Math.min(total, Math.max(0, cached)) : 0;
    return Math.round(total - read * 0.9);
}

export class AiBudgetExceededError extends Error {
    status = 429;

    constructor(public reason: string, public code: string = 'budget_exceeded') {
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

/**
 * Centavos de dólar por millón de tokens (entrada, salida) de Anthropic, precios al 2026-11-03.
 * Lo más específico primero. Antes todo lo que no era Haiku ni Opus se cobraba como Sonnet 4.6
 * (300/1500), un 50 % sobre Sonnet 5, y la caché leída se cobraba entera: con el prefijo de CoCo
 * (~33k tokens de herramientas y sistema) el panel inflaba el gasto varias veces y el presupuesto
 * podía bloquear a una comunidad mucho antes de tiempo (revisión del 18-11-2026).
 */
const ANTHROPIC_CENTS_PER_MTOK: Array<[RegExp, number, number]> = [
    [/opus-5-5/, 400, 2000],
    [/opus/, 500, 2500],
    [/sonnet-5/, 200, 1000],
    [/sonnet/, 300, 1500],
    [/haiku-5-5/, 10, 50],
    [/haiku/, 100, 500],
];

function anthropicCostCents(model: string, input: {
    promptTokens?: number;
    completionTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    cacheWriteTtl?: '5m' | '1h';
}) {
    const [, inCents, outCents] = ANTHROPIC_CENTS_PER_MTOK.find(([re]) => re.test(model)) ?? [null, 300, 1500];
    const read = Math.max(0, input.cacheReadTokens ?? 0);
    const write = Math.max(0, input.cacheWriteTokens ?? 0);
    const fresh = Math.max(0, (input.promptTokens ?? 0) - read - write);
    const writeFactor = input.cacheWriteTtl === '1h' ? 2 : 1.25;
    const equivalentInput = fresh + read * 0.1 + write * writeFactor;
    return (equivalentInput / 1_000_000) * inCents + ((input.completionTokens ?? 0) / 1_000_000) * outCents;
}

export function estimateAiCostCents(input: {
    provider: string;
    model?: string | null;
    promptTokens?: number;
    completionTokens?: number;
    imageCount?: number;
    /** Parte de promptTokens leída de la caché de Anthropic: se cobra al 10 %. */
    cacheReadTokens?: number;
    /** Parte de promptTokens escrita en la caché: 1,25× (5 min) o 2× si cacheWriteTtl es '1h'. */
    cacheWriteTokens?: number;
    cacheWriteTtl?: '5m' | '1h';
}) {
    const provider = input.provider.toLowerCase();
    const model = (input.model || '').toLowerCase();
    if (provider === 'anthropic') return anthropicCostCents(model, input);
    const prompt = input.promptTokens ?? 0;
    const completion = input.completionTokens ?? 0;
    const images = input.imageCount ?? 0;

    // Centavos de dólar por millón de tokens, precios al 2026-08-03. La tabla
    // anterior cobraba Opus a 1500/7500, que era el precio de Opus 4.5: con
    // Opus 5 el costo real es un tercio de eso, así que el panel de consumo
    // venía sobreestimando y podía bloquear por presupuesto antes de tiempo.
    if (provider === 'openai' && images > 0) return images * 4;
    if (provider === 'openai' && model.includes('gpt-5.4-mini')) {
        return (prompt / 1_000_000) * 75 + (completion / 1_000_000) * 450;
    }
    if (provider === 'voyage') return ((prompt + completion) / 1_000_000) * 0.2;
    if (provider === 'gemini') return (prompt / 1_000_000) * 8 + (completion / 1_000_000) * 30;
    // DeepSeek cobra aún menos los tokens servidos desde su caché; sin ese dato
    // se cobra todo a precio lleno, que es el lado seguro para un presupuesto.
    if (provider === 'deepseek') return (prompt / 1_000_000) * 14 + (completion / 1_000_000) * 28;
    return ((prompt + completion) / 1_000_000) * 100;
}

function monthStart() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Inicio del día en Chile, en UTC. El cupo diario se renueva a medianoche de
 * Chile (antes, a medianoche UTC: las 21:00 o 20:00 en Chile).
 */
export function chileDayStart(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map(part => [part.type, part.value]));
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
    return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) - offsetMs).toISOString();
}

function dayStart() {
    return chileDayStart();
}

/** Lunes 00:00 de Chile de la semana en curso, en UTC: el cupo semanal se renueva ahí. */
export function chileWeekStart(now = new Date()) {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', weekday: 'short' }).format(now);
    const daysSinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
    return chileDayStart(new Date(now.getTime() - Math.max(0, daysSinceMonday) * 86_400_000));
}

function defaultBudget(): AiBudget {
    return {
        is_enabled: true,
        monthly_token_limit: Number(process.env.AI_DEFAULT_MONTHLY_TOKEN_LIMIT || 10_000_000),
        monthly_image_limit: Number(process.env.AI_DEFAULT_MONTHLY_IMAGE_LIMIT || 30),
        monthly_cost_limit_cents: Number(process.env.AI_DEFAULT_MONTHLY_COST_LIMIT_CENTS || 1_000),
        resident_daily_token_limit: Number(process.env.AI_RESIDENT_DAILY_TOKEN_LIMIT || 100_000),
        staff_daily_token_limit: Number(process.env.AI_STAFF_DAILY_TOKEN_LIMIT || 300_000),
        heavy_action_daily_limit: Number(process.env.AI_HEAVY_DAILY_LIMIT || 20),
        staff_daily_cost_cents: Number(process.env.AI_STAFF_DAILY_COST_CENTS || 100),
        staff_weekly_cost_cents: Number(process.env.AI_STAFF_WEEKLY_COST_CENTS || 400),
        resident_daily_cost_cents: Number(process.env.AI_RESIDENT_DAILY_COST_CENTS || 15),
        resident_weekly_cost_cents: Number(process.env.AI_RESIDENT_WEEKLY_COST_CENTS || 50),
    };
}

/**
 * Tope de costo de una persona según su rol. Administración y conserjería
 * trabajan con CoCo todo el día; los residentes conversan menos.
 */
export function personCostLimits(budget: Pick<AiBudget, 'staff_daily_cost_cents' | 'staff_weekly_cost_cents' | 'resident_daily_cost_cents' | 'resident_weekly_cost_cents'>, role?: string | null) {
    const staff = isAdminRole(role) || role === 'concierge';
    return staff
        ? { daily: budget.staff_daily_cost_cents, weekly: budget.staff_weekly_cost_cents }
        : { daily: budget.resident_daily_cost_cents, weekly: budget.resident_weekly_cost_cents };
}

function isUuid(value?: string | null) {
    return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

/**
 * Piso diario por persona para la administración. Leer una escritura o un
 * reglamento escaneado de ~50 páginas cuesta del orden de 100–150 mil tokens
 * por lectura, y cada ronda de herramientas del turno vuelve a enviar el PDF:
 * con los 300 mil del cupo de staff, un admin quedaba bloqueado (hasta para un
 * "confirmo") después de uno o dos PDF (18-11-2026). 3 millones alcanzan para
 * 2–3 escrituras de unas 50 páginas al día con su conversación. El tope mensual
 * de la comunidad (tokens y costo) sigue aplicando igual.
 */
export const ADMIN_DAILY_TOKEN_FLOOR = Number(process.env.AI_ADMIN_DAILY_TOKEN_LIMIT || 3_000_000);

export function isAdminRole(role?: string | null) {
    return role === 'admin' || role === 'superadmin';
}

export function dailyLimitForRole(budget: Pick<AiBudget, 'staff_daily_token_limit' | 'resident_daily_token_limit'>, role?: string | null) {
    if (isAdminRole(role)) return Math.max(budget.staff_daily_token_limit, ADMIN_DAILY_TOKEN_FLOOR);
    return role === 'concierge'
        ? budget.staff_daily_token_limit
        : budget.resident_daily_token_limit;
}

function isHeavyAction(actionType?: AiActionType) {
    return actionType === 'image' || actionType === 'course' || actionType === 'extraction';
}

/** Mensaje para la persona: sin jerga, con tildes y con qué puede hacer. */
export function budgetUserMessage(reason: string, role?: string | null) {
    const admin = isAdminRole(role);
    if (reason === 'community_ai_disabled') return admin
        ? 'La IA de CoCo está apagada para esta comunidad. Para activarla, pídeselo a Convive Connect.'
        : 'La IA de CoCo está apagada para esta comunidad. Si la necesitas, coméntalo a la administración.';
    if (reason === 'monthly_token_limit' || reason === 'monthly_cost_limit') return admin
        ? 'Se agotó el presupuesto de IA de la comunidad para este mes. Se renueva el próximo mes; si lo necesitas antes, pide a Convive Connect que amplíe el plan.'
        : 'Se agotó el presupuesto de IA de la comunidad para este mes. Se renueva el próximo mes; si es urgente, coméntalo a la administración.';
    if (reason === 'daily_role_token_limit') return admin
        ? 'Hoy usaste todo el presupuesto de IA de tu cuenta (leer documentos largos lo consume rápido). Se renueva a medianoche. Si necesitas seguir hoy, pide a Convive Connect que amplíe el presupuesto de la comunidad.'
        : 'Hoy usaste todo el presupuesto de IA de tu cuenta. Se renueva a medianoche; si lo necesitas antes, coméntalo a la administración.';
    if (reason === 'daily_person_cost_limit') return admin
        ? 'Hoy llegaste al cupo diario de CoCo de tu cuenta (leer documentos largos lo consume rápido). Se renueva a medianoche.'
        : 'Hoy llegaste al cupo diario de CoCo. Se renueva a medianoche.';
    if (reason === 'weekly_person_cost_limit') return admin
        ? 'Esta semana llegaste al cupo de CoCo de tu cuenta. Se renueva el lunes; si lo necesitas antes, pide a Convive Connect que amplíe el plan.'
        : 'Esta semana llegaste al cupo de CoCo. Se renueva el lunes.';
    if (reason === 'monthly_image_limit') return 'Se agotaron las imágenes con IA de la comunidad para este mes. Se renuevan el próximo mes.';
    if (reason === 'daily_heavy_action_limit') return 'Hoy la comunidad ya usó todas las lecturas de documentos e imágenes con IA del día. Se renuevan a medianoche.';
    return 'No queda presupuesto de IA para esta acción ahora.';
}

async function fetchBudget(communityId?: string | null): Promise<AiBudget> {
    if (!isUuid(communityId)) return defaultBudget();

    try {
        const { data, error } = await getSupabaseAdmin()
            .from('ai_budgets')
            .select('is_enabled, monthly_token_limit, monthly_image_limit, monthly_cost_limit_cents, resident_daily_token_limit, staff_daily_token_limit, heavy_action_daily_limit, staff_daily_cost_cents, staff_weekly_cost_cents, resident_daily_cost_cents, resident_weekly_cost_cents')
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
    // Residente sin condominio: no hay cupo de comunidad, pero su tope personal
    // diario y semanal sí corre (antes quedaba sin límite, 19-11-2026).
    if (!isUuid(communityId) && isUuid(userId)) return fetchPersonalUsage(String(userId));
    if (!isUuid(communityId)) {
        return {
            monthlyTokens: 0,
            monthlyImages: 0,
            monthlyCostCents: 0,
            dailyUserTokens: 0,
            dailyHeavyActions: 0,
            dailyUserCostCents: 0,
            weeklyUserCostCents: 0,
        };
    }

    const { data, error } = await getSupabaseAdmin()
        .from('ai_usage_events')
        .select('user_id, total_tokens, image_count, estimated_cost_cents, action_type, status, created_at, metadata')
        .eq('community_id', communityId)
        // La semana puede empezar el mes anterior.
        .gte('created_at', [monthStart(), chileWeekStart()].sort()[0]);

    if (error) {
        console.warn('[AI Budget] Could not read ai_usage_events:', error.message);
        return {
            monthlyTokens: 0,
            monthlyImages: 0,
            monthlyCostCents: 0,
            dailyUserTokens: 0,
            dailyHeavyActions: 0,
            dailyUserCostCents: 0,
            weeklyUserCostCents: 0,
        };
    }

    const events = (data ?? []) as AiUsageEvent[];
    const day = dayStart();
    const week = chileWeekStart();
    const month = monthStart();
    const successful = events.filter(event => event.status !== 'blocked');
    const thisMonth = successful.filter(event => event.created_at >= month);
    const mine = isUuid(userId) ? successful.filter(event => event.user_id === userId) : [];
    const costOf = (list: AiUsageEvent[]) => list.reduce((sum, event) => sum + Number(event.estimated_cost_cents ?? 0), 0);

    return {
        monthlyTokens: thisMonth.reduce((sum, event) => sum + (event.total_tokens ?? 0), 0),
        monthlyImages: thisMonth.reduce((sum, event) => sum + (event.image_count ?? 0), 0),
        monthlyCostCents: costOf(thisMonth),
        dailyUserCostCents: costOf(mine.filter(event => event.created_at >= day)),
        weeklyUserCostCents: costOf(mine.filter(event => event.created_at >= week)),
        dailyUserTokens: isUuid(userId)
            ? successful
                .filter(event => event.created_at >= day)
                .filter(event => event.user_id === userId)
                .reduce((sum, event) => sum + dailyTokensOf(event), 0)
            : 0,
        dailyHeavyActions: successful
            .filter(event => event.created_at >= day && isHeavyAction(event.action_type ?? undefined))
            .length,
    };
}

/** Uso de una persona sin comunidad: solo su costo del día y de la semana. */
async function fetchPersonalUsage(userId: string) {
    const empty = { monthlyTokens: 0, monthlyImages: 0, monthlyCostCents: 0, dailyUserTokens: 0, dailyHeavyActions: 0, dailyUserCostCents: 0, weeklyUserCostCents: 0 };
    const { data, error } = await getSupabaseAdmin()
        .from('ai_usage_events')
        .select('total_tokens, estimated_cost_cents, status, created_at, metadata')
        .eq('user_id', userId)
        .gte('created_at', chileWeekStart());
    if (error) {
        console.warn('[AI Budget] Could not read personal usage:', error.message);
        return empty;
    }
    const day = dayStart();
    const events = ((data ?? []) as AiUsageEvent[]).filter(event => event.status !== 'blocked');
    const today = events.filter(event => event.created_at >= day);
    const cost = (list: AiUsageEvent[]) => list.reduce((sum, event) => sum + Number(event.estimated_cost_cents ?? 0), 0);
    return { ...empty, dailyUserCostCents: cost(today), weeklyUserCostCents: cost(events), dailyUserTokens: today.reduce((sum, event) => sum + dailyTokensOf(event), 0) };
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
    else if (personCostLimits(budget, input.role).daily > 0 && usage.dailyUserCostCents + estimatedCost > personCostLimits(budget, input.role).daily) reason = 'daily_person_cost_limit';
    else if (personCostLimits(budget, input.role).weekly > 0 && usage.weeklyUserCostCents + estimatedCost > personCostLimits(budget, input.role).weekly) reason = 'weekly_person_cost_limit';
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

    throw new AiBudgetExceededError(budgetUserMessage(reason, input.role), reason);
}

/** Umbrales de uso (en % del tope) en los que CoCo avisa cuánto queda. */
export const ALLOWANCE_NOTICE_THRESHOLDS = [50, 75, 90] as const;

/**
 * Cuánto le queda a una persona de su cupo de CoCo (diario y semanal), en %.
 * null si no hay tope que medir (sin comunidad, o tope en cero).
 */
export async function getPersonAllowance(input: { communityId?: string | null; userId?: string | null; role?: string | null }): Promise<CoCoAllowance | null> {
    if (!isUuid(input.userId)) return null;
    const limits = personCostLimits(await fetchBudget(input.communityId), input.role);
    if (!(limits.daily > 0) && !(limits.weekly > 0)) return null;
    const week = chileWeekStart();
    const { data, error } = await getSupabaseAdmin()
        .from('ai_usage_events')
        .select('estimated_cost_cents, status, created_at')
        .eq('user_id', input.userId)
        .gte('created_at', week);
    if (error) return null;
    const day = dayStart();
    const events = ((data ?? []) as Array<{ estimated_cost_cents: number | null; status: string | null; created_at: string }>)
        .filter(event => event.status !== 'blocked');
    const cost = (list: typeof events) => list.reduce((sum, event) => sum + Number(event.estimated_cost_cents ?? 0), 0);
    return allowanceFrom({ dailyUsed: cost(events.filter(event => event.created_at >= day)), weeklyUsed: cost(events), limits });
}

export function allowanceFrom(input: { dailyUsed: number; weeklyUsed: number; limits: { daily: number; weekly: number } }): CoCoAllowance {
    const left = (used: number, limit: number) => limit > 0 ? Math.max(0, Math.min(100, Math.round(100 - (used / limit) * 100))) : 100;
    return { dailyLeftPct: left(input.dailyUsed, input.limits.daily), weeklyLeftPct: left(input.weeklyUsed, input.limits.weekly) };
}

/**
 * Aviso cuando este turno cruzó un umbral de uso (50 %, 75 %, 90 %) del cupo
 * diario o del semanal. Sin cruce, null: no se repite en cada mensaje.
 */
export function allowanceNotice(before: CoCoAllowance | null, after: CoCoAllowance | null): string | null {
    if (!after) return null;
    const crossed = (prevLeft: number, nowLeft: number) =>
        ALLOWANCE_NOTICE_THRESHOLDS.some(threshold => 100 - prevLeft < threshold && 100 - nowLeft >= threshold);
    const prev = before ?? { dailyLeftPct: 100, weeklyLeftPct: 100 };
    // El semanal manda si es el más apretado.
    if (after.weeklyLeftPct < after.dailyLeftPct && crossed(prev.weeklyLeftPct, after.weeklyLeftPct)) {
        return `Te queda un ${after.weeklyLeftPct} % de tu uso de CoCo de esta semana (se renueva el lunes).`;
    }
    if (crossed(prev.dailyLeftPct, after.dailyLeftPct)) {
        return `Te queda un ${after.dailyLeftPct} % de tu uso de CoCo de hoy (se renueva a medianoche).`;
    }
    return null;
}
