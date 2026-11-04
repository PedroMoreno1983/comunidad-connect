/**
 * Tareas largas de CoCo: se crean en el task engine y se terminan después.
 * El chat responde enseguida. El scheduler (o el cierre de la petición) las corre
 * y avisa en la app. WhatsApp solo si quien la pidió lo marcó y tiene opt-in.
 */

import type { AgentPlaybook, AgentProfile } from '@/lib/agent-center/domain';
import { chileTodayISO } from '@/lib/agent-center/chileDate';
import { completeAgentTask, createAgentTask, runVerifiedTaskStep } from '@/lib/agent-center/taskEngine';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { sendWhatsAppNotificationForUser } from '@/lib/server/whatsappNotify';

export const DELEGATED_PLAYBOOK: AgentPlaybook = {
    key: 'coco_background_task',
    agentKey: 'community',
    name: 'Tarea en segundo plano',
    description: 'CoCo deja una revisión para más tarde y avisa cuando termina, sin cambiar datos.',
    targetHref: '/chat',
    requiresAdmin: true,
    steps: ['Revisar la comunidad', 'Avisar que terminó'],
};

export type DelegateNotice = 'app' | 'whatsapp' | 'both';

export function parseDelegateNotice(value: string | undefined): DelegateNotice {
    if (value === 'whatsapp' || value === 'both') return value;
    return 'app';
}

export function backgroundTaskSummary(goal: string, snapshot: { assemblies: number; bookings: number }): string {
    const clean = goal.replace(/\s+/g, ' ').trim().slice(0, 180) || 'la revisión pedida';
    const assemblies = snapshot.assemblies === 1 ? '1 asamblea próxima' : `${snapshot.assemblies} asambleas próximas`;
    const bookings = snapshot.bookings === 1 ? '1 reserva en los próximos días' : `${snapshot.bookings} reservas en los próximos días`;
    return `Terminé “${clean}”. Hay ${assemblies} y ${bookings}. El detalle está en Convive. No cambié datos.`;
}

async function communitySnapshot(communityId: string) {
    const admin = getSupabaseAdmin();
    const today = chileTodayISO();
    const [assemblies, bookings] = await Promise.all([
        admin.from('assemblies').select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .gte('scheduled_at', `${today}T00:00:00`)
            .in('status', ['cited', 'in_progress']),
        admin.from('bookings').select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .gte('date', today)
            .in('status', ['pending', 'confirmed']),
    ]);
    if (assemblies.error) throw assemblies.error;
    if (bookings.error) throw bookings.error;
    return { assemblies: assemblies.count || 0, bookings: bookings.count || 0 };
}

async function tellRequester(task: { community_id: string; created_by: string | null; context: Record<string, unknown> }, title: string, body: string) {
    if (!task.created_by) return;
    const admin = getSupabaseAdmin();
    await admin.from('notifications').insert({
        user_id: task.created_by,
        community_id: task.community_id,
        type: 'info',
        category: 'coco_task',
        title,
        body: body.slice(0, 400),
        link: '/chat',
        read: false,
    });
    const notice = task.context.notify;
    if (notice !== 'whatsapp' && notice !== 'both') return;
    await sendWhatsAppNotificationForUser({
        userId: task.created_by,
        communityId: task.community_id,
        title,
        body: body.slice(0, 300),
        templateKey: 'community_notice',
        templateVariables: { '1': title.slice(0, 180) },
        delivery: 'window_or_template',
    });
}

export async function enqueueDelegatedTask(profile: AgentProfile, goal: string, notify: DelegateNotice) {
    if (!profile.community_id) throw new Error('Falta la comunidad.');
    const taskId = await createAgentTask(profile, DELEGATED_PLAYBOOK, goal, [
        { key: 'snapshot', title: 'Revisar la comunidad' },
        { key: 'notify', title: 'Avisar que terminó' },
    ], { notify, requestedBy: profile.id });
    return taskId;
}

export async function drainDelegatedTasks(limit = 3) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('agent_tasks')
        .select('id, community_id, created_by, goal, context')
        .eq('playbook_key', 'coco_background_task')
        .eq('status', 'planned')
        .order('created_at', { ascending: true })
        .limit(limit);
    if (error) throw error;

    const finished: string[] = [];
    for (const task of data || []) {
        const claimed = await admin
            .from('agent_tasks')
            .update({ status: 'running', updated_at: new Date().toISOString() })
            .eq('id', task.id)
            .eq('status', 'planned')
            .select('id')
            .maybeSingle();
        if (claimed.error || !claimed.data) continue;
        const context = task.context && typeof task.context === 'object' ? task.context as Record<string, unknown> : {};
        const owner = { community_id: String(task.community_id), created_by: task.created_by ? String(task.created_by) : null, context };
        try {
            const snapshot = await runVerifiedTaskStep(String(task.id), 0, () => communitySnapshot(String(task.community_id)));
            const summary = backgroundTaskSummary(String(task.goal || ''), snapshot);
            await runVerifiedTaskStep(String(task.id), 1, async () => {
                await tellRequester(owner, 'CoCo terminó una tarea', summary);
                return { notified: true };
            });
            await completeAgentTask(String(task.id), { summary });
            finished.push(String(task.id));
        } catch (taskError) {
            console.error('[coco] delegated task failed', task.id, taskError);
            await tellRequester(owner, 'CoCo no pudo terminar una tarea', 'Quedó para revisión. No cambié datos de la comunidad.');
        }
    }
    return { finished };
}

/** Arranca el trabajo sin demorar la respuesta del chat. El scheduler también lo toma. */
export async function kickDelegatedTasks() {
    try {
        const { after } = await import('next/server');
        after(() => {
            void drainDelegatedTasks().catch(error => console.error('[coco] background drain failed', error));
        });
    } catch {
        // Fuera de una petición el scheduler diario sigue la fila.
    }
}
