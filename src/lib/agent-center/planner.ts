import Anthropic from '@anthropic-ai/sdk';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromText, recordAiUsage } from '@/lib/ai/budget';
import type { AgentAction, AgentProfile } from '@/lib/agent-center/domain';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

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
                    'get_my_expenses', 'get_resident_expenses', 'get_community_snapshot', 'clarify_intent', 'create_booking',
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
Selecciona exactamente una herramienta como siguiente paso. No ejecutes nada ni inventes resultados.

Herramientas disponibles:
- get_resident_expenses: consulta por residentQuery o unitNumber; solo lectura; /admin/finanzas.
- get_my_expenses: consulta gastos de la unidad propia; solo lectura; /resident/finances.
- get_community_snapshot: lectura administrativa de indicadores reales; args { focus: finance|maintenance|community|all }; /admin.
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
5. Para deuda individual de un administrador usa get_resident_expenses. Para cobranza masiva usa finance_collection_review.
5a. Para preguntas analiticas o de conteo sobre morosidad, tickets, reservas, residentes o estado general usa get_community_snapshot; no uses un playbook si solo pide informacion.
6. Si la solicitud combina varias operaciones, elige el playbook apropiado; si no existe, aclara el objetivo prioritario.
7. decision.explanation debe ser una justificacion breve y verificable, no una cadena de pensamiento interna.
8. La respuesta debe ir exclusivamente en la herramienta propose_agent_action.`;

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

export async function planAgentAction(message: string, profile: AgentProfile): Promise<AgentAction | null> {
    if (!process.env.ANTHROPIC_API_KEY) return null;

    const today = new Date().toISOString().slice(0, 10);
    const userPrompt = `Fecha actual: ${today}\nRol: ${profile.role || 'sin rol'}\nNombre: ${profile.name || 'Administracion'}\nSolicitud: ${message}`;
    const estimatedPromptTokens = estimateTokensFromText(`${SYSTEM_PROMPT}\n${userPrompt}`);
    const estimatedCompletionTokens = 900;

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

    const startedAt = Date.now();
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1100,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [PLANNER_TOOL],
        tool_choice: { type: 'tool', name: PLANNER_TOOL.name },
    });

    const promptTokens = response.usage?.input_tokens ?? estimatedPromptTokens;
    const completionTokens = response.usage?.output_tokens ?? estimatedCompletionTokens;
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
        status: 'success',
        metadata: { latencyMs: Date.now() - startedAt, stopReason: response.stop_reason },
    });

    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === PLANNER_TOOL.name);
    return coercePlannedAction(toolUse?.input);
}
