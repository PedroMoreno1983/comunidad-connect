import {
    AGENT_PLAYBOOKS,
    DEFAULT_COMMUNITY_ID,
    type AgentAction,
    type AgentKey,
    type AgentProfile,
    type AgentSignalEvaluation,
    type AgentTriggerRuleRecord,
    type AgentTriggerRuleSummary,
    type AgentTriggerSignalKey,
    type PlaybookKey,
} from '@/lib/agent-center/domain';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

function objectValue(value: unknown) {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function thresholdMinimum(rule: AgentTriggerRuleRecord) {
    const minimum = Number(rule.threshold.minimum ?? 1);
    return Number.isFinite(minimum) && minimum >= 0 ? minimum : 1;
}

function playbook(key: PlaybookKey) {
    return AGENT_PLAYBOOKS.find(item => item.key === key) || null;
}

function mapRule(row: Record<string, unknown>): AgentTriggerRuleRecord {
    return {
        id: String(row.id),
        communityId: String(row.community_id || DEFAULT_COMMUNITY_ID),
        agentKey: row.agent_key as AgentKey,
        playbookKey: row.playbook_key as PlaybookKey,
        name: String(row.name || 'Regla proactiva'),
        signalKey: row.signal_key as AgentTriggerSignalKey,
        enabled: row.enabled !== false,
        intervalMinutes: Number(row.interval_minutes || 1440),
        cooldownMinutes: Number(row.cooldown_minutes || 720),
        threshold: objectValue(row.threshold),
        context: objectValue(row.context),
        lastEvaluatedAt: typeof row.last_evaluated_at === 'string' ? row.last_evaluated_at : null,
        lastTriggeredAt: typeof row.last_triggered_at === 'string' ? row.last_triggered_at : null,
        nextRunAt: String(row.next_run_at || new Date().toISOString()),
    };
}

async function evaluateOverdueExpenses(rule: AgentTriggerRuleRecord): Promise<AgentSignalEvaluation> {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await getSupabaseAdmin()
        .from('expenses')
        .select('id, amount, due_date, status')
        .eq('community_id', rule.communityId)
        .in('status', ['pending', 'overdue'])
        .lt('due_date', today)
        .limit(500);
    if (error) throw error;
    const rows = data || [];
    const amount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return {
        metric: rows.length,
        shouldTrigger: rows.length >= thresholdMinimum(rule),
        evidence: `${rows.length} gasto(s) vencido(s) por $${amount.toLocaleString('es-CL')}.`,
        payload: { overdueCount: rows.length, overdueAmount: amount, evaluatedAt: new Date().toISOString() },
    };
}

async function evaluateMaintenanceBacklog(rule: AgentTriggerRuleRecord): Promise<AgentSignalEvaluation> {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await getSupabaseAdmin()
        .from('service_requests')
        .select('id, preferred_date, status')
        .eq('community_id', rule.communityId)
        .in('status', ['pending', 'accepted', 'in-progress'])
        .limit(500);
    if (error) throw error;
    const rows = data || [];
    const overdue = rows.filter(row => row.preferred_date && String(row.preferred_date) < today).length;
    return {
        metric: overdue,
        shouldTrigger: overdue >= thresholdMinimum(rule),
        evidence: `${overdue} de ${rows.length} ticket(s) abierto(s) tienen fecha vencida.`,
        payload: { openRequests: rows.length, overdueRequests: overdue, evaluatedAt: new Date().toISOString() },
    };
}

async function evaluateOnboardingGap(rule: AgentTriggerRuleRecord): Promise<AgentSignalEvaluation> {
    const admin = getSupabaseAdmin();
    const [{ count: units, error }, { count: residents, error: residentsError }] = await Promise.all([
        admin.from('units').select('id', { count: 'exact', head: true }).eq('community_id', rule.communityId),
        admin.from('profiles').select('id', { count: 'exact', head: true }).eq('community_id', rule.communityId).eq('role', 'resident'),
    ]);
    if (error) throw error;
    if (residentsError) throw residentsError;
    const gap = Math.max(0, (units || 0) - (residents || 0));
    return {
        metric: gap,
        shouldTrigger: gap >= thresholdMinimum(rule),
        evidence: `${units || 0} unidad(es), ${residents || 0} residente(s) y una brecha estimada de ${gap}.`,
        payload: { units: units || 0, residents: residents || 0, gap, evaluatedAt: new Date().toISOString() },
    };
}

async function evaluateEmergencyReadiness(rule: AgentTriggerRuleRecord): Promise<AgentSignalEvaluation> {
    const admin = getSupabaseAdmin();
    const [{ count: staff, error }, { count: providers, error: providerError }] = await Promise.all([
        admin.from('profiles').select('id', { count: 'exact', head: true }).eq('community_id', rule.communityId).in('role', ['admin', 'concierge']),
        admin.from('service_providers').select('id', { count: 'exact', head: true }).eq('community_id', rule.communityId).eq('verified', true),
    ]);
    if (error) throw error;
    if (providerError) throw providerError;
    const gaps = Number((staff || 0) === 0) + Number((providers || 0) === 0);
    return {
        metric: gaps,
        shouldTrigger: gaps >= thresholdMinimum(rule),
        evidence: gaps ? `Preparacion incompleta: ${staff || 0} responsable(s) y ${providers || 0} proveedor(es) verificado(s).` : 'Responsables y proveedores verificados disponibles.',
        payload: { staffCount: staff || 0, providerCount: providers || 0, readinessGaps: gaps, evaluatedAt: new Date().toISOString() },
    };
}

async function evaluateSignal(rule: AgentTriggerRuleRecord) {
    if (rule.signalKey === 'overdue_expenses') return evaluateOverdueExpenses(rule);
    if (rule.signalKey === 'maintenance_backlog') return evaluateMaintenanceBacklog(rule);
    if (rule.signalKey === 'onboarding_gap') return evaluateOnboardingGap(rule);
    if (rule.signalKey === 'emergency_readiness') return evaluateEmergencyReadiness(rule);
    throw new Error('Senal proactiva no soportada.');
}


function proposalArgs(value: unknown) {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

async function findPendingProactiveProposal(rule: AgentTriggerRuleRecord) {
    const { data, error } = await getSupabaseAdmin()
        .from('agent_tool_calls')
        .select('id, run_id, args, agent_runs!inner(id, status, community_id, agent_key, summary, metadata)')
        .eq('community_id', rule.communityId)
        .eq('tool_name', 'run_playbook')
        .eq('status', 'proposed')
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) throw error;

    const existing = (data || []).find(row => {
        const args = proposalArgs(row.args);
        return args.triggerRuleId === rule.id
            || (args.playbookKey === rule.playbookKey && String(args.requestedText || '').startsWith(`${rule.name}:`));
    });
    if (!existing) return null;
    return { runId: String(existing.run_id), toolCallId: String(existing.id) };
}
async function createProactiveProposal(rule: AgentTriggerRuleRecord, signal: AgentSignalEvaluation, eventId: string) {
    const definition = playbook(rule.playbookKey);
    if (!definition) throw new Error('Playbook proactivo no soportado.');
    const admin = getSupabaseAdmin();
    const { data: actor, error: actorError } = await admin
        .from('profiles')
        .select('id, name, email')
        .eq('community_id', rule.communityId)
        .eq('role', 'admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
    if (actorError) throw actorError;
    if (!actor) throw new Error('La comunidad no tiene un administrador para recibir la propuesta.');

    const summary = `${rule.name}: ${signal.evidence}`;
    const args = { playbookKey: rule.playbookKey, requestedText: summary, triggerEventId: eventId, triggerRuleId: rule.id };
    const existingProposal = await findPendingProactiveProposal(rule);
    if (existingProposal) return existingProposal;
    const proposedAction = {
        agentKey: rule.agentKey,
        toolName: 'run_playbook',
        title: `Revision proactiva: ${rule.name}`,
        summary,
        args,
        targetHref: definition.targetHref,
    };
    const { data: policy } = await admin
        .from('agent_policies')
        .select('autonomy_level, active')
        .eq('community_id', rule.communityId)
        .eq('agent_key', rule.agentKey)
        .maybeSingle();
    if (policy?.active === false) throw new Error(`El agente ${rule.agentKey} esta desactivado.`);

    const { data: run, error: runError } = await admin.from('agent_runs').insert({
        user_id: actor.id,
        community_id: rule.communityId,
        agent_key: rule.agentKey,
        intent: 'run_playbook',
        user_message: summary,
        autonomy_level: policy?.autonomy_level || 'manual',
        status: 'awaiting_confirmation',
        summary: `Preparado para revision: ${rule.name}`,
        metadata: { displayAction: rule.name, displaySummary: summary, targetHref: definition.targetHref, proposedAction, triggerEventId: eventId },
    }).select('id').single();
    if (runError) throw runError;

    const { data: toolCall, error: toolError } = await admin.from('agent_tool_calls').insert({
        run_id: run.id,
        user_id: actor.id,
        community_id: rule.communityId,
        tool_name: 'run_playbook',
        args,
        result: {},
        requires_confirmation: true,
        status: 'proposed',
    }).select('id').single();
    if (toolError) {
        await admin.from('agent_runs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', run.id);
        throw toolError;
    }

    await admin.from('agent_activity_log').insert({
        community_id: rule.communityId,
        user_id: actor.id,
        agent_key: rule.agentKey,
        action: 'proactive_signal',
        severity: 'warning',
        summary,
        metadata: { runId: run.id, toolCallId: toolCall.id, displayAction: rule.name, displaySummary: summary, proposedAction, triggerEventId: eventId },
    });
    return { runId: String(run.id), toolCallId: String(toolCall.id) };
}

async function evaluateRule(rule: AgentTriggerRuleRecord) {
    const admin = getSupabaseAdmin();
    const now = new Date();
    const nextRunAt = new Date(now.getTime() + rule.intervalMinutes * 60_000).toISOString();
    const signal = await evaluateSignal(rule);
    await admin.from('agent_trigger_rules').update({ last_evaluated_at: now.toISOString(), next_run_at: nextRunAt, updated_at: now.toISOString() }).eq('id', rule.id);
    if (!signal.shouldTrigger) return { ruleId: rule.id, status: 'skipped', metric: signal.metric };

    const lastTriggered = rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt).getTime() : 0;
    if (lastTriggered && now.getTime() - lastTriggered < rule.cooldownMinutes * 60_000) {
        return { ruleId: rule.id, status: 'cooldown', metric: signal.metric };
    }
    const bucket = Math.floor(now.getTime() / (rule.cooldownMinutes * 60_000));
    const dedupeKey = `${rule.id}:${bucket}:${signal.metric}`;
    const { data: event, error: eventError } = await admin.from('agent_trigger_events').insert({
        rule_id: rule.id,
        community_id: rule.communityId,
        signal_key: rule.signalKey,
        dedupe_key: dedupeKey,
        metric: signal.metric,
        payload: signal.payload,
        status: 'detected',
    }).select('id').single();
    if (eventError?.code === '23505') return { ruleId: rule.id, status: 'duplicate', metric: signal.metric };
    if (eventError) throw eventError;

    try {
        const proposal = await createProactiveProposal(rule, signal, String(event.id));
        await admin.from('agent_trigger_events').update({ status: 'proposal_created', run_id: proposal.runId, tool_call_id: proposal.toolCallId, processed_at: new Date().toISOString() }).eq('id', event.id);
        await admin.from('agent_trigger_rules').update({ last_triggered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', rule.id);
        return { ruleId: rule.id, status: 'proposal_created', metric: signal.metric, ...proposal };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo crear la propuesta.';
        await admin.from('agent_trigger_events').update({ status: 'failed', error: message, processed_at: new Date().toISOString() }).eq('id', event.id);
        throw error;
    }
}

export async function evaluateDueAgentTriggers(communityId?: string) {
    const now = new Date().toISOString();
    let query = getSupabaseAdmin()
        .from('agent_trigger_rules')
        .select('*')
        .eq('enabled', true)
        .lte('next_run_at', now)
        .order('next_run_at', { ascending: true })
        .limit(50);
    if (communityId) query = query.eq('community_id', communityId);
    const { data, error } = await query;
    if (error) throw error;
    const results: Array<Record<string, unknown>> = [];
    for (const row of data || []) {
        const rule = mapRule(row);
        try {
            results.push(await evaluateRule(rule));
        } catch (ruleError) {
            results.push({ ruleId: rule.id, status: 'failed', error: ruleError instanceof Error ? ruleError.message : 'Error desconocido' });
        }
    }
    return { evaluatedAt: now, dueRules: (data || []).length, results };
}

export async function getAgentTriggerRules(profile: AgentProfile): Promise<AgentTriggerRuleSummary[]> {
    if (!profile.community_id) return [];
    const { data, error } = await getSupabaseAdmin()
        .from('agent_trigger_rules')
        .select('*')
        .eq('community_id', profile.community_id)
        .order('name');
    if (error) throw error;
    return (data || []).map(row => {
        const rule = mapRule(row);
        return {
            id: rule.id,
            agentKey: rule.agentKey,
            playbookKey: rule.playbookKey,
            name: rule.name,
            signalKey: rule.signalKey,
            enabled: rule.enabled,
            intervalMinutes: rule.intervalMinutes,
            cooldownMinutes: rule.cooldownMinutes,
            lastEvaluatedAt: rule.lastEvaluatedAt,
            lastTriggeredAt: rule.lastTriggeredAt,
            nextRunAt: rule.nextRunAt,
        };
    });
}

export async function updateAgentTriggerRule(profile: AgentProfile, ruleId: unknown, enabled: unknown) {
    if (profile.role !== 'admin' || !profile.community_id) throw new Error('Solo administracion puede cambiar reglas proactivas.');
    if (typeof ruleId !== 'string' || typeof enabled !== 'boolean') throw new Error('Configuracion de regla invalida.');
    const { data, error } = await getSupabaseAdmin()
        .from('agent_trigger_rules')
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq('id', ruleId)
        .eq('community_id', profile.community_id)
        .select('id')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('No encontre la regla proactiva en esta comunidad.');
}

export async function getPendingAgentProposals(profile: AgentProfile): Promise<AgentAction[]> {
    if (!profile.community_id) return [];
    const { data, error } = await getSupabaseAdmin()
        .from('agent_tool_calls')
        .select('id, run_id, tool_name, args, requires_confirmation, agent_runs!inner(id, agent_key, community_id, user_message, summary, metadata)')
        .eq('community_id', profile.community_id)
        .eq('status', 'proposed')
        .order('created_at', { ascending: false })
        .limit(20);
    if (error) throw error;
    return (data || []).flatMap(row => {
        const run = Array.isArray(row.agent_runs) ? row.agent_runs[0] : row.agent_runs;
        if (!run || !['finance', 'maintenance', 'concierge', 'community'].includes(String(run.agent_key))) return [];
        const metadata = objectValue(run.metadata);
        const stored = objectValue(metadata.proposedAction);
        const args = objectValue(row.args);
        const definition = playbook(String(args.playbookKey || '') as PlaybookKey);
        return [{
            agentKey: run.agent_key as AgentKey,
            toolName: row.tool_name as AgentAction['toolName'],
            args,
            requiresConfirmation: Boolean(row.requires_confirmation),
            title: String(stored.title || run.summary || 'Propuesta proactiva'),
            summary: String(stored.summary || run.user_message || 'CoCo preparo una propuesta para revision.'),
            targetHref: String(stored.targetHref || metadata.targetHref || definition?.targetHref || '/agent-center'),
            proposalId: String(row.id),
            runId: String(row.run_id),
        }];
    });
}
