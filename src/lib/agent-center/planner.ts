import Anthropic from '@anthropic-ai/sdk';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromText, isAiBudgetExceededError, recordAiUsage } from '@/lib/ai/budget';
import type { AgentAction, AgentProfile } from '@/lib/agent-center/domain';

export const AGENT_CENTER_CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

export function getAgentPlannerModel() {
    return AGENT_CENTER_CLAUDE_MODEL;
}

const MODEL = AGENT_CENTER_CLAUDE_MODEL;

const PLANNER_TOOL: Anthropic.Tool = {
    name: 'propose_agent_action',
    description: 'Devuelve el siguiente paso operativo seguro para la solicitud del administrador.',
    input_schema: {
        type: 'object',
        properties: {
            agentKey: { type: 'string', enum: ['finance', 'maintenance', 'concierge', 'community'] },
            toolName: {
                type: 'string',
                enum: [
                    'get_my_expenses', 'get_resident_expenses', 'create_unit_expense', 'send_unit_payment_reminder', 'get_community_snapshot', 'answer_community_question', 'clarify_intent', 'create_booking',
                    'create_marketplace_item', 'create_announcement', 'register_visitor',
                    'create_service_request', 'run_playbook',
                ],
            },
            args: { type: 'object', additionalProperties: true },
            requiresConfirmation: { type: 'boolean' },
            title: { type: 'string' },
            summary: { type: 'string' },
            targetHref: { type: 'string' },
            decision: {
                type: 'object',
                properties: {
                    intent: { type: 'string' },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    explanation: { type: 'string' },
                },
                required: ['intent', 'confidence', 'explanation'],
                additionalProperties: false,
            },
        },
        required: ['agentKey', 'toolName', 'args', 'requiresConfirmation', 'title', 'summary', 'targetHref', 'decision'],
        additionalProperties: false,
    },
};

const SYSTEM_PROMPT = `Eres el planificador operativo del Agent Center de Convive Connect, una plataforma de condominios en Chile.
Razona como operador senior del edificio: interpreta la intención, decide si corresponde leer, cruzar datos, pedir precisión o preparar una acción auditable.
Selecciona exactamente una herramienta como siguiente paso. No ejecutes nada ni inventes resultados.

Herramientas disponibles:
- get_resident_expenses: consulta por residentQuery o unitNumber; solo lectura; /admin/finanzas.
- get_my_expenses: consulta gastos de la unidad propia; solo lectura; /resident/finances.
- get_community_snapshot: lectura administrativa de indicadores reales; args { focus: finance|maintenance|community|all }; /admin.
- answer_community_question: investiga preguntas abiertas cruzando todas las fuentes autorizadas del condominio; args { question }; /agent-center.
- create_booking: amenityHint, date YYYY-MM-DD, startTime HH:MM, endTime HH:MM; /amenities.
- create_service_request: description, preferredDate YYYY-MM-DD, preferredTime HH:MM; /services/my-requests.
- register_visitor: visitorName, purpose; /concierge/visitors.
- create_marketplace_item: title, description, price numerico, category electronics|furniture|clothing|other; /marketplace/my-listings.
- create_announcement: title, content, priority info|alert; /comunicaciones.
- run_playbook: playbookKey y requestedText. Claves: finance_collection_review, maintenance_ticket_triage, onboarding_import_review, iot_emergency_readiness, community_broadcast.
- clarify_intent: requestedText; úsala solo cuando falte un dato imprescindible o haya dos interpretaciones materiales.

Reglas obligatorias:
1. Una consulta nunca se transforma en escritura. Las lecturas no requieren confirmacion.
2. Toda escritura y todo playbook requieren confirmacion humana.
3. No inventes nombres, unidades, fechas, horas, montos ni destinatarios. Si falta un dato imprescindible, pregunta solo por ese dato con clarify_intent.
4. Interpreta lenguaje chileno: dpto/depto/departamento/unidad son equivalentes y los montos pueden usar puntos como separador de miles.
5. Para deuda individual de un administrador usa get_resident_expenses. Para crear un cobro puntual de un departamento usa create_unit_expense. Para recordar pago a un departamento usa send_unit_payment_reminder. Para cobranza masiva usa finance_collection_review.
5a. Para preguntas analiticas o de conteo sobre morosidad, tickets, reservas, residentes o estado general usa get_community_snapshot; no uses un playbook si solo pide informacion.
5b. Para diagnósticos, preguntas abiertas, historicas, comparativas o que requieran localizar y cruzar informacion usa answer_community_question. Es de solo lectura y no requiere confirmacion.
5c. No respondas con un menú genérico. Si el usuario pide algo operativo, elige una herramienta; usa clarify_intent solo cuando falte un dato imprescindible para una escritura o exista ambigüedad riesgosa.
6. Si la solicitud combina varias operaciones, elige el playbook apropiado; si no existe, aclara el objetivo prioritario.
7. decision.explanation debe ser una justificacion breve y verificable, no una cadena de pensamiento interna.
8. La respuesta debe ir exclusivamente en la herramienta propose_agent_action.
9. Este Agent Center usa Claude por Anthropic como motor de razonamiento. No derives la decisión a otro proveedor.`;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clean(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function coercePlannedAction(value: unknown): AgentAction | null {
    if (!isRecord(value) || !isRecord(value.args)) return null;
    const agentKey = clean(value.agentKey, 30);
    const toolName = clean(value.toolName, 60);
    if (!['finance', 'maintenance', 'concierge', 'community'].includes(agentKey) || !toolName) return null;

    const rawDecision = isRecord(value.decision) ? value.decision : {};
    const confidence = Number(rawDecision.confidence);
    return {
        agentKey: agentKey as AgentAction['agentKey'],
        toolName: toolName as AgentAction['toolName'],
        args: value.args,
        requiresConfirmation: Boolean(value.requiresConfirmation),
        title: clean(value.title, 140),
        summary: clean(value.summary, 280),
        targetHref: clean(value.targetHref, 120),
        decision: {
            intent: clean(rawDecision.intent, 120),
            confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
            explanation: clean(rawDecision.explanation, 280),
        },
    };
}

export interface PlannerTurn {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * Por qué el Agent Center respondió sin Claude.
 *
 * Antes las tres causas —sin API key, presupuesto agotado, error de la API—
 * devolvían `null` o se tragaban en un `catch`, y el administrador recibía una
 * aclaración genérica indistinguible de una respuesta razonada. El agente
 * parecía tonto cuando en realidad nunca se había ejecutado.
 */
export type PlannerDegradationReason = 'missing_api_key' | 'budget_blocked' | 'api_error' | 'empty_plan';

export interface PlannerDegradation {
    reason: PlannerDegradationReason;
    detail: string;
}

export interface PlannerOutcome {
    action: AgentAction | null;
    degradation: PlannerDegradation | null;
}

const FALLBACK_NOTICE = 'Respondí en modo básico, con reglas por palabras clave.';

const DEGRADATION_DETAIL: Record<PlannerDegradationReason, string> = {
    missing_api_key: `El motor de razonamiento (Claude) no está configurado en este entorno: falta ANTHROPIC_API_KEY. ${FALLBACK_NOTICE}`,
    budget_blocked: `El presupuesto de IA de la comunidad bloqueó la llamada al motor de razonamiento. ${FALLBACK_NOTICE}`,
    api_error: `El motor de razonamiento (Claude) no respondió. ${FALLBACK_NOTICE}`,
    empty_plan: `El motor de razonamiento (Claude) respondió sin una acción utilizable. ${FALLBACK_NOTICE}`,
};

function degraded(reason: PlannerDegradationReason, detail?: string): PlannerOutcome {
    return {
        action: null,
        degradation: { reason, detail: detail || DEGRADATION_DETAIL[reason] },
    };
}

/** El planner de misiones falla igual que el de acción única; comparte el vocabulario. */
export function plannerDegradationFromError(error: unknown): PlannerDegradation {
    if (isAiBudgetExceededError(error)) {
        return { reason: 'budget_blocked', detail: `${error.message} ${FALLBACK_NOTICE}` };
    }
    return { reason: 'api_error', detail: DEGRADATION_DETAIL.api_error };
}

/** Degradación conocida antes de intentar la llamada: no hay con qué razonar. */
export function plannerUnavailableDegradation(): PlannerDegradation | null {
    if (process.env.ANTHROPIC_API_KEY) return null;
    return { reason: 'missing_api_key', detail: DEGRADATION_DETAIL.missing_api_key };
}

export async function planAgentAction(
    message: string,
    profile: AgentProfile,
    history: PlannerTurn[] = [],
): Promise<PlannerOutcome> {
    if (!process.env.ANTHROPIC_API_KEY) {
        // Sin telemetría, un deploy sin la key se ve exactamente igual que un
        // agente que decidió pedir precisión. Queda registrado como 'skipped'.
        await recordAiUsage({
            communityId: profile.community_id,
            userId: profile.id,
            role: profile.role,
            module: 'agent-center.planner',
            provider: 'anthropic',
            model: MODEL,
            actionType: 'other',
            status: 'skipped',
            blockedReason: 'missing_api_key',
            metadata: { degradedTo: 'heuristic' },
        });
        return degraded('missing_api_key');
    }

    const today = new Date().toISOString().slice(0, 10);
    // El contexto reciente se pliega como texto (no como mensajes separados) para
    // que el agente dialogue —resolver "y también para junio", "hazlo para el de
    // al lado"— sin arriesgar la alternancia user/assistant que exige la API con
    // tool_choice forzado.
    const recent = history.slice(-6);
    const contextBlock = recent.length
        ? `\n\nContexto de la conversacion reciente (lo mas nuevo al final):\n${recent
            .map(turn => `${turn.role === 'user' ? 'Admin' : 'CoCo'}: ${turn.content}`)
            .join('\n')}`
        : '';
    const userPrompt = `Fecha actual: ${today}\nRol: ${profile.role || 'sin rol'}\nNombre: ${profile.name || 'Administracion'}\nSolicitud: ${message}${contextBlock}`;
    const estimatedPromptTokens = estimateTokensFromText(`${SYSTEM_PROMPT}\n${userPrompt}`);
    const estimatedCompletionTokens = 900;

    try {
        await enforceAiBudget({
            communityId: profile.community_id,
            userId: profile.id,
            role: profile.role,
            module: 'agent-center.planner',
            provider: 'anthropic',
            model: MODEL,
            actionType: 'other',
            estimatedPromptTokens,
            estimatedCompletionTokens,
        });
    } catch (error) {
        // enforceAiBudget ya dejó el evento 'blocked' en ai_usage_events; aquí
        // solo se traduce el motivo para que el administrador lo vea en el chat.
        if (isAiBudgetExceededError(error)) {
            return degraded('budget_blocked', `${error.message} ${FALLBACK_NOTICE}`);
        }
        throw error;
    }

    const startedAt = Date.now();
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let response: Anthropic.Message;
    try {
        response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 1100,
            temperature: 0,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
            tools: [PLANNER_TOOL],
            tool_choice: { type: 'tool', name: PLANNER_TOOL.name },
        });
    } catch (error) {
        const apiDetail = error instanceof Anthropic.APIError
            ? `HTTP ${error.status}`
            : error instanceof Error ? error.name : 'error desconocido';
        console.warn('[AgentCenterPlanner] Anthropic call failed:', error);
        await recordAiUsage({
            communityId: profile.community_id,
            userId: profile.id,
            role: profile.role,
            module: 'agent-center.planner',
            provider: 'anthropic',
            model: MODEL,
            actionType: 'other',
            promptTokens: estimatedPromptTokens,
            status: 'error',
            blockedReason: 'api_error',
            metadata: {
                latencyMs: Date.now() - startedAt,
                degradedTo: 'heuristic',
                error: error instanceof Error ? error.message.slice(0, 280) : 'unknown',
            },
        });
        return degraded('api_error', `El motor de razonamiento (Claude) no respondió (${apiDetail}). ${FALLBACK_NOTICE}`);
    }

    const promptTokens = response.usage?.input_tokens ?? estimatedPromptTokens;
    const completionTokens = response.usage?.output_tokens ?? estimatedCompletionTokens;
    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === PLANNER_TOOL.name);
    const action = coercePlannedAction(toolUse?.input);

    await recordAiUsage({
        communityId: profile.community_id,
        userId: profile.id,
        role: profile.role,
        module: 'agent-center.planner',
        provider: 'anthropic',
        model: MODEL,
        actionType: 'other',
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCostCents: estimateAiCostCents({ provider: 'anthropic', model: MODEL, promptTokens, completionTokens }),
        status: action ? 'success' : 'error',
        blockedReason: action ? undefined : 'empty_plan',
        metadata: {
            latencyMs: Date.now() - startedAt,
            stopReason: response.stop_reason,
            toolName: action?.toolName,
        },
    });

    return action ? { action, degradation: null } : degraded('empty_plan');
}
