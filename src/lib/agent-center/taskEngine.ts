import type {
    AgentPlaybook,
    AgentProfile,
    AgentTaskStatus,
    AgentTaskSummary,
    AgentTaskStepStatus,
} from '@/lib/agent-center/domain';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

type TaskStepDefinition = { key: string; title: string; input?: Record<string, unknown> };

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'No se pudo completar el paso.';
}

export async function createAgentTask(
    profile: AgentProfile,
    playbook: AgentPlaybook,
    goal: string,
    steps: TaskStepDefinition[],
    context: Record<string, unknown> = {},
) {
    if (!profile.community_id) throw new Error('El administrador no tiene una comunidad asignada.');
    const admin = getSupabaseAdmin();
    const { data: task, error } = await admin
        .from('agent_tasks')
        .insert({
            community_id: profile.community_id,
            created_by: profile.id,
            agent_key: playbook.agentKey,
            playbook_key: playbook.key,
            goal: goal.trim().slice(0, 700) || playbook.description,
            status: 'planned',
            max_retries: 1,
            context: { ...context, targetHref: playbook.targetHref },
        })
        .select('id')
        .single();
    if (error) throw new Error(`No se pudo crear la tarea persistente: ${error.message}`);

    const { error: stepsError } = await admin.from('agent_task_steps').insert(
        steps.map((step, position) => ({
            task_id: task.id,
            position,
            step_key: step.key,
            title: step.title,
            input: step.input || {},
        })),
    );
    if (stepsError) {
        await admin.from('agent_tasks').delete().eq('id', task.id);
        throw new Error(`No se pudieron crear los pasos de la tarea: ${stepsError.message}`);
    }
    return String(task.id);
}

async function updateTask(taskId: string, values: Record<string, unknown>) {
    const { error } = await getSupabaseAdmin()
        .from('agent_tasks')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', taskId);
    if (error) throw error;
}

async function updateStep(taskId: string, position: number, values: Record<string, unknown>) {
    const { error } = await getSupabaseAdmin()
        .from('agent_task_steps')
        .update(values)
        .eq('task_id', taskId)
        .eq('position', position);
    if (error) throw error;
}

export async function runVerifiedTaskStep<T>(
    taskId: string,
    position: number,
    execute: () => Promise<T>,
    options: { verify?: (result: T) => Promise<boolean> | boolean; output?: (result: T) => unknown } = {},
) {
    await updateTask(taskId, { status: 'running', current_step: position });
    let finalError = 'No se pudo completar el paso.';

    for (let attempt = 1; attempt <= 2; attempt += 1) {
        await updateStep(taskId, position, {
            status: 'running',
            attempts: attempt,
            error: null,
            started_at: new Date().toISOString(),
        });
        try {
            const result = await execute();
            const verified = options.verify ? await options.verify(result) : true;
            if (!verified) throw new Error('La verificacion del resultado no fue satisfactoria.');
            await updateStep(taskId, position, {
                status: 'completed',
                output: options.output ? options.output(result) : {},
                completed_at: new Date().toISOString(),
            });
            if (attempt > 1) await updateTask(taskId, { retry_count: attempt - 1, last_error: null });
            return result;
        } catch (error) {
            finalError = errorMessage(error);
            await updateStep(taskId, position, { status: 'failed', error: finalError });
            if (attempt < 2) await updateTask(taskId, { status: 'failed', retry_count: attempt, last_error: finalError });
        }
    }

    await updateTask(taskId, { status: 'escalated', retry_count: 1, last_error: finalError });
    throw new Error(`${finalError} La tarea fue escalada para revision humana.`);
}

export async function completeAgentTask(taskId: string, result: Record<string, unknown>) {
    await updateTask(taskId, {
        status: 'completed',
        result,
        last_error: null,
        completed_at: new Date().toISOString(),
    });
}

export async function waitAgentTaskForHuman(taskId: string, position: number, result: Record<string, unknown>) {
    await updateStep(taskId, position, { status: 'waiting_human', output: result });
    await updateTask(taskId, { status: 'waiting_human', current_step: position, result });
}

export async function failAgentTask(taskId: string, error: unknown) {
    await updateTask(taskId, { status: 'escalated', last_error: errorMessage(error) });
}

function taskStatus(value: unknown): AgentTaskStatus {
    const allowed: AgentTaskStatus[] = ['planned', 'running', 'waiting_human', 'completed', 'failed', 'escalated', 'cancelled'];
    return allowed.includes(value as AgentTaskStatus) ? value as AgentTaskStatus : 'failed';
}

function stepStatus(value: unknown): AgentTaskStepStatus {
    const allowed: AgentTaskStepStatus[] = ['pending', 'running', 'completed', 'failed', 'waiting_human', 'skipped'];
    return allowed.includes(value as AgentTaskStepStatus) ? value as AgentTaskStepStatus : 'failed';
}

export async function getRecentAgentTasks(profile: AgentProfile): Promise<AgentTaskSummary[]> {
    if (!profile.community_id) return [];
    const { data, error } = await getSupabaseAdmin()
        .from('agent_tasks')
        .select('id, agent_key, playbook_key, goal, status, current_step, retry_count, last_error, context, created_at, updated_at, agent_task_steps(id, position, step_key, title, status, attempts, error)')
        .eq('community_id', profile.community_id)
        .order('updated_at', { ascending: false })
        .limit(8);
    if (error) throw error;

    return (data || []).map(row => {
        const context = row.context && typeof row.context === 'object' ? row.context as Record<string, unknown> : {};
        const steps = Array.isArray(row.agent_task_steps) ? row.agent_task_steps : [];
        return {
            id: String(row.id),
            agentKey: row.agent_key as AgentTaskSummary['agentKey'],
            playbookKey: typeof row.playbook_key === 'string' ? row.playbook_key : null,
            goal: String(row.goal || ''),
            status: taskStatus(row.status),
            currentStep: Number(row.current_step || 0),
            retryCount: Number(row.retry_count || 0),
            lastError: typeof row.last_error === 'string' ? row.last_error : null,
            targetHref: typeof context.targetHref === 'string' ? context.targetHref : null,
            createdAt: String(row.created_at),
            updatedAt: String(row.updated_at),
            steps: steps
                .map(step => ({
                    id: String(step.id),
                    position: Number(step.position || 0),
                    stepKey: String(step.step_key || ''),
                    title: String(step.title || ''),
                    status: stepStatus(step.status),
                    attempts: Number(step.attempts || 0),
                    error: typeof step.error === 'string' ? step.error : null,
                }))
                .sort((a, b) => a.position - b.position),
        };
    });
}
