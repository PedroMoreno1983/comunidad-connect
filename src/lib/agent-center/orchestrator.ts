import Anthropic from '@anthropic-ai/sdk';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromText, recordAiUsage } from '@/lib/ai/budget';
import {
    AGENT_TOOL_NAMES,
    MAX_MISSION_STEPS,
    type AgentAction,
    type AgentKey,
    type AgentMissionPlan,
    type AgentMissionStep,
    type AgentPlaybook,
    type AgentProfile,
    type ToolName,
} from '@/lib/agent-center/domain';
import { normalizeIntentText } from '@/lib/agent-center/intentSafety';
import { coercePlannedAction, getAgentPlannerModel } from '@/lib/agent-center/planner';
import { completeAgentTask, createAgentTask, failAgentTask, runVerifiedTaskStep } from '@/lib/agent-center/taskEngine';

const MODEL = getAgentPlannerModel();
const MAX_STEPS = MAX_MISSION_STEPS;

export type AgentExecutionResult = {
    entityType: string;
    entityId: string | null;
    title: string;
    message: string;
    targetHref?: string;
    data?: unknown;
};

export type MissionStepExecutor = (action: AgentAction, profile: AgentProfile) => Promise<AgentExecutionResult>;

// ---------------------------------------------------------------------------
// Deteccion de intencion multi-dominio: una mision solo tiene sentido cuando
// el objetivo cruza al menos dos agentes.
// ---------------------------------------------------------------------------
const DOMAIN_HINTS: Array<[AgentKey, RegExp]> = [
    ['finance', /\b(cobro|cobranza|cobrar|gasto|pago|deuda|moros\w*|recordatorio|finanzas)\b/],
    ['maintenance', /\b(ticket|mantencion|mantenimiento|reserva|reservar|quincho|proveedor|falla|ascensor|filtracion)\b/],
    ['concierge', /\b(visita|visitante|paquete|encomienda|ingreso|conserje)\b/],
    ['community', /\b(comunicado|anuncio|marketplace|publica\w*|vender|votacion|residente|difusion)\b/],
];

export function detectMultiIntent(message: string): boolean {
    const normalized = normalizeIntentText(message);
    const domains = new Set<AgentKey>();
    for (const [agentKey, pattern] of DOMAIN_HINTS) {
        if (pattern.test(normalized)) domains.add(agentKey);
    }
    return domains.size >= 2;
}

// ---------------------------------------------------------------------------
// Planner de misiones: Claude descompone el objetivo en pasos por agente.
// ---------------------------------------------------------------------------
const MISSION_TOOL: Anthropic.Tool = {
    name: 'propose_agent_mission',
    description: 'Descompone un objetivo multi-dominio en pasos ordenados, cada uno asignado al agente correcto.',
    input_schema: {
        type: 'object',
        properties: {
            goal: { type: 'string' },
            steps: {
                type: 'array',
                minItems: 2,
                maxItems: MAX_STEPS,
                items: {
                    type: 'object',
                    properties: {
                        agentKey: { type: 'string', enum: ['finance', 'maintenance', 'concierge', 'community'] },
                        toolName: { type: 'string', enum: AGENT_TOOL_NAMES.filter(name => name !== 'run_mission') },
                        args: { type: 'object', additionalProperties: true },
                        title: { type: 'string' },
                        rationale: { type: 'string' },
                    },
                    required: ['agentKey', 'toolName', 'args', 'title', 'rationale'],
                    additionalProperties: false,
                },
            },
        },
        required: ['goal', 'steps'],
        additionalProperties: false,
    },
};

const MISSION_SYSTEM_PROMPT = `Eres el orquestador multi-agente del Agent Center de Convive Connect (condominios en Chile).
Recibes un objetivo del administrador que cruza varios dominios y lo descompones en pasos ordenados.

Reglas obligatorias:
1. Cada paso usa exactamente una herramienta permitida y el agente dueno de ese dominio.
2. Ordena los pasos de modo que las lecturas y dependencias vayan primero.
3. No inventes nombres, unidades, fechas, montos ni destinatarios: usa solo datos presentes en la solicitud; si falta un dato imprescindible, el primer paso debe ser clarify_intent pidiendo ese dato.
4. Entre 2 y ${MAX_STEPS} pasos. No uses run_playbook salvo que el objetivo pida expresamente un flujo batch completo.
5. rationale debe ser una justificacion breve y verificable del paso.
6. Responde exclusivamente con la herramienta propose_agent_mission.

Herramientas y agentes:
- finance: get_resident_expenses {residentQuery|unitNumber}, get_my_expenses {}, create_unit_expense {unitNumber, amount, month, dueDate, label}, send_unit_payment_reminder {unitNumber|residentQuery, message}.
- maintenance: create_booking {amenityHint, date, startTime, endTime}, create_service_request {description, preferredDate, preferredTime}, get_community_snapshot {focus}.
- concierge: register_visitor {visitorName, purpose}.
- community: create_marketplace_item {title, description, price, category}, create_announcement {title, content, priority}, answer_community_question {question}, get_community_snapshot {focus}.
- Cualquiera: clarify_intent {requestedText}.`;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clean(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function coerceMissionPlan(value: unknown): AgentMissionPlan | null {
    if (!isRecord(value) || !Array.isArray(value.steps)) return null;
    const goal = clean(value.goal, 280);
    const steps: AgentMissionStep[] = [];
    for (const raw of value.steps.slice(0, MAX_STEPS)) {
        if (!isRecord(raw)) return null;
        const coerced = coercePlannedAction({
            ...raw,
            requiresConfirmation: true,
            summary: clean(raw.rationale, 280),
            targetHref: '/agent-center',
            decision: { intent: goal || 'Paso de mision', confidence: 0.8, explanation: clean(raw.rationale, 280) },
        });
        if (!coerced || coerced.toolName === 'run_mission' || coerced.toolName === 'run_playbook') return null;
        steps.push({
            agentKey: coerced.agentKey,
            toolName: coerced.toolName,
            args: coerced.args,
            title: coerced.title || `Paso ${steps.length + 1}`,
            rationale: clean(raw.rationale, 280),
        });
    }
    if (steps.length < 2) return null;
    return { goal: goal || 'Mision multi-agente', steps };
}

export async function planAgentMission(message: string, profile: AgentProfile): Promise<AgentMissionPlan | null> {
    if (!process.env.ANTHROPIC_API_KEY) return null;

    const today = new Date().toISOString().slice(0, 10);
    const userPrompt = `Fecha actual: ${today}\nRol: ${profile.role || 'sin rol'}\nObjetivo: ${message}`;
    const estimatedPromptTokens = estimateTokensFromText(`${MISSION_SYSTEM_PROMPT}\n${userPrompt}`);
    const estimatedCompletionTokens = 1400;

    await enforceAiBudget({
        communityId: profile.community_id,
        userId: profile.id,
        role: profile.role,
        module: 'agent-center.mission-planner',
        provider: 'anthropic',
        model: MODEL,
        actionType: 'other',
        estimatedPromptTokens,
        estimatedCompletionTokens,
    });

    const startedAt = Date.now();
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1600,
        temperature: 0,
        system: MISSION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [MISSION_TOOL],
        tool_choice: { type: 'tool', name: MISSION_TOOL.name },
    });

    const promptTokens = response.usage?.input_tokens ?? estimatedPromptTokens;
    const completionTokens = response.usage?.output_tokens ?? estimatedCompletionTokens;
    await recordAiUsage({
        communityId: profile.community_id,
        userId: profile.id,
        role: profile.role,
        module: 'agent-center.mission-planner',
        provider: 'anthropic',
        model: MODEL,
        actionType: 'other',
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCostCents: estimateAiCostCents({ provider: 'anthropic', model: MODEL, promptTokens, completionTokens }),
        status: 'success',
        metadata: { latencyMs: Date.now() - startedAt, stopReason: response.stop_reason },
    });

    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === MISSION_TOOL.name);
    return coerceMissionPlan(toolUse?.input);
}

export function buildMissionAction(plan: AgentMissionPlan): AgentAction {
    const agentSummary = plan.steps.map((step, index) => `${index + 1}. ${step.title}`).join(' · ');
    return {
        agentKey: plan.steps[0].agentKey,
        toolName: 'run_mission',
        args: { goal: plan.goal, steps: plan.steps },
        requiresConfirmation: true,
        title: `Mision multi-agente: ${plan.goal}`,
        summary: `CoCo coordinara ${plan.steps.length} agentes: ${agentSummary}.`,
        targetHref: '/agent-center',
        decision: {
            intent: 'Orquestacion multi-agente',
            confidence: 0.85,
            explanation: `El objetivo cruza ${new Set(plan.steps.map(step => step.agentKey)).size} dominios; se descompuso en ${plan.steps.length} pasos auditables.`,
        },
    };
}

// ---------------------------------------------------------------------------
// Ejecucion: la mision corre como tarea persistente con pasos verificados.
// Cada paso se ejecuta con el mismo pipeline (validacion + ejecucion real) y
// su resultado queda disponible como contexto para los siguientes.
// ---------------------------------------------------------------------------
function missionPlaybook(goal: string, steps: AgentMissionStep[], leadAgent: AgentKey): AgentPlaybook {
    return {
        key: 'multi_agent_mission',
        agentKey: leadAgent,
        name: 'Mision multi-agente',
        description: goal,
        targetHref: '/agent-center',
        requiresAdmin: true,
        steps: steps.map(step => step.title),
    };
}

export async function executeAgentMission(action: AgentAction, profile: AgentProfile, executeStep: MissionStepExecutor) {
    const plan = coerceMissionPlan({ goal: action.args.goal, steps: action.args.steps });
    if (!plan) throw new Error('La mision no tiene un plan valido. Vuelve a generarla.');

    const playbook = missionPlaybook(plan.goal, plan.steps, action.agentKey);
    const taskId = await createAgentTask(
        profile,
        playbook,
        plan.goal,
        plan.steps.map((step, index) => ({
            key: `step_${index}_${step.toolName}`,
            title: step.title,
            input: { agentKey: step.agentKey, toolName: step.toolName, args: step.args, rationale: step.rationale },
        })),
        { orchestration: 'multi_agent', agents: Array.from(new Set(plan.steps.map(step => step.agentKey))) },
    );

    const results: Array<{ step: string; agentKey: AgentKey; toolName: ToolName; title: string; message: string }> = [];
    try {
        for (let index = 0; index < plan.steps.length; index += 1) {
            const step = plan.steps[index];
            const priorContext = results.map(result => `${result.title}: ${result.message}`).join(' | ');
            const result = await runVerifiedTaskStep(taskId, index, async () => {
                return executeStep({
                    agentKey: step.agentKey,
                    toolName: step.toolName,
                    args: { ...step.args, missionContext: priorContext || undefined },
                    requiresConfirmation: false,
                    title: step.title,
                    summary: step.rationale,
                    targetHref: '/agent-center',
                }, profile);
            }, {
                output: value => ({ title: value.title, message: value.message, entityType: value.entityType, entityId: value.entityId }),
            });
            results.push({ step: step.title, agentKey: step.agentKey, toolName: step.toolName, title: result.title, message: result.message });
        }

        const summary = {
            taskId,
            goal: plan.goal,
            stepsCompleted: results.length,
            agents: Array.from(new Set(results.map(result => result.agentKey))),
            results,
        };
        await completeAgentTask(taskId, summary);
        return {
            entityType: 'agent_task',
            entityId: taskId,
            title: 'Mision completada',
            message: `Complete la mision "${plan.goal}" con ${results.length} paso(s) verificado(s): ${results.map(result => result.title).join(' → ')}.`,
            targetHref: '/agent-center',
            data: summary,
        };
    } catch (error) {
        await failAgentTask(taskId, error);
        throw error;
    }
}
