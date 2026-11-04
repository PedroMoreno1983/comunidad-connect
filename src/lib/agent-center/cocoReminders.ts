/**
 * Recordatorios que CoCo agenda desde el chat.
 *
 * No tienen tabla propia: cada uno es una fila de `agent_trigger_rules` con
 * señal `coco_reminder`. El scheduler existente (`evaluateDueAgentTriggers`)
 * corre una vez al día (12:00 UTC, 09:00 en Chile) y entrega los que ya
 * vencieron. La tarea
 * queda en `agent_tasks` para que se vea en el Agent Center.
 *
 * Crear, listar y cancelar pasa por las herramientas de CoCo, con la misma
 * confirmación del chat y la bitácora de `executeAuditedTool`. WhatsApp es un
 * gancho apagado: solo corre si COCO_REMINDER_WHATSAPP=true, y usa la plantilla
 * convive_aviso_comunidad.
 */

import { AGENT_PLAYBOOKS, type AgentProfile, type AgentTriggerRuleRecord } from '@/lib/agent-center/domain';
import { readCollectionExpenses, resolveCollectionRecipients } from '@/lib/agent-center/collection';
import { cancelAgentTask, completeAgentTask, createAgentTask, rearmAgentTask, setAgentTaskStep } from '@/lib/agent-center/taskEngine';
import { stableNotificationId } from '@/lib/agent-center/utils';
import {
    MAX_ACTIVE_OVERDUE_REMINDERS,
    MAX_ACTIVE_REMINDERS,
    MAX_REMINDER_NOTE,
    OVERDUE_REMINDER_NOTICE,
    type ReminderAudience,
    type ReminderCadence,
    type ReminderSchedule,
    chileDateISO,
    describeReminderConfirmation,
    noticeHasDebtLanguage,
    nextMonthlyRun,
    reminderAudienceAllowed,
    reminderWhatsAppActive,
    resolveReminderSchedule,
    whatsappSubjectForReminder,
} from '@/lib/coco/reminders';
import { recordOperationEvent } from '@/lib/operations/audit';
import { planCoCoWhatsAppDelivery } from '@/lib/coco/whatsappDelivery';
import { sendWhatsAppNotificationForUser } from '@/lib/server/whatsappNotify';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

const SIGNAL = 'coco_reminder';
const PLAYBOOK = 'coco_reminder';

export type ReminderActor = {
    user_id?: string;
    role?: string;
    community_id?: string;
    name?: string;
};

type ReminderContext = {
    kind: 'coco_reminder';
    audience: ReminderAudience;
    cadence: ReminderCadence;
    note: string;
    timeLocal: string;
    dayOfMonth: number | null;
    taskId: string | null;
    whatsappRequested: boolean;
};

export type ListedReminder = {
    id: string;
    audience: ReminderAudience;
    cadence: ReminderCadence;
    note: string;
    runAt: string;
    timeLocal: string;
};

function objectValue(value: unknown) {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function parseContext(value: unknown): ReminderContext | null {
    const raw = objectValue(value);
    const audience = raw.audience === 'overdue_residents'
        ? 'overdue_residents'
        : raw.audience === 'community_notice'
            ? 'community_notice'
            : raw.audience === 'self' ? 'self' : null;
    const cadence = raw.cadence === 'monthly' ? 'monthly' : raw.cadence === 'once' ? 'once' : null;
    const note = typeof raw.note === 'string' ? raw.note.trim() : '';
    const timeLocal = typeof raw.timeLocal === 'string' ? raw.timeLocal : '';
    if (raw.kind !== 'coco_reminder' || !audience || !cadence || !note || !timeLocal) return null;
    const day = Number(raw.dayOfMonth);
    return {
        kind: 'coco_reminder',
        audience,
        cadence,
        note,
        timeLocal,
        dayOfMonth: Number.isInteger(day) ? day : null,
        taskId: typeof raw.taskId === 'string' ? raw.taskId : null,
        whatsappRequested: raw.whatsappRequested === true,
    };
}

function toProfile(actor: ReminderActor): AgentProfile {
    const role = actor.role === 'admin' || actor.role === 'concierge' ? actor.role : 'resident';
    return {
        id: String(actor.user_id),
        role,
        community_id: actor.community_id,
        name: actor.name || null,
    };
}

async function countActive(communityId: string, userId: string, audience?: ReminderAudience) {
    const { data, error } = await getSupabaseAdmin()
        .from('agent_trigger_rules')
        .select('id, created_by, context')
        .eq('community_id', communityId)
        .eq('signal_key', SIGNAL)
        .eq('enabled', true)
        .limit(100);
    if (error) return -1;
    return (data || []).filter(row => {
        const parsed = parseContext(row.context);
        if (!parsed) return false;
        if (audience === 'overdue_residents') return parsed.audience === 'overdue_residents';
        return String(row.created_by || '') === userId;
    }).length;
}

export async function createCoCoReminder(actor: ReminderActor, input: Record<string, string>) {
    if (!actor.user_id || !actor.community_id) return { error: 'No pude identificar tu comunidad.' };
    const audience: ReminderAudience = input.audience === 'overdue_residents' ? 'overdue_residents' : 'self';
    if (!reminderAudienceAllowed(actor.role, audience)) {
        return { error: 'Solo la administración puede avisar a las unidades con cobros pendientes.' };
    }
    const note = (input.text || input.note || '').trim().replace(/\s+/g, ' ').slice(0, MAX_REMINDER_NOTE);
    if (!note) return { error: 'Dime qué hay que recordar.' };
    const resolved = resolveReminderSchedule({ when: input.when, time: input.time, repeat: input.repeat });
    if (!resolved.ok) return { error: resolved.error };

    const own = await countActive(actor.community_id, actor.user_id);
    if (own < 0) return { error: 'No pude revisar tus recordatorios activos.' };
    if (own >= MAX_ACTIVE_REMINDERS) return { error: `Ya tienes ${MAX_ACTIVE_REMINDERS} recordatorios activos. Cancela uno antes de crear otro.` };
    if (audience === 'overdue_residents') {
        const communityWide = await countActive(actor.community_id, actor.user_id, 'overdue_residents');
        if (communityWide >= MAX_ACTIVE_OVERDUE_REMINDERS) {
            return { error: 'Esta comunidad ya tiene 3 avisos mensuales o pendientes de cobros. Cancela uno antes de crear otro.' };
        }
    }

    const whatsappRequested = input.whatsapp === 'true';
    const schedule = resolved.schedule;
    const context: ReminderContext = {
        kind: 'coco_reminder',
        audience,
        cadence: schedule.cadence,
        note,
        timeLocal: schedule.timeLocal,
        dayOfMonth: schedule.dayOfMonth,
        taskId: null,
        whatsappRequested,
    };
    const admin = getSupabaseAdmin();
    const { data: rule, error } = await admin.from('agent_trigger_rules').insert({
        community_id: actor.community_id,
        agent_key: audience === 'overdue_residents' ? 'finance' : 'community',
        playbook_key: PLAYBOOK,
        name: note.slice(0, 80),
        signal_key: SIGNAL,
        enabled: true,
        interval_minutes: 1440,
        cooldown_minutes: 15,
        threshold: { minimum: 1 },
        context,
        next_run_at: schedule.runAt.toISOString(),
        created_by: actor.user_id,
    }).select('id').single();
    if (error || !rule) {
        if (error && /signal_key|coco_reminder|check constraint/i.test(error.message)) {
            return { error: 'Los recordatorios todavía no están disponibles. Falta aplicar la migración.' };
        }
        return { error: 'No pude guardar el recordatorio.' };
    }

    const playbook = AGENT_PLAYBOOKS.find(item => item.key === PLAYBOOK);
    let taskId: string | null = null;
    if (playbook) {
        try {
            taskId = await createAgentTask(toProfile(actor), playbook, note, [
                { key: 'schedule', title: 'Esperar la hora en Chile', status: 'completed', output: { runAt: schedule.runAt.toISOString() } },
                { key: 'deliver', title: 'Entregar en la app', status: 'pending' },
            ], { triggerRuleId: String(rule.id), audience, cadence: schedule.cadence });
            await admin.from('agent_trigger_rules').update({
                context: { ...context, taskId },
                updated_at: new Date().toISOString(),
            }).eq('id', rule.id);
        } catch (taskError) {
            await admin.from('agent_trigger_rules').delete().eq('id', rule.id);
            const message = taskError instanceof Error ? taskError.message : 'No pude abrir la tarea del recordatorio.';
            return { error: message };
        }
    }

    const confirmation = describeReminderConfirmation({ audience, note, schedule });
    const whatsappNote = whatsappRequested
        ? ' Pediste WhatsApp: queda apagado hasta activar COCO_REMINDER_WHATSAPP y, si se enciende, usa la plantilla de aviso.'
        : '';
    return {
        success: true,
        reminder_id: String(rule.id),
        task_id: taskId,
        run_at: schedule.runAt.toISOString(),
        message: `${confirmation.summary}${whatsappNote}`,
    };
}

export async function listCoCoReminders(actor: ReminderActor) {
    if (!actor.user_id || !actor.community_id) return { error: 'No pude identificar tu comunidad.' };
    const { data, error } = await getSupabaseAdmin()
        .from('agent_trigger_rules')
        .select('id, created_by, context, next_run_at, enabled')
        .eq('community_id', actor.community_id)
        .eq('signal_key', SIGNAL)
        .eq('enabled', true)
        .order('next_run_at', { ascending: true })
        .limit(50);
    if (error) return { error: 'No pude leer los recordatorios.' };
    const reminders: ListedReminder[] = [];
    for (const row of data || []) {
        const parsed = parseContext(row.context);
        if (!parsed) continue;
        const mine = String(row.created_by || '') === actor.user_id;
        const adminOverdue = actor.role === 'admin' && parsed.audience === 'overdue_residents';
        if (!mine && !adminOverdue) continue;
        reminders.push({
            id: String(row.id),
            audience: parsed.audience,
            cadence: parsed.cadence,
            note: parsed.note,
            runAt: String(row.next_run_at),
            timeLocal: parsed.timeLocal,
        });
    }
    return { reminders };
}

export async function cancelCoCoReminder(actor: ReminderActor, reminderId: string) {
    if (!actor.user_id || !actor.community_id) return { error: 'No pude identificar tu comunidad.' };
    if (!/^[0-9a-f-]{36}$/i.test(reminderId)) return { error: 'No encontré ese recordatorio.' };
    const admin = getSupabaseAdmin();
    const { data: row, error } = await admin
        .from('agent_trigger_rules')
        .select('id, community_id, created_by, context, signal_key, enabled')
        .eq('id', reminderId)
        .eq('community_id', actor.community_id)
        .eq('signal_key', SIGNAL)
        .maybeSingle();
    if (error || !row) return { error: 'No encontré ese recordatorio en tu comunidad.' };
    const parsed = parseContext(row.context);
    const mine = String(row.created_by || '') === actor.user_id;
    const adminOverdue = actor.role === 'admin' && parsed?.audience === 'overdue_residents';
    if (!mine && !adminOverdue) return { error: 'Solo quien lo creó, o la administración si es un aviso de cobros, puede cancelarlo.' };
    if (row.enabled === false) return { success: true, reminder_id: reminderId, message: 'Ese recordatorio ya estaba cancelado.' };

    const { error: updateError } = await admin.from('agent_trigger_rules').update({
        enabled: false,
        updated_at: new Date().toISOString(),
    }).eq('id', reminderId).eq('enabled', true);
    if (updateError) return { error: 'No pude cancelar el recordatorio.' };
    if (parsed?.taskId) {
        try {
            await cancelAgentTask(parsed.taskId, 'La persona canceló el recordatorio.');
        } catch (cancelError) {
            console.warn('[coco] no se pudo cancelar la tarea del recordatorio', cancelError);
        }
    }
    return { success: true, reminder_id: reminderId, message: 'Recordatorio cancelado. No se enviará.' };
}

async function appendToCoCoThread(userId: string, communityId: string, text: string) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('coco_sessions')
        .select('user_key, conversation, user_context')
        .like('user_key', `web:${userId}:%`)
        .order('last_activity', { ascending: false })
        .limit(5);
    if (error || !data?.length) return;
    const session = data.find(row => objectValue(row.user_context).community_id === communityId) || data[0];
    const conversation = Array.isArray(session.conversation) ? [...session.conversation] : [];
    const last = conversation[conversation.length - 1] as { content?: unknown } | undefined;
    if (last && Array.isArray(last.content)) return;
    if (last && typeof last.content === 'string' && last.content === text) return;
    conversation.push({ role: 'assistant', content: text });
    await admin.from('coco_sessions').update({
        conversation: conversation.slice(-200),
        last_activity: new Date().toISOString(),
    }).eq('user_key', session.user_key);
}

async function notifyInApp(rows: Array<Record<string, unknown>>) {
    if (!rows.length) return;
    const { error } = await getSupabaseAdmin().from('notifications').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
}

async function maybeWhatsApp(
    userId: string,
    communityId: string,
    actorId: string,
    subject: string,
    requested: boolean,
    payment?: { unitLabel: string; amountLabel: string },
) {
    if (!reminderWhatsAppActive(requested)) return { status: 'skipped' as const, reason: 'disabled' };
    const planned = planCoCoWhatsAppDelivery({
        purpose: payment ? 'payment_reminder' : 'community_notice',
        windowOpen: false,
        title: subject,
        unitLabel: payment?.unitLabel,
        amountLabel: payment?.amountLabel,
    });
    if (planned.mode === 'skip') return { status: 'skipped' as const, reason: planned.reason };
    if (planned.mode === 'free') {
        return sendWhatsAppNotificationForUser({
            userId, title: subject, body: planned.body, type: 'info', communityId, actorId,
            delivery: 'window_or_template',
            mediaUrl: planned.mediaUrl,
            metadata: { source: 'coco.reminder' },
        });
    }
    return sendWhatsAppNotificationForUser({
        userId,
        title: subject,
        body: 'Entra a Convive Connect para ver el detalle.',
        type: 'info',
        communityId,
        actorId,
        delivery: 'window_or_template',
        templateKey: planned.templateKey,
        templateVariables: planned.variables,
        metadata: { source: 'coco.reminder', template: planned.templateKey },
    });
}

async function deliver(rule: AgentTriggerRuleRecord, parsed: ReminderContext, occurrence: string, owner: string) {
    if (parsed.audience === 'community_notice') {
        const { data: residents, error } = await getSupabaseAdmin()
            .from('profiles')
            .select('id')
            .eq('community_id', rule.communityId)
            .eq('role', 'resident')
            .limit(500);
        if (error) throw error;
        const safeBody = noticeHasDebtLanguage(parsed.note)
            ? 'La administración publicó un aviso. Entra a Convive Connect para leerlo.'
            : parsed.note;
        const ids = (residents || []).map(row => String(row.id));
        await notifyInApp(ids.map(userId => ({
            id: stableNotificationId('coco-notice', rule.id, occurrence, userId),
            user_id: userId,
            community_id: rule.communityId,
            type: 'info',
            category: 'coco_notice',
            title: 'Aviso de la administración',
            body: safeBody,
            link: '/feed',
        })));
        if (parsed.whatsappRequested) {
            for (const userId of ids) {
                await maybeWhatsApp(userId, rule.communityId, owner, whatsappSubjectForReminder('self', safeBody), true);
            }
        }
        return { notified: ids.length };
    }
    if (parsed.audience === 'self') {
        await notifyInApp([{
            id: stableNotificationId('coco-reminder', rule.id, occurrence, owner),
            user_id: owner,
            community_id: rule.communityId,
            type: 'info',
            category: 'coco_reminder',
            title: 'Recordatorio de CoCo',
            body: parsed.note,
            link: '/chat',
        }]);
        await appendToCoCoThread(owner, rule.communityId, `Recordatorio: ${parsed.note}`);
        await maybeWhatsApp(owner, rule.communityId, owner, whatsappSubjectForReminder('self', parsed.note), parsed.whatsappRequested);
        return { notified: 1 };
    }

    const expenses = await readCollectionExpenses(rule.communityId);
    const plan = await resolveCollectionRecipients(rule.communityId, expenses);
    const recipients = [...new Set(plan.notifications.map(item => item.user_id))];
    await notifyInApp(recipients.map(userId => ({
        id: stableNotificationId('coco-reminder', rule.id, occurrence, userId),
        user_id: userId,
        community_id: rule.communityId,
        type: 'info',
        category: 'coco_reminder',
        title: OVERDUE_REMINDER_NOTICE.title,
        body: OVERDUE_REMINDER_NOTICE.body,
        link: '/resident/finances',
    })));
    if (owner) {
        await notifyInApp([{
            id: stableNotificationId('coco-reminder-owner', rule.id, occurrence, owner),
            user_id: owner,
            community_id: rule.communityId,
            type: 'info',
            category: 'coco_reminder',
            title: 'CoCo dejó los avisos en la app',
            body: recipients.length
                ? `Dejé ${recipients.length} aviso(s) dentro de la app, sin montos y con la opción de conversar un convenio.`
                : 'No había unidades con cobros pendientes fuera de un convenio. No envié avisos.',
            link: '/chat',
        }]);
        if (parsed.whatsappRequested) {
            for (const userId of recipients) {
                await maybeWhatsApp(userId, rule.communityId, owner, OVERDUE_REMINDER_NOTICE.whatsappSubject, true);
            }
        }
    }
    return { notified: recipients.length };
}

async function closeTask(parsed: ReminderContext, notified: number) {
    if (!parsed.taskId) return;
    await setAgentTaskStep(parsed.taskId, 1, { status: 'completed', output: { notified, channel: 'in_app' } });
    if (parsed.cadence === 'monthly') {
        await rearmAgentTask(parsed.taskId, 1);
        return;
    }
    await completeAgentTask(parsed.taskId, { notified, channel: 'in_app' });
}

export async function runDueCocoReminder(rule: AgentTriggerRuleRecord) {
    const parsed = parseContext(rule.context);
    if (!parsed) {
        await getSupabaseAdmin().from('agent_trigger_rules').update({
            enabled: false,
            updated_at: new Date().toISOString(),
        }).eq('id', rule.id);
        return { ruleId: rule.id, status: 'failed', error: 'Recordatorio ilegible.' };
    }

    const nowIso = new Date().toISOString();
    const claimUntil = new Date(Date.now() + 15 * 60_000).toISOString();
    const { data: claimed, error: claimError } = await getSupabaseAdmin()
        .from('agent_trigger_rules')
        .update({ next_run_at: claimUntil, last_evaluated_at: nowIso, updated_at: nowIso })
        .eq('id', rule.id)
        .eq('enabled', true)
        .lte('next_run_at', nowIso)
        .select('id')
        .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return { ruleId: rule.id, status: 'skipped', metric: 0 };

    const owner = rule.createdBy || '';
    if (!owner) {
        await getSupabaseAdmin().from('agent_trigger_rules').update({
            next_run_at: rule.nextRunAt,
            updated_at: new Date().toISOString(),
        }).eq('id', rule.id);
        return { ruleId: rule.id, status: 'failed', error: 'El recordatorio no tiene autor.' };
    }
    const occurrence = chileDateISO(new Date(rule.nextRunAt));
    try {
        const result = await deliver(rule, parsed, occurrence, owner);
        const next = parsed.cadence === 'monthly' && parsed.dayOfMonth
            ? nextMonthlyRun(parsed.dayOfMonth, parsed.timeLocal, new Date())
            : null;
        await getSupabaseAdmin().from('agent_trigger_rules').update({
            enabled: Boolean(next),
            next_run_at: next ? next.toISOString() : claimUntil,
            last_triggered_at: nowIso,
            updated_at: nowIso,
        }).eq('id', rule.id);
        try {
            await closeTask(parsed, result.notified);
        } catch (taskError) {
            console.warn('[coco] recordatorio entregado, pero la tarea no se cerró', taskError);
        }
        await recordOperationEvent({
            communityId: rule.communityId,
            actorId: owner,
            actorRole: 'system',
            action: 'coco.reminder.delivered',
            entityType: 'agent_trigger_rule',
            entityId: rule.id,
            status: 'success',
            summary: parsed.audience === 'self'
                ? 'Recordatorio de CoCo entregado en la app'
                : `Aviso de CoCo entregado en la app a ${result.notified} persona(s)`,
            metadata: {
                audience: parsed.audience,
                cadence: parsed.cadence,
                notified: result.notified,
                channel: 'in_app',
                whatsapp: reminderWhatsAppActive(parsed.whatsappRequested) ? 'attempted' : 'disabled',
            },
        });
        return { ruleId: rule.id, status: 'delivered', metric: result.notified };
    } catch (error) {
        await getSupabaseAdmin().from('agent_trigger_rules').update({
            next_run_at: rule.nextRunAt,
            updated_at: new Date().toISOString(),
        }).eq('id', rule.id);
        return {
            ruleId: rule.id,
            status: 'failed',
            error: error instanceof Error ? error.message : 'No se pudo entregar el recordatorio.',
        };
    }
}

function ruleFromRow(row: Record<string, unknown>): AgentTriggerRuleRecord {
    return {
        id: String(row.id),
        communityId: String(row.community_id),
        agentKey: row.agent_key as AgentTriggerRuleRecord['agentKey'],
        playbookKey: PLAYBOOK,
        name: String(row.name || 'Recordatorio'),
        signalKey: SIGNAL,
        enabled: row.enabled !== false,
        intervalMinutes: Number(row.interval_minutes || 1440),
        cooldownMinutes: Number(row.cooldown_minutes || 15),
        threshold: objectValue(row.threshold),
        context: objectValue(row.context),
        lastEvaluatedAt: typeof row.last_evaluated_at === 'string' ? row.last_evaluated_at : null,
        lastTriggeredAt: typeof row.last_triggered_at === 'string' ? row.last_triggered_at : null,
        nextRunAt: String(row.next_run_at),
        createdBy: typeof row.created_by === 'string' ? row.created_by : null,
    };
}

/** Lo usa el playbook si alguien reintenta un recordatorio ya vencido desde el Agent Center. */
export async function runCocoReminderPlaybook(ruleId: string) {
    const { data, error } = await getSupabaseAdmin()
        .from('agent_trigger_rules')
        .select('*')
        .eq('id', ruleId)
        .eq('signal_key', SIGNAL)
        .maybeSingle();
    if (error || !data) throw new Error('No encontré el recordatorio.');
    if (data.enabled === false) throw new Error('Ese recordatorio ya se entregó o se canceló.');
    if (new Date(String(data.next_run_at)).getTime() > Date.now()) throw new Error('Ese recordatorio todavía no llega a su hora.');
    const result = await runDueCocoReminder(ruleFromRow(data));
    if (result.status === 'failed') throw new Error(String(result.error || 'No se pudo entregar el recordatorio.'));
    return result;
}

export function reminderConfirmationFromInput(input: Record<string, unknown>) {
    const audience: ReminderAudience = input.audience === 'overdue_residents' ? 'overdue_residents' : 'self';
    const resolved = resolveReminderSchedule({
        when: typeof input.when === 'string' ? input.when : '',
        time: typeof input.time === 'string' ? input.time : undefined,
        repeat: typeof input.repeat === 'string' ? input.repeat : undefined,
    });
    const schedule: ReminderSchedule | null = resolved.ok ? resolved.schedule : null;
    const note = typeof input.text === 'string' ? input.text : typeof input.note === 'string' ? input.note : 'Recordatorio';
    if (!schedule) return { title: 'Crear recordatorio', summary: note };
    return describeReminderConfirmation({ audience, note, schedule });
}
