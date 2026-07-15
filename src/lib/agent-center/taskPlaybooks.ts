import { randomUUID } from 'node:crypto';
import { AGENT_PLAYBOOKS, type AgentAction, type AgentProfile, type PlaybookKey } from '@/lib/agent-center/domain';
import {
    completeAgentTask,
    createAgentTask,
    failAgentTask,
    runVerifiedTaskStep,
    waitAgentTaskForHuman,
} from '@/lib/agent-center/taskEngine';
import { recordOperationEvent } from '@/lib/operations/audit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

function cleanText(value: unknown, max = 700) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function playbook(key: PlaybookKey) {
    const result = AGENT_PLAYBOOKS.find(item => item.key === key);
    if (!result) throw new Error('Accion no soportada.');
    return result;
}

function requireAdmin(profile: AgentProfile) {
    if (profile.role !== 'admin') throw new Error('Solo administracion puede ejecutar esta tarea.');
    if (!profile.community_id) throw new Error('El administrador no tiene una comunidad asignada.');
}

async function runFinanceCollectionTask(profile: AgentProfile, goal: string) {
    requireAdmin(profile);
    const definition = playbook('finance_collection_review');
    const taskId = await createAgentTask(profile, definition, goal, [
        { key: 'detect_expenses', title: 'Detectar gastos impagos' },
        { key: 'resolve_recipients', title: 'Resolver unidades y residentes' },
        { key: 'notify_residents', title: 'Notificar residentes vinculados' },
        { key: 'verify_delivery', title: 'Verificar entrega y registrar evento' },
    ]);
    const admin = getSupabaseAdmin();
    const communityId = profile.community_id!;

    try {
        const expenses = await runVerifiedTaskStep(taskId, 0, async () => {
            const { data, error } = await admin
                .from('expenses')
                .select('id, unit_id, month, amount, status, due_date')
                .eq('community_id', communityId)
                .in('status', ['pending', 'overdue'])
                .order('due_date', { ascending: true })
                .limit(100);
            if (error) throw error;
            return data || [];
        }, { output: rows => ({ pendingExpenses: rows.length }) });

        const resolution = await runVerifiedTaskStep(taskId, 1, async () => {
            const unitIds = Array.from(new Set(expenses.map(row => String(row.unit_id || '')).filter(Boolean)));
            const { data: units, error } = unitIds.length
                ? await admin.from('units').select('id, number, unit_number, owner_id, resident_profile_id').in('id', unitIds)
                : { data: [], error: null };
            if (error) throw error;
            const unitById = new Map((units || []).map(unit => [String(unit.id), unit]));
            const notifications = expenses.flatMap(row => {
                const unit = unitById.get(String(row.unit_id));
                const recipientId = String(unit?.owner_id || unit?.resident_profile_id || '');
                if (!recipientId) return [];
                const unitLabel = String(unit?.unit_number || unit?.number || row.unit_id);
                return [{
                    id: randomUUID(),
                    user_id: recipientId,
                    type: row.status === 'overdue' ? 'alert' : 'warning',
                    category: 'finance_collection',
                    title: 'Gasto comun pendiente',
                    body: `Tu unidad ${unitLabel} registra un gasto comun pendiente de $${Number(row.amount || 0).toLocaleString('es-CL')} (${row.month || 'periodo actual'}).`,
                    link: '/resident/finances',
                    community_id: communityId,
                }];
            });
            return { notifications, missingResidents: Math.max(0, expenses.length - notifications.length) };
        }, { output: result => ({ notifications: result.notifications.length, missingResidents: result.missingResidents }) });

        const notificationIds = await runVerifiedTaskStep(taskId, 2, async () => {
            if (resolution.notifications.length === 0) return [];
            const { data, error } = await admin
                .from('notifications')
                .upsert(resolution.notifications, { onConflict: 'id' })
                .select('id');
            if (error) throw error;
            return (data || []).map(row => String(row.id));
        }, {
            verify: ids => ids.length === resolution.notifications.length,
            output: ids => ({ notificationIds: ids }),
        });

        await runVerifiedTaskStep(taskId, 3, async () => {
            const { count, error } = notificationIds.length
                ? await admin.from('notifications').select('id', { count: 'exact', head: true }).in('id', notificationIds)
                : { count: 0, error: null };
            if (error) throw error;
            if ((count || 0) !== notificationIds.length) throw new Error('No fue posible verificar todas las notificaciones.');
            await recordOperationEvent({
                communityId,
                actorId: profile.id,
                actorRole: profile.role,
                action: 'agent.task.finance_collection_review',
                entityType: 'agent_task',
                entityId: taskId,
                severity: resolution.missingResidents === 0 ? 'success' : 'warning',
                status: resolution.missingResidents === 0 ? 'success' : 'pending',
                summary: `Tarea de cobranza: ${expenses.length} cobro(s), ${notificationIds.length} notificacion(es) verificadas`,
                metadata: { taskId, pendingExpenses: expenses.length, notifications: notificationIds.length, missingResidents: resolution.missingResidents },
            });
            return { verifiedNotifications: count || 0 };
        }, { verify: result => result.verifiedNotifications === notificationIds.length, output: result => result });

        const result = { pendingExpenses: expenses.length, notifications: notificationIds.length, missingResidents: resolution.missingResidents, taskId };
        await completeAgentTask(taskId, result);
        return {
            entityType: 'agent_task', entityId: taskId, title: 'Cobranza verificada',
            message: `Complete una tarea de ${expenses.length} cobro(s) y verifique ${notificationIds.length} notificacion(es) privadas.`,
            data: result,
        };
    } catch (error) {
        await failAgentTask(taskId, error);
        throw error;
    }
}

async function runMaintenanceTriageTask(profile: AgentProfile, goal: string) {
    requireAdmin(profile);
    const definition = playbook('maintenance_ticket_triage');
    const taskId = await createAgentTask(profile, definition, goal, [
        { key: 'inspect_tickets', title: 'Inspeccionar tickets y proveedores' },
        { key: 'analyze_risks', title: 'Analizar asignacion y vencimientos' },
        { key: 'verify_report', title: 'Verificar y registrar el diagnostico' },
    ]);
    const admin = getSupabaseAdmin();
    const communityId = profile.community_id!;

    try {
        const inspection = await runVerifiedTaskStep(taskId, 0, async () => {
            const [{ data: requests, error }, { count: providerCount, error: providerError }] = await Promise.all([
                admin.from('service_requests').select('id, description, status, preferred_date, provider_id, created_at')
                    .eq('community_id', communityId).in('status', ['pending', 'accepted', 'in-progress']).order('created_at').limit(25),
                admin.from('service_providers').select('id', { count: 'exact', head: true })
                    .eq('community_id', communityId).eq('verified', true),
            ]);
            if (error) throw error;
            if (providerError) throw providerError;
            return { requests: requests || [], providerCount: providerCount || 0 };
        }, { output: result => ({ openRequests: result.requests.length, verifiedProviders: result.providerCount }) });

        const analysis = await runVerifiedTaskStep(taskId, 1, async () => {
            const unassigned = inspection.requests.filter(row => !row.provider_id).length;
            const oldOpen = inspection.requests.filter(row => {
                if (!row.preferred_date) return false;
                const date = new Date(row.preferred_date);
                return Number.isFinite(date.getTime()) && date < new Date();
            }).length;
            const warnings = [
                ...(inspection.providerCount ? [] : ['No hay proveedores verificados.']),
                ...(unassigned ? [`${unassigned} ticket(s) sin proveedor.`] : []),
                ...(oldOpen ? [`${oldOpen} ticket(s) con fecha vencida.`] : []),
            ];
            return { unassigned, oldOpen, warnings };
        }, { output: result => result });

        await runVerifiedTaskStep(taskId, 2, async () => {
            await recordOperationEvent({
                communityId,
                actorId: profile.id,
                actorRole: profile.role,
                action: 'agent.task.maintenance_ticket_triage',
                entityType: 'agent_task',
                entityId: taskId,
                severity: analysis.warnings.length ? 'warning' : 'success',
                status: analysis.warnings.length ? 'pending' : 'success',
                summary: analysis.warnings.length ? 'Tarea de mantencion detecto brechas' : 'Tarea de mantencion verificada sin brechas',
                metadata: { taskId, openRequests: inspection.requests.length, verifiedProviders: inspection.providerCount, ...analysis },
            });
            return { reportRecorded: true };
        }, { verify: result => result.reportRecorded, output: result => result });

        const result = { taskId, openRequests: inspection.requests.length, verifiedProviders: inspection.providerCount, ...analysis };
        await completeAgentTask(taskId, result);
        return {
            entityType: 'agent_task', entityId: taskId,
            title: analysis.warnings.length ? 'Tarea completada con alertas' : 'Mantenimiento verificado',
            message: analysis.warnings.length
                ? `Complete la revision de ${inspection.requests.length} ticket(s) y escale ${analysis.warnings.length} alerta(s): ${analysis.warnings.join(' ')}`
                : `Complete y verifique la revision de ${inspection.requests.length} ticket(s) sin brechas criticas.`,
            targetHref: definition.targetHref,
            data: result,
        };
    } catch (error) {
        await failAgentTask(taskId, error);
        throw error;
    }
}

async function runOnboardingTask(profile: AgentProfile, goal: string) {
    requireAdmin(profile);
    const definition = playbook('onboarding_import_review');
    const taskId = await createAgentTask(profile, definition, goal, [
        { key: 'inspect_inventory', title: 'Revisar unidades y residentes' },
        { key: 'prepare_plan', title: 'Preparar plan de carga' },
        { key: 'human_import', title: 'Esperar archivo y confirmacion humana' },
    ]);
    const admin = getSupabaseAdmin();
    const communityId = profile.community_id!;
    try {
        const inventory = await runVerifiedTaskStep(taskId, 0, async () => {
            const [{ count: units, error }, { count: residents, error: residentsError }] = await Promise.all([
                admin.from('units').select('id', { count: 'exact', head: true }).eq('community_id', communityId),
                admin.from('profiles').select('id', { count: 'exact', head: true }).eq('community_id', communityId).eq('role', 'resident'),
            ]);
            if (error) throw error;
            if (residentsError) throw residentsError;
            return { units: units || 0, residents: residents || 0 };
        }, { output: result => result });
        const plan = await runVerifiedTaskStep(taskId, 1, async () => ({
            missingResidents: Math.max(0, inventory.units - inventory.residents),
            targetHref: definition.targetHref,
        }), { output: result => result });
        await waitAgentTaskForHuman(taskId, 2, { ...plan, reason: 'Se requiere cargar y aprobar el archivo de residentes.' });
        return {
            entityType: 'agent_task', entityId: taskId, title: 'Tarea esperando archivo',
            message: `Prepare la tarea de onboarding. Detecte ${plan.missingResidents} residente(s) potencialmente faltante(s); ahora espera el archivo y tu confirmacion.`,
            targetHref: definition.targetHref, data: { taskId, ...inventory, ...plan, taskStatus: 'waiting_human' },
        };
    } catch (error) {
        await failAgentTask(taskId, error);
        throw error;
    }
}

async function runIotReadinessTask(profile: AgentProfile, goal: string) {
    requireAdmin(profile);
    const definition = playbook('iot_emergency_readiness');
    const taskId = await createAgentTask(profile, definition, goal, [
        { key: 'inspect_responders', title: 'Revisar responsables y proveedores' },
        { key: 'evaluate_readiness', title: 'Evaluar capacidad de respuesta' },
        { key: 'verify_readiness', title: 'Verificar y registrar brechas' },
    ]);
    const admin = getSupabaseAdmin();
    const communityId = profile.community_id!;
    try {
        const inspection = await runVerifiedTaskStep(taskId, 0, async () => {
            const [{ count: staff, error }, { count: providers, error: providerError }] = await Promise.all([
                admin.from('profiles').select('id', { count: 'exact', head: true }).eq('community_id', communityId).in('role', ['admin', 'concierge']),
                admin.from('service_providers').select('id', { count: 'exact', head: true }).eq('community_id', communityId).eq('verified', true),
            ]);
            if (error) throw error;
            if (providerError) throw providerError;
            return { staffCount: staff || 0, providerCount: providers || 0 };
        }, { output: result => result });
        const readiness = await runVerifiedTaskStep(taskId, 1, async () => ({
            warnings: [
                ...(inspection.staffCount ? [] : ['No hay staff disponible.']),
                ...(inspection.providerCount ? [] : ['No hay proveedores verificados.']),
            ],
        }), { output: result => result });
        await runVerifiedTaskStep(taskId, 2, async () => {
            await recordOperationEvent({
                communityId, actorId: profile.id, actorRole: profile.role,
                action: 'agent.task.iot_emergency_readiness', entityType: 'agent_task', entityId: taskId,
                severity: readiness.warnings.length ? 'warning' : 'success', status: readiness.warnings.length ? 'pending' : 'success',
                summary: readiness.warnings.length ? 'Tarea de emergencia escalo brechas' : 'Preparacion de emergencia verificada',
                metadata: { taskId, ...inspection, warnings: readiness.warnings },
            });
            return { reportRecorded: true };
        }, { verify: result => result.reportRecorded, output: result => result });
        const result = { taskId, ...inspection, warnings: readiness.warnings };
        await completeAgentTask(taskId, result);
        return {
            entityType: 'agent_task', entityId: taskId,
            title: readiness.warnings.length ? 'Preparacion escalada con brechas' : 'Preparacion verificada',
            message: readiness.warnings.length ? `Complete la tarea y escale: ${readiness.warnings.join(' ')}` : 'Complete y verifique la preparacion de respuesta a emergencias.',
            targetHref: definition.targetHref, data: result,
        };
    } catch (error) {
        await failAgentTask(taskId, error);
        throw error;
    }
}

async function runBroadcastTask(profile: AgentProfile, goal: string, requestedText: string) {
    requireAdmin(profile);
    const definition = playbook('community_broadcast');
    const content = cleanText(requestedText, 700);
    if (content.length < 5) throw new Error('Indica el contenido que deseas comunicar.');
    const taskId = await createAgentTask(profile, definition, goal, [
        { key: 'analyze_request', title: 'Analizar solicitud de comunicado' },
        { key: 'prepare_draft', title: 'Preparar borrador trazable' },
        { key: 'human_publish', title: 'Esperar revision y publicacion humana' },
    ], { requestedText: content });
    try {
        await runVerifiedTaskStep(taskId, 0, async () => ({ contentLength: content.length }), {
            verify: result => result.contentLength >= 5, output: result => result,
        });
        const draft = await runVerifiedTaskStep(taskId, 1, async () => ({ requestedText: content, targetHref: definition.targetHref }), {
            output: result => result,
        });
        await waitAgentTaskForHuman(taskId, 2, { ...draft, reason: 'La publicacion oficial requiere revision editorial.' });
        await recordOperationEvent({
            communityId: profile.community_id!, actorId: profile.id, actorRole: profile.role,
            action: 'agent.task.community_broadcast', entityType: 'agent_task', entityId: taskId,
            severity: 'info', status: 'pending', summary: 'Tarea de comunicado esperando revision humana',
            metadata: { taskId, targetHref: definition.targetHref },
        });
        return {
            entityType: 'agent_task', entityId: taskId, title: 'Comunicado esperando revision',
            message: 'Prepare una tarea persistente con el borrador. Quedo esperando tu revision antes de publicar.',
            targetHref: definition.targetHref, data: { taskId, taskStatus: 'waiting_human' },
        };
    } catch (error) {
        await failAgentTask(taskId, error);
        throw error;
    }
}

export async function runAgentPlaybook(action: AgentAction, profile: AgentProfile) {
    const playbookKey = cleanText(action.args.playbookKey, 80) as PlaybookKey;
    const goal = cleanText(action.args.requestedText, 700) || action.summary;
    if (playbookKey === 'finance_collection_review') return runFinanceCollectionTask(profile, goal);
    if (playbookKey === 'maintenance_ticket_triage') return runMaintenanceTriageTask(profile, goal);
    if (playbookKey === 'onboarding_import_review') return runOnboardingTask(profile, goal);
    if (playbookKey === 'iot_emergency_readiness') return runIotReadinessTask(profile, goal);
    if (playbookKey === 'community_broadcast') return runBroadcastTask(profile, goal, cleanText(action.args.requestedText, 700));
    throw new Error('Accion no soportada.');
}
