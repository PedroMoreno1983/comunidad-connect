/**
 * agentLoopStore.ts — Persistencia del ciclo agentico.
 *
 * No crea tablas nuevas: reutiliza la auditoria existente (agent_runs +
 * agent_tool_calls, migracion 029) y el motor de tareas (agent_tasks +
 * agent_task_steps, migracion 052). El estado del ciclo (transcripcion con
 * Claude, pasos usados, escritura pendiente) vive en `agent_tasks.context.loop`.
 *
 * Toda lectura de una tarea filtra por `community_id` del perfil: una tarea de
 * otra comunidad simplemente "no existe".
 */
import type Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { bestEffortInsert } from '@/lib/agent-center/utils';
import { appendAgentTaskStep, createAgentTask, setAgentTaskStep } from '@/lib/agent-center/taskEngine';
import type { AgentAction, AgentKey, AgentProfile, AgentTaskStatus, AgentTaskStepStatus, AgentStep } from '@/lib/agent-center/domain';

export const AGENT_LOOP_PLAYBOOK_KEY = 'agentic_loop' as const;

export type LoopTraceEntry = {
    toolName: string;
    agentKey: AgentKey;
    title: string;
    message: string;
    status: 'executed' | 'failed' | 'denied';
};

export type LoopPendingWrite = {
    toolUseId: string;
    toolName: string;
    agentKey: AgentKey;
    args: Record<string, unknown>;
    position: number;
    /** tool_result de las lecturas que vinieron en la misma respuesta. */
    partialResults: Anthropic.ToolResultBlockParam[];
    /** agent_tool_calls.id de la tarjeta de aprobacion; lo fija la ruta al persistirla. */
    proposalId: string | null;
};

export type LoopState = {
    runId: string | null;
    goal: string;
    messages: Anthropic.MessageParam[];
    stepsUsed: number;
    nextPosition: number;
    trace: LoopTraceEntry[];
    pending: LoopPendingWrite | null;
};

export type LoopTaskRecord = {
    id: string;
    status: AgentTaskStatus;
    updatedAt: string;
    agentKey: AgentKey;
    state: LoopState;
};

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseState(context: unknown): LoopState | null {
    const loop = asRecord(asRecord(context).loop);
    if (!Array.isArray(loop.messages)) return null;
    return {
        runId: typeof loop.runId === 'string' ? loop.runId : null,
        goal: typeof loop.goal === 'string' ? loop.goal : '',
        messages: loop.messages as Anthropic.MessageParam[],
        stepsUsed: Number(loop.stepsUsed || 0),
        nextPosition: Number(loop.nextPosition || 0),
        trace: Array.isArray(loop.trace) ? loop.trace as LoopTraceEntry[] : [],
        pending: loop.pending && typeof loop.pending === 'object' ? loop.pending as LoopPendingWrite : null,
    };
}

function loopContext(state: LoopState) {
    return { orchestration: 'agentic_loop', targetHref: '/agent-center', loop: state };
}

// ---------------------------------------------------------------------------
// Auditoria: una corrida por mensaje, una fila por llamada a herramienta.
// ---------------------------------------------------------------------------
export async function createLoopRun(profile: AgentProfile, message: string) {
    return bestEffortInsert('agent_runs', {
        user_id: profile.id,
        community_id: profile.community_id,
        agent_key: 'community',
        intent: 'agent_loop',
        user_message: message.slice(0, 1200),
        autonomy_level: 'manual',
        status: 'preview',
        summary: 'Ciclo agentico de CoCo',
        metadata: { displayAction: 'Ciclo agentico', orchestration: 'agentic_loop' },
    });
}

export async function recordLoopToolCall(profile: AgentProfile, runId: string | null, entry: {
    toolName: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
    status: 'executed' | 'failed' | 'rejected';
}) {
    return bestEffortInsert('agent_tool_calls', {
        run_id: runId,
        user_id: profile.id,
        community_id: profile.community_id,
        tool_name: entry.toolName,
        args: entry.args,
        result: entry.result,
        requires_confirmation: false,
        status: entry.status,
        executed_at: entry.status === 'executed' ? new Date().toISOString() : null,
    });
}

export async function finishLoopRun(runId: string | null, status: 'executed' | 'awaiting_confirmation' | 'failed' | 'rejected', summary: string) {
    if (!runId) return;
    const { error } = await getSupabaseAdmin().from('agent_runs').update({
        status,
        summary: summary.slice(0, 280),
        completed_at: status === 'awaiting_confirmation' ? null : new Date().toISOString(),
    }).eq('id', runId);
    if (error) console.error('[agent-loop] No se pudo cerrar la corrida auditada', { runId, error });
}

/**
 * Tarjeta de aprobacion persistida fuera de la ruta (camino `tasks/[id]/resume`).
 * Misma forma que `logActivity(..., 'preview')` de la ruta, para que
 * `loadPersistedProposal` y `getPendingAgentProposals` la lean igual.
 */
export async function persistLoopProposal(profile: AgentProfile, action: AgentAction) {
    const runId = await bestEffortInsert('agent_runs', {
        user_id: profile.id,
        community_id: profile.community_id,
        agent_key: action.agentKey,
        intent: action.toolName,
        user_message: action.summary,
        autonomy_level: 'manual',
        status: 'awaiting_confirmation',
        summary: action.title,
        metadata: {
            displayAction: action.title,
            displaySummary: `Preparado para revision: ${action.title}`,
            targetHref: action.targetHref,
            agentTaskId: action.agentTaskId || null,
            proposedAction: { agentKey: action.agentKey, toolName: action.toolName, title: action.title, summary: action.summary, args: action.args, targetHref: action.targetHref, decision: action.decision },
        },
    });
    const toolCallId = runId ? await bestEffortInsert('agent_tool_calls', {
        run_id: runId,
        user_id: profile.id,
        community_id: profile.community_id,
        tool_name: action.toolName,
        args: action.args,
        result: {},
        requires_confirmation: true,
        status: 'proposed',
    }) : null;
    return { runId, toolCallId };
}

export async function getLoopProposalStatus(profile: AgentProfile, proposalId: string) {
    const { data, error } = await getSupabaseAdmin().from('agent_tool_calls')
        .select('id, status, result')
        .eq('id', proposalId).eq('community_id', profile.community_id).maybeSingle();
    if (error) throw error;
    return data ? { status: String(data.status), result: asRecord(data.result) } : null;
}

// ---------------------------------------------------------------------------
// Tarea persistente (taskEngine)
// ---------------------------------------------------------------------------
export async function createLoopTask(profile: AgentProfile, agentKey: AgentKey, state: LoopState, steps: Array<{ key: string; title: string; status: AgentTaskStepStatus; input?: Record<string, unknown>; output?: Record<string, unknown> }>) {
    return createAgentTask(profile, {
        key: AGENT_LOOP_PLAYBOOK_KEY,
        agentKey,
        name: 'Ciclo agentico',
        description: state.goal,
        targetHref: '/agent-center',
        requiresAdmin: false,
        steps: steps.map(step => step.title),
    }, state.goal, steps, loopContext(state));
}

export async function saveLoopTask(taskId: string, status: AgentTaskStatus, state: LoopState, extra: { lastError?: string | null; result?: Record<string, unknown> } = {}) {
    const { error } = await getSupabaseAdmin().from('agent_tasks').update({
        status,
        context: loopContext(state),
        current_step: Math.max(0, state.nextPosition - 1),
        ...(extra.lastError !== undefined ? { last_error: extra.lastError } : {}),
        ...(extra.result ? { result: extra.result } : {}),
        ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
    }).eq('id', taskId);
    if (error) throw new Error(`No se pudo guardar el estado del ciclo agentico: ${error.message}`);
}

export async function appendLoopStep(taskId: string, position: number, step: { key: string; title: string; status: AgentTaskStepStatus; input?: Record<string, unknown>; output?: Record<string, unknown> }) {
    await appendAgentTaskStep(taskId, position, step);
}

export async function setLoopStep(taskId: string, position: number, status: AgentTaskStepStatus, output?: Record<string, unknown>, error?: string | null) {
    await setAgentTaskStep(taskId, position, { status, output, error });
}

export async function loadLoopTask(profile: AgentProfile, taskId: string): Promise<LoopTaskRecord | null> {
    if (!profile.community_id) return null;
    const { data, error } = await getSupabaseAdmin().from('agent_tasks')
        .select('id, agent_key, status, context, updated_at, community_id, playbook_key')
        .eq('id', taskId)
        .eq('community_id', profile.community_id)
        .eq('playbook_key', AGENT_LOOP_PLAYBOOK_KEY)
        .maybeSingle();
    if (error) throw error;
    if (!data || data.community_id !== profile.community_id) return null;
    const state = parseState(data.context);
    if (!state) return null;
    return { id: String(data.id), status: data.status as AgentTaskStatus, updatedAt: String(data.updated_at), agentKey: data.agent_key as AgentKey, state };
}

/** Toma la tarea de forma atomica: si otra solicitud ya la retomo, devuelve false. */
export async function claimLoopTask(profile: AgentProfile, task: LoopTaskRecord) {
    const { data, error } = await getSupabaseAdmin().from('agent_tasks')
        .update({ status: 'running', last_error: null, updated_at: new Date().toISOString() })
        .eq('id', task.id)
        .eq('community_id', profile.community_id)
        .eq('status', task.status)
        .eq('updated_at', task.updatedAt)
        .select('id')
        .maybeSingle();
    if (error) throw error;
    return Boolean(data);
}

export function traceToSteps(trace: LoopTraceEntry[]): AgentStep[] {
    return trace.map(entry => ({
        kind: entry.status === 'executed' ? 'tool' : 'warning',
        title: entry.title,
        detail: entry.message,
        metadata: { toolName: entry.toolName, agentKey: entry.agentKey, status: entry.status },
    }));
}
