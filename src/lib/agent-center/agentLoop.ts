/**
 * agentLoop.ts — Ciclo agentico del Agent Center.
 *
 * Antes: Claude elegia UNA herramienta por turno (planner.ts) y las misiones
 * solo se activaban si una regex veia dos dominios. Ahora Claude trabaja en un
 * loop de tool use nativo:
 *
 *   1. Recibe el objetivo y las herramientas que el rol del usuario puede usar.
 *   2. Las LECTURAS se ejecutan solas y su resultado vuelve como tool_result;
 *      Claude puede encadenar varias (p. ej. backlog de mantencion -> buscar
 *      proveedor -> estado de estacionamientos) hasta poder responder.
 *   3. Una ESCRITURA pausa el ciclo: se crea (o actualiza) una tarea
 *      `agentic_loop` en waiting_human y la escritura se convierte en una
 *      tarjeta de aprobacion normal del Agent Center. Al confirmarla, la ruta
 *      ejecuta la escritura y el ciclo se reanuda con su resultado.
 *   4. Topes: MAX_AGENT_LOOP_STEPS rondas de Claude por tarea (acumuladas entre
 *      reanudaciones) y el presupuesto de IA (enforceAiBudget en cada ronda).
 *
 * Claude decide si un objetivo es multi-paso o multi-dominio: puede encadenar
 * escrituras una a una o agruparlas con `plan_mission` en una sola aprobacion.
 * La regex `detectMultiIntent` queda solo como pista en el prompt y como
 * respaldo deterministico cuando la API falla.
 */
import Anthropic from '@anthropic-ai/sdk';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromMessages, recordAiUsage } from '@/lib/ai/budget';
import { anthropicModelFor } from '@/lib/ai/modelRouter';
import { validateAgentActionArgs } from '@/lib/agent-center/actionValidation';
import { executeAgentAction } from '@/lib/agent-center/actionExecutor';
import { AGENT_TOOL_DEFINITIONS, validateAgentToolArgs } from '@/lib/agent-center/agentTools';
import { chileTodayISO } from '@/lib/agent-center/chileDate';
import { buildMissionAction, coerceMissionPlan, detectMultiIntent, type AgentExecutionResult } from '@/lib/agent-center/orchestrator';
import {
    appendLoopStep,
    claimLoopTask,
    createLoopRun,
    createLoopTask,
    finishLoopRun,
    getLoopProposalStatus,
    loadLoopTask,
    persistLoopProposal,
    recordLoopToolCall,
    saveLoopTask,
    setLoopStep,
    traceToSteps,
    type LoopState,
    type LoopTaskRecord,
    type LoopTraceEntry,
} from '@/lib/agent-center/agentLoopStore';
import {
    AGENT_PLAYBOOKS,
    MAX_AGENT_LOOP_STEPS,
    MAX_MISSION_STEPS,
    type AgentAction,
    type AgentKey,
    type AgentMissionStep,
    type AgentProfile,
    type ToolName,
} from '@/lib/agent-center/domain';
import type { UserRole } from '@/lib/types';

const LOOP_MODULE = 'agent-center.agent-loop';
const MODEL = anthropicModelFor('agent-center.agent-loop');
const TOOL_RESULT_MAX_CHARS = 12_000;

// ---------------------------------------------------------------------------
// Catalogo de herramientas del ciclo
// ---------------------------------------------------------------------------
type LoopTool = {
    name: string;
    /** Herramienta real que se ejecuta (plan_mission -> run_mission). */
    toolName: ToolName;
    agentKey: AgentKey;
    risk: 'read' | 'write';
    roles: UserRole[];
    label: string;
    targetHref: string;
    tool: Anthropic.Tool;
    validate: (input: Record<string, unknown>, profile: AgentProfile) => Record<string, unknown>;
};

const ADMIN: UserRole[] = ['admin'];
const STAFF: UserRole[] = ['admin', 'concierge'];

function legacyValidator(toolName: ToolName, agentKey: AgentKey) {
    return (input: Record<string, unknown>) => validateAgentActionArgs({
        agentKey, toolName, args: input, requiresConfirmation: false, title: '', summary: '', targetHref: '',
    });
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Anthropic.Tool.InputSchema {
    return { type: 'object', properties, required, additionalProperties: false };
}

function legacyTool(entry: Omit<LoopTool, 'validate' | 'tool' | 'name'> & { description: string; schema: Anthropic.Tool.InputSchema }): LoopTool {
    return {
        name: entry.toolName,
        toolName: entry.toolName,
        agentKey: entry.agentKey,
        risk: entry.risk,
        roles: entry.roles,
        label: entry.label,
        targetHref: entry.targetHref,
        tool: { name: entry.toolName, description: entry.description, input_schema: entry.schema },
        validate: legacyValidator(entry.toolName, entry.agentKey),
    };
}

const LEGACY_TOOLS: LoopTool[] = [
    legacyTool({
        toolName: 'get_resident_expenses', agentKey: 'finance', risk: 'read', roles: ADMIN, label: 'Consultar deuda de residente', targetHref: '/admin/finanzas',
        description: 'Deuda y gastos comunes pendientes de un residente o departamento.',
        schema: objectSchema({ residentQuery: { type: 'string' }, unitNumber: { type: 'string' } }),
    }),
    legacyTool({
        toolName: 'get_community_snapshot', agentKey: 'community', risk: 'read', roles: ADMIN, label: 'Analizar estado del edificio', targetHref: '/admin',
        description: 'Indicadores reales: morosidad, solicitudes abiertas, reservas proximas y residentes.',
        schema: objectSchema({ focus: { type: 'string', enum: ['finance', 'maintenance', 'community', 'all'] } }, ['focus']),
    }),
    legacyTool({
        toolName: 'answer_community_question', agentKey: 'community', risk: 'read', roles: ADMIN, label: 'Investigar en las fuentes de la comunidad', targetHref: '/agent-center',
        description: 'Investigacion abierta que cruza todas las fuentes autorizadas y documentos cargados (actas, reglamentos). Usala para preguntas historicas o que no cubren las otras lecturas.',
        schema: objectSchema({ question: { type: 'string' } }, ['question']),
    }),
    legacyTool({
        toolName: 'create_unit_expense', agentKey: 'finance', risk: 'write', roles: ADMIN, label: 'Crear cobro de gasto comun', targetHref: '/admin/finanzas',
        description: 'Crea un cobro puntual pendiente para un departamento. Requiere confirmacion.',
        schema: objectSchema({ unitNumber: { type: 'string' }, amount: { type: 'number' }, month: { type: 'string', description: 'YYYY-MM' }, dueDate: { type: 'string', description: 'YYYY-MM-DD' }, label: { type: 'string' } }, ['unitNumber', 'amount', 'month', 'dueDate']),
    }),
    legacyTool({
        toolName: 'send_unit_payment_reminder', agentKey: 'finance', risk: 'write', roles: ADMIN, label: 'Enviar recordatorio de cobro', targetHref: '/admin/finanzas',
        description: 'Notificacion privada de cobro a un departamento o residente. Requiere confirmacion.',
        schema: objectSchema({ unitNumber: { type: 'string' }, residentQuery: { type: 'string' }, message: { type: 'string' } }),
    }),
    legacyTool({
        toolName: 'create_announcement', agentKey: 'community', risk: 'write', roles: STAFF, label: 'Publicar comunicado', targetHref: '/comunicaciones',
        description: 'Publica un comunicado oficial visible para toda la comunidad. Requiere confirmacion.',
        schema: objectSchema({ title: { type: 'string' }, content: { type: 'string' }, priority: { type: 'string', enum: ['info', 'alert'] } }, ['title', 'content']),
    }),
    legacyTool({
        toolName: 'create_booking', agentKey: 'maintenance', risk: 'write', roles: ADMIN, label: 'Reservar espacio comun', targetHref: '/amenities',
        description: 'Reserva un espacio comun (quincho, sala). Requiere confirmacion.',
        schema: objectSchema({ amenityHint: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, startTime: { type: 'string', description: 'HH:MM' }, endTime: { type: 'string', description: 'HH:MM' } }, ['amenityHint', 'date', 'startTime', 'endTime']),
    }),
    legacyTool({
        toolName: 'create_service_request', agentKey: 'maintenance', risk: 'write', roles: ADMIN, label: 'Crear ticket de mantencion', targetHref: '/services/my-requests',
        description: 'Crea un ticket nuevo en la mesa de ayuda interna. Requiere confirmacion.',
        schema: objectSchema({ description: { type: 'string' }, preferredDate: { type: 'string' }, preferredTime: { type: 'string' } }, ['description', 'preferredDate', 'preferredTime']),
    }),
    legacyTool({
        toolName: 'register_visitor', agentKey: 'concierge', risk: 'write', roles: ADMIN, label: 'Registrar visita', targetHref: '/concierge/visitors',
        description: 'Registra una visita en la bitacora. Requiere confirmacion.',
        schema: objectSchema({ visitorName: { type: 'string' }, purpose: { type: 'string' } }, ['visitorName']),
    }),
    {
        name: 'run_playbook', toolName: 'run_playbook', agentKey: 'community', risk: 'write', roles: ADMIN, label: 'Ejecutar flujo batch', targetHref: '/agent-center',
        tool: {
            name: 'run_playbook',
            description: `Flujo batch auditable. Claves: ${AGENT_PLAYBOOKS.map(playbook => playbook.key).join(', ')}. Requiere confirmacion.`,
            input_schema: objectSchema({ playbookKey: { type: 'string', enum: AGENT_PLAYBOOKS.map(playbook => playbook.key) }, requestedText: { type: 'string' } }, ['playbookKey', 'requestedText']),
        },
        validate(input) {
            const playbook = AGENT_PLAYBOOKS.find(item => item.key === input.playbookKey);
            if (!playbook) throw new Error('El flujo solicitado no existe.');
            return { playbookKey: playbook.key, requestedText: String(input.requestedText || '').trim().slice(0, 600) };
        },
    },
    {
        name: 'plan_mission', toolName: 'run_mission', agentKey: 'community', risk: 'write', roles: ADMIN, label: 'Mision multi-agente', targetHref: '/agent-center',
        tool: {
            name: 'plan_mission',
            description: `Agrupa entre 2 y ${MAX_MISSION_STEPS} escrituras de distintos dominios en UNA sola aprobacion humana (por ejemplo: crear cobro + publicar comunicado). Usala cuando el objetivo necesita varias escrituras que la persona querria aprobar juntas; para una sola escritura usa su herramienta directa.`,
            input_schema: objectSchema({
                goal: { type: 'string' },
                steps: {
                    type: 'array', minItems: 2, maxItems: MAX_MISSION_STEPS,
                    items: objectSchema({
                        agentKey: { type: 'string', enum: ['finance', 'maintenance', 'concierge', 'community'] },
                        toolName: { type: 'string' },
                        args: { type: 'object', additionalProperties: true },
                        title: { type: 'string' },
                        rationale: { type: 'string' },
                    }, ['agentKey', 'toolName', 'args', 'title', 'rationale']),
                },
            }, ['goal', 'steps']),
        },
        validate(input) {
            const plan = coerceMissionPlan(input);
            if (!plan) throw new Error('La mision no tiene un plan valido (2 a 4 pasos con herramientas permitidas).');
            return validateAgentActionArgs(buildMissionAction(plan));
        },
    },
];

const NEW_TOOLS: LoopTool[] = AGENT_TOOL_DEFINITIONS.map(definition => ({
    name: definition.name,
    toolName: definition.name,
    agentKey: definition.agentKey,
    risk: definition.risk,
    roles: definition.roles,
    label: definition.label,
    targetHref: definition.targetHref,
    tool: definition.tool,
    validate: (input, profile) => validateAgentToolArgs(definition.name, input, profile),
}));

const LOOP_TOOLS: LoopTool[] = [...NEW_TOOLS, ...LEGACY_TOOLS];
const LOOP_TOOLS_BY_NAME = new Map(LOOP_TOOLS.map(tool => [tool.name, tool]));

export type LoopToolFilter = { isAgentActive?: (agentKey: AgentKey) => boolean };

/** Herramientas que Claude ve: solo las del rol y de agentes activos. */
export function loopToolsFor(profile: Pick<AgentProfile, 'role'>, filter: LoopToolFilter = {}): LoopTool[] {
    return LOOP_TOOLS.filter(tool => tool.roles.includes(profile.role) && (filter.isAgentActive?.(tool.agentKey) ?? true));
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Eres CoCo, el operador del Agent Center de Convive Connect (condominios en Chile). Trabajas en un ciclo: usas herramientas, recibes sus resultados y sigues hasta resolver el objetivo.

Como trabajar:
1. Las herramientas de lectura se ejecutan al instante y sin confirmacion. Encadena las que necesites para fundamentar la respuesta o la accion (por ejemplo: leer el backlog antes de asignar un ticket, buscar al residente antes de reservarle un estacionamiento, revisar disponibilidad antes de reservar).
2. Toda herramienta de escritura queda en espera de confirmacion humana. Propon UNA escritura por turno con datos reales obtenidos de las lecturas o de la solicitud; tras la confirmacion recibiras su resultado y podras continuar.
3. Si el objetivo exige varias escrituras de distintos dominios que conviene aprobar juntas, usa plan_mission. Tu decides si el objetivo es de un paso, de varios pasos o multi-dominio.
4. Una consulta nunca se transforma en escritura: si solo piden informacion, responde con texto.
5. No inventes nombres, ids, unidades, fechas, montos ni destinatarios. Usa los ids exactos que devuelven las lecturas. Si falta un dato imprescindible, pregunta solo por ese dato en tu respuesta final.
6. Interpreta lenguaje chileno: dpto/depto/departamento/unidad son equivalentes; los montos usan punto de miles.
7. Respuesta final: español claro, breve, con cifras y fechas concretas. No expongas ids internos ni tu razonamiento interno. Si una herramienta fallo, dilo y sugiere el siguiente paso.
8. Trabajas solo con los datos de la comunidad del usuario; las herramientas ya estan acotadas a ella.`;

function buildUserPrompt(message: string, profile: AgentProfile, history: Array<{ role: 'user' | 'assistant'; content: string }>) {
    const recent = history.slice(-6);
    const context = recent.length
        ? `\n\nConversacion reciente (lo mas nuevo al final):\n${recent.map(turn => `${turn.role === 'user' ? 'Usuario' : 'CoCo'}: ${turn.content.slice(0, 600)}`).join('\n')}`
        : '';
    const hint = detectMultiIntent(message)
        ? '\nPista (heuristica, puede fallar): la solicitud parece cruzar mas de un dominio.'
        : '';
    return `Fecha actual (Chile): ${chileTodayISO()}\nRol: ${profile.role}\nNombre: ${profile.name || 'Administracion'}${hint}\n\nSolicitud: ${message}${context}`;
}

// ---------------------------------------------------------------------------
// Resultado del ciclo
// ---------------------------------------------------------------------------
export type AgentLoopOutcome =
    | { kind: 'answer'; text: string; trace: LoopTraceEntry[]; taskId: string | null; runId: string | null; stepLimitReached: boolean }
    | { kind: 'pause'; action: AgentAction; trace: LoopTraceEntry[]; taskId: string; runId: string | null };

type LoopContext = {
    profile: AgentProfile;
    filter: LoopToolFilter;
    taskId: string | null;
    /**
     * Mensaje original de un ciclo nuevo. La corrida auditada se crea recien
     * cuando Claude responde la primera ronda: si Claude falla (sin red, clave
     * invalida, cuota), la ruta cae al respaldo deterministico / puente CoCo y
     * no debe quedar una corrida huerfana "Ciclo agentico" en la bitacora
     * tapando la corrida real del puente.
     */
    newRunMessage?: string;
};

function toolResultContent(value: unknown) {
    return JSON.stringify(value ?? null).slice(0, TOOL_RESULT_MAX_CHARS);
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function errorText(error: unknown) {
    return error instanceof Error && error.message ? error.message.slice(0, 400) : 'No se pudo completar la herramienta.';
}

function summarizeArgs(args: Record<string, unknown>) {
    return Object.entries(args)
        .filter(([key, value]) => key !== 'steps' && value !== undefined && value !== null && String(value).trim() !== '')
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`.slice(0, 120))
        .join(' · ');
}

function buildWriteAction(tool: LoopTool, args: Record<string, unknown>, state: LoopState, taskId: string): AgentAction {
    const reads = state.trace.filter(entry => entry.status === 'executed');
    const explanation = reads.length
        ? `Propuesta despues de ${reads.length} lectura(s): ${reads.map(entry => entry.title).join(', ')}.`
        : 'Propuesta a partir de los datos de la solicitud.';
    if (tool.toolName === 'run_mission') {
        const mission = buildMissionAction({ goal: String(args.goal || state.goal), steps: (Array.isArray(args.steps) ? args.steps : []) as AgentMissionStep[] });
        return { ...mission, args, agentTaskId: taskId, loopTrace: traceToSteps(state.trace) };
    }
    return {
        agentKey: tool.agentKey,
        toolName: tool.toolName,
        args,
        requiresConfirmation: true,
        title: `${tool.label}`.slice(0, 140),
        summary: (summarizeArgs(args) || tool.label).slice(0, 280),
        targetHref: tool.targetHref,
        decision: { intent: tool.label, confidence: 0.85, explanation: explanation.slice(0, 280) },
        agentTaskId: taskId,
        loopTrace: traceToSteps(state.trace),
    };
}

async function runReadTool(tool: LoopTool, args: Record<string, unknown>, profile: AgentProfile): Promise<AgentExecutionResult> {
    return executeAgentAction({
        agentKey: tool.agentKey,
        toolName: tool.toolName,
        args,
        requiresConfirmation: false,
        title: tool.label,
        summary: tool.label,
        targetHref: tool.targetHref,
    }, profile);
}

/**
 * Corre rondas de Claude desde `state` hasta: respuesta final, pausa por
 * escritura o tope de pasos. Muta `state`.
 */
async function driveLoop(state: LoopState, ctx: LoopContext): Promise<AgentLoopOutcome> {
    const { profile } = ctx;
    const tools = loopToolsFor(profile, ctx.filter);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const startedAt = Date.now();
    let promptTokens = 0;
    let completionTokens = 0;
    let rounds = 0;

    const recordUsage = async (status: 'success' | 'error') => {
        if (!rounds) return;
        await recordAiUsage({
            communityId: profile.community_id, userId: profile.id, role: profile.role,
            module: LOOP_MODULE, provider: 'anthropic', model: MODEL, actionType: 'other',
            promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
            estimatedCostCents: estimateAiCostCents({ provider: 'anthropic', model: MODEL, promptTokens, completionTokens }),
            status,
            metadata: { latencyMs: Date.now() - startedAt, rounds, stepsUsed: state.stepsUsed, taskId: ctx.taskId, tools: state.trace.map(entry => entry.toolName) },
        });
    };

    const persist = async (status: 'running' | 'waiting_human' | 'completed' | 'escalated' | 'cancelled', extra: { lastError?: string | null; result?: Record<string, unknown> } = {}) => {
        if (ctx.taskId) await saveLoopTask(ctx.taskId, status, state, extra);
    };

    try {
        while (state.stepsUsed < MAX_AGENT_LOOP_STEPS) {
            await enforceAiBudget({
                communityId: profile.community_id, userId: profile.id, role: profile.role,
                module: LOOP_MODULE, provider: 'anthropic', model: MODEL, actionType: 'other',
                estimatedPromptTokens: estimateTokensFromMessages(state.messages) + 3000,
                estimatedCompletionTokens: 1500,
            });

            const response = await anthropic.messages.create({
                model: MODEL,
                max_tokens: 1500,
                // tools + system se cachean juntos: son identicos en todas las rondas.
                system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
                tools: tools.map(tool => tool.tool),
                tool_choice: { type: 'auto', disable_parallel_tool_use: true },
                messages: state.messages,
            });
            rounds += 1;
            state.stepsUsed += 1;
            if (!state.runId && ctx.newRunMessage) {
                state.runId = await createLoopRun(profile, ctx.newRunMessage);
            }
            promptTokens += (response.usage?.input_tokens || 0)
                + (response.usage?.cache_creation_input_tokens || 0)
                + (response.usage?.cache_read_input_tokens || 0);
            completionTokens += response.usage?.output_tokens || 0;

            const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
            if (!toolUses.length) {
                const text = response.content
                    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
                    .map(block => block.text).join('\n').trim()
                    || 'No pude formular una respuesta con los datos disponibles.';
                state.messages.push({ role: 'assistant', content: response.content });
                await persist('completed', { lastError: null, result: { answer: text.slice(0, 2000), stepsUsed: state.stepsUsed } });
                await finishLoopRun(state.runId, 'executed', text.slice(0, 280));
                await recordUsage('success');
                return { kind: 'answer', text, trace: state.trace, taskId: ctx.taskId, runId: state.runId, stepLimitReached: false };
            }

            state.messages.push({ role: 'assistant', content: response.content });
            const results: Anthropic.ToolResultBlockParam[] = [];
            let pause: { tool: LoopTool; toolUse: Anthropic.ToolUseBlock; args: Record<string, unknown> } | null = null;

            for (const toolUse of toolUses) {
                const tool = LOOP_TOOLS_BY_NAME.get(toolUse.name);
                const input = asRecord(toolUse.input);
                const allowed = tool && tools.includes(tool);
                if (!tool || !allowed) {
                    // Defensa en profundidad: Claude solo ve las herramientas de su
                    // rol, pero si nombra otra no se ejecuta y queda auditado.
                    const agentKey = tool?.agentKey || 'community';
                    state.trace.push({ toolName: toolUse.name, agentKey, title: tool?.label || toolUse.name, message: 'Herramienta no permitida para este rol o agente inactivo.', status: 'denied' });
                    await recordLoopToolCall(profile, state.runId, { toolName: toolUse.name, args: input, result: { error: 'forbidden' }, status: 'rejected' });
                    results.push({ type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: 'Herramienta no permitida para tu rol. No se ejecuto.' });
                    continue;
                }

                let args: Record<string, unknown>;
                try {
                    args = tool.validate(input, profile);
                } catch (error) {
                    state.trace.push({ toolName: tool.toolName, agentKey: tool.agentKey, title: tool.label, message: errorText(error), status: 'failed' });
                    await recordLoopToolCall(profile, state.runId, { toolName: tool.toolName, args: input, result: { error: errorText(error) }, status: 'failed' });
                    results.push({ type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: `Argumentos invalidos: ${errorText(error)}` });
                    continue;
                }

                if (tool.risk === 'write') {
                    if (pause) {
                        results.push({ type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: 'Solo se propone una escritura por turno. Vuelve a proponerla despues de la confirmacion.' });
                    } else {
                        pause = { tool, toolUse, args };
                    }
                    continue;
                }

                try {
                    const result = await runReadTool(tool, args, profile);
                    state.trace.push({ toolName: tool.toolName, agentKey: tool.agentKey, title: result.title || tool.label, message: result.message, status: 'executed' });
                    await recordLoopToolCall(profile, state.runId, { toolName: tool.toolName, args, result: { title: result.title, message: result.message, entityType: result.entityType }, status: 'executed' });
                    if (ctx.taskId) await appendLoopStep(ctx.taskId, state.nextPosition, { key: `loop_${state.nextPosition}_${tool.toolName}`, title: result.title || tool.label, status: 'completed', input: args, output: { message: result.message } });
                    if (ctx.taskId) state.nextPosition += 1;
                    results.push({ type: 'tool_result', tool_use_id: toolUse.id, content: toolResultContent({ title: result.title, message: result.message, data: result.data }) });
                } catch (error) {
                    state.trace.push({ toolName: tool.toolName, agentKey: tool.agentKey, title: tool.label, message: errorText(error), status: 'failed' });
                    await recordLoopToolCall(profile, state.runId, { toolName: tool.toolName, args, result: { error: errorText(error) }, status: 'failed' });
                    results.push({ type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: errorText(error) });
                }
            }

            if (pause) {
                return await pauseForWrite(state, ctx, pause, results, recordUsage);
            }

            state.messages.push({ role: 'user', content: results });
            await persist('running');
        }

        // Tope de pasos: no se llama a Claude otra vez. Se entrega lo que hay.
        const done = state.trace.filter(entry => entry.status === 'executed');
        const text = `Alcance el limite de ${MAX_AGENT_LOOP_STEPS} pasos sin cerrar el objetivo. `
            + (done.length ? `Alcance a revisar: ${done.map(entry => `${entry.title} (${entry.message})`).join('; ')}. ` : '')
            + 'Reformula la solicitud con mas precision o dividela en partes.';
        await persist('escalated', { lastError: `Limite de ${MAX_AGENT_LOOP_STEPS} pasos alcanzado.` });
        await finishLoopRun(state.runId, 'executed', text.slice(0, 280));
        await recordUsage('success');
        return { kind: 'answer', text, trace: state.trace, taskId: ctx.taskId, runId: state.runId, stepLimitReached: true };
    } catch (error) {
        await recordUsage('error').catch(() => undefined);
        await finishLoopRun(state.runId, 'failed', errorText(error)).catch(() => undefined);
        if (ctx.taskId) await saveLoopTask(ctx.taskId, 'escalated', state, { lastError: errorText(error) }).catch(() => undefined);
        throw error;
    }
}

async function pauseForWrite(
    state: LoopState,
    ctx: LoopContext,
    pause: { tool: LoopTool; toolUse: Anthropic.ToolUseBlock; args: Record<string, unknown> },
    partialResults: Anthropic.ToolResultBlockParam[],
    recordUsage: (status: 'success' | 'error') => Promise<void>,
): Promise<AgentLoopOutcome> {
    const { profile } = ctx;
    const { tool, toolUse, args } = pause;
    if (!ctx.taskId) {
        // La tarea nace en la primera escritura: las lecturas previas quedan
        // como pasos completados, y la escritura como paso en espera.
        const steps = state.trace.map((entry, index) => ({
            key: `loop_${index}_${entry.toolName}`,
            title: entry.title,
            status: entry.status === 'executed' ? 'completed' as const : 'skipped' as const,
            output: { message: entry.message },
        }));
        state.nextPosition = steps.length;
        state.pending = { toolUseId: toolUse.id, toolName: tool.name, agentKey: tool.agentKey, args, position: state.nextPosition, partialResults, proposalId: null };
        ctx.taskId = await createLoopTask(profile, tool.agentKey, state, [
            ...steps,
            { key: `loop_${state.nextPosition}_${tool.toolName}`, title: `Esperando confirmacion: ${tool.label}`, status: 'waiting_human', input: args },
        ]);
    } else {
        state.pending = { toolUseId: toolUse.id, toolName: tool.name, agentKey: tool.agentKey, args, position: state.nextPosition, partialResults, proposalId: null };
        await appendLoopStep(ctx.taskId, state.nextPosition, { key: `loop_${state.nextPosition}_${tool.toolName}`, title: `Esperando confirmacion: ${tool.label}`, status: 'waiting_human', input: args });
    }
    state.nextPosition += 1;
    await saveLoopTask(ctx.taskId, 'waiting_human', state, { lastError: null });
    await finishLoopRun(state.runId, 'awaiting_confirmation', `Esperando confirmacion: ${tool.label}`);
    await recordUsage('success');
    return { kind: 'pause', action: buildWriteAction(tool, args, state, ctx.taskId), trace: state.trace, taskId: ctx.taskId, runId: state.runId };
}

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/** Inicia un ciclo para un mensaje nuevo. Devuelve null si Claude no esta configurado. */
export async function runAgentLoop(input: {
    message: string;
    profile: AgentProfile;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    filter?: LoopToolFilter;
}): Promise<AgentLoopOutcome | null> {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    if (!input.profile.community_id) throw new Error('Tu perfil no tiene una comunidad asignada.');
    const state: LoopState = {
        // La corrida se crea en driveLoop tras la primera respuesta de Claude.
        runId: null,
        goal: input.message.slice(0, 700),
        messages: [{ role: 'user', content: buildUserPrompt(input.message, input.profile, input.history || []) }],
        stepsUsed: 0,
        nextPosition: 0,
        trace: [],
        pending: null,
    };
    return driveLoop(state, { profile: input.profile, filter: input.filter || {}, taskId: null, newRunMessage: input.message });
}

/** La ruta llama esto despues de persistir la tarjeta de aprobacion de la escritura. */
export async function attachLoopProposal(profile: AgentProfile, taskId: string, proposalId: string) {
    const task = await loadLoopTask(profile, taskId);
    if (!task?.state.pending) throw new Error('La tarea agentica no tiene una escritura pendiente.');
    task.state.pending.proposalId = proposalId;
    await saveLoopTask(task.id, 'waiting_human', task.state);
}

async function requireWaitingTask(profile: AgentProfile, taskId: string, proposalId: string) {
    const task = await loadLoopTask(profile, taskId);
    if (!task) throw new Error('La tarea agentica no existe en tu comunidad.');
    if (task.status !== 'waiting_human' || !task.state.pending) throw new Error('La tarea agentica no esta esperando una confirmacion.');
    if (task.state.pending.proposalId !== proposalId) throw new Error('La confirmacion no corresponde a la escritura pendiente de esta tarea.');
    return task;
}

/** Lleva el resultado de la escritura a Claude como tool_result y sigue el ciclo. */
async function resumeWithWriteResult(profile: AgentProfile, task: LoopTaskRecord, outcome: { ok: true; result: Record<string, unknown> } | { ok: false; error: string }, filter: LoopToolFilter) {
    const state = task.state;
    const pending = state.pending!;
    const tool = LOOP_TOOLS_BY_NAME.get(pending.toolName);
    const label = tool?.label || pending.toolName;
    const message = outcome.ok ? String(outcome.result.message || 'Escritura ejecutada.') : outcome.error;
    state.trace.push({ toolName: tool?.toolName || pending.toolName, agentKey: pending.agentKey, title: label, message, status: outcome.ok ? 'executed' : 'failed' });
    await setLoopStep(task.id, pending.position, outcome.ok ? 'completed' : 'failed', { message }, outcome.ok ? null : message);
    state.messages.push({
        role: 'user',
        content: [
            ...pending.partialResults,
            outcome.ok
                ? { type: 'tool_result', tool_use_id: pending.toolUseId, content: toolResultContent({ confirmadoPorHumano: true, ...outcome.result }) }
                : { type: 'tool_result', tool_use_id: pending.toolUseId, is_error: true, content: `La escritura confirmada fallo: ${outcome.error}` },
        ],
    });
    state.pending = null;
    // Se guarda ANTES de llamar a Claude: si la API falla, la tarea queda
    // escalada con el resultado ya incorporado y `resume` continua desde aqui.
    await saveLoopTask(task.id, 'running', state, { lastError: null });
    return driveLoop(state, { profile, filter, taskId: task.id });
}

/** Camino de la ruta: el humano confirmo la tarjeta y la escritura ya se ejecuto. */
export async function continueAgentLoopAfterWrite(input: {
    profile: AgentProfile;
    taskId: string;
    proposalId: string;
    result: AgentExecutionResult;
    filter?: LoopToolFilter;
}): Promise<AgentLoopOutcome> {
    const task = await requireWaitingTask(input.profile, input.taskId, input.proposalId);
    if (!await claimLoopTask(input.profile, task)) throw new Error('Otro proceso ya retomo esta tarea.');
    return resumeWithWriteResult(input.profile, task, {
        ok: true,
        result: { title: input.result.title, message: input.result.message, entityType: input.result.entityType, entityId: input.result.entityId, data: input.result.data },
    }, input.filter || {});
}

/** El humano rechazo la escritura: la tarea se cancela sin volver a llamar a Claude. */
export async function cancelAgentLoopTask(profile: AgentProfile, taskId: string, proposalId: string) {
    const task = await requireWaitingTask(profile, taskId, proposalId);
    const pending = task.state.pending!;
    await setLoopStep(task.id, pending.position, 'skipped', { message: 'Rechazada por la persona.' });
    task.state.pending = null;
    await saveLoopTask(task.id, 'cancelled', task.state, { lastError: null, result: { reason: 'rejected_by_human' } });
}

/**
 * Camino de `tasks/[id]/resume`. Devuelve null si la tarea no es un ciclo
 * agentico (la ruta sigue con los playbooks de siempre).
 *  - waiting_human con la tarjeta aun sin decidir: no aprueba nada por su cuenta.
 *  - waiting_human con la tarjeta ya ejecutada/fallida: continua con ese resultado
 *    (p. ej. si la API cayo justo despues de confirmar).
 *  - escalated/failed o running colgado: reintenta desde la transcripcion guardada.
 */
export async function resumeAgentLoopTask(profile: AgentProfile, taskId: string, filter: LoopToolFilter = {}): Promise<{ result: AgentExecutionResult; outcome: AgentLoopOutcome } | null> {
    const task = await loadLoopTask(profile, taskId);
    if (!task) return null;

    let outcome: AgentLoopOutcome;
    if (task.status === 'waiting_human' && task.state.pending) {
        const proposalId = task.state.pending.proposalId;
        const proposal = proposalId ? await getLoopProposalStatus(profile, proposalId) : null;
        if (!proposal || proposal.status === 'proposed') {
            throw new Error('La tarea espera que confirmes o rechaces la accion propuesta en el Agent Center.');
        }
        if (proposal.status === 'rejected') {
            await cancelAgentLoopTask(profile, task.id, proposalId!);
            return { result: { entityType: 'agent_task', entityId: task.id, title: 'Tarea cancelada', message: 'La accion propuesta fue rechazada; la tarea quedo cancelada.', targetHref: '/agent-center' }, outcome: { kind: 'answer', text: 'Tarea cancelada.', trace: task.state.trace, taskId: task.id, runId: task.state.runId, stepLimitReached: false } };
        }
        if (!await claimLoopTask(profile, task)) throw new Error('Otro proceso ya retomo esta tarea.');
        outcome = await resumeWithWriteResult(profile, task, proposal.status === 'executed'
            ? { ok: true, result: proposal.result }
            : { ok: false, error: String(proposal.result.error || 'La escritura fallo.') }, filter);
    } else {
        const stale = task.status === 'running' && Date.parse(task.updatedAt) < Date.now() - 5 * 60 * 1000;
        if (!stale && !['escalated', 'failed'].includes(task.status)) throw new Error('La tarea ya esta en ejecucion o finalizada.');
        if (task.state.pending) throw new Error('La tarea tiene una escritura pendiente de confirmacion.');
        if (!await claimLoopTask(profile, task)) throw new Error('Otro proceso ya retomo esta tarea.');
        if (task.state.stepsUsed >= MAX_AGENT_LOOP_STEPS) {
            throw new Error(`La tarea ya uso sus ${MAX_AGENT_LOOP_STEPS} pasos. Inicia una nueva solicitud.`);
        }
        outcome = await driveLoop(task.state, { profile, filter, taskId: task.id });
    }

    if (outcome.kind === 'pause') {
        const audit = await persistLoopProposal(profile, outcome.action);
        if (!audit.toolCallId) throw new Error('No se pudo registrar la propuesta en la auditoria.');
        await attachLoopProposal(profile, outcome.taskId, audit.toolCallId);
        return {
            result: { entityType: 'agent_task', entityId: outcome.taskId, title: 'Esperando confirmacion', message: `La tarea avanzo y quedo esperando tu confirmacion: ${outcome.action.title}. La encontraras en las propuestas pendientes.`, targetHref: '/agent-center' },
            outcome: { ...outcome, action: { ...outcome.action, proposalId: audit.toolCallId, runId: audit.runId } },
        };
    }
    return {
        result: { entityType: 'agent_task', entityId: task.id, title: outcome.stepLimitReached ? 'Tarea escalada' : 'Tarea completada', message: outcome.text, targetHref: '/agent-center' },
        outcome,
    };
}
