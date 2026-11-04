import type { AgentProfile } from '@/lib/agent-center/domain';

/** Retoma una tarea larga del Agent Center sin aprobar escrituras pendientes. */
export async function resumeCoCoTask(profile: AgentProfile, taskId: string): Promise<{ message: string }> {
    const { resumeAgentLoopTask } = await import('@/lib/agent-center/agentLoop');
    const { resumeOperationalTask } = await import('@/lib/agent-center/taskPlaybooks');
    const loop = await resumeAgentLoopTask(profile, taskId);
    if (loop) {
        return { message: loop.result.message || loop.result.title || 'Retomé la tarea del ciclo.' };
    }
    const result = await resumeOperationalTask(profile, taskId);
    return { message: result.message || result.title || 'Retomé la tarea.' };
}
