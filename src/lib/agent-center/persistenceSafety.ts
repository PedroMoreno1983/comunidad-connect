import { DEFAULT_COMMUNITY_ID, type AgentAction, type AgentPolicy, type AgentProfile } from '@/lib/agent-center/domain';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export async function assertDailyActionLimit(profile: AgentProfile, action: AgentAction, policy: AgentPolicy) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await getSupabaseAdmin()
        .from('agent_runs')
        .select('id', { count: 'exact', head: true })
        .eq('community_id', profile.community_id || DEFAULT_COMMUNITY_ID)
        .eq('agent_key', action.agentKey)
        .eq('status', 'executed')
        .gte('created_at', since);
    if (error) throw error;
    if ((count || 0) >= policy.maxDailyActions) {
        throw new Error(`El agente ${action.agentKey} alcanzo su limite de ${policy.maxDailyActions} acciones en 24 horas.`);
    }
}

export async function claimPersistedProposal(action: AgentAction, status: 'executed' | 'rejected') {
    if (!action.proposalId) return;
    const { data, error } = await getSupabaseAdmin()
        .from('agent_tool_calls')
        .update({ status, executed_at: status === 'executed' ? new Date().toISOString() : null })
        .eq('id', action.proposalId)
        .eq('status', 'proposed')
        .select('id')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('La propuesta ya fue procesada por otra solicitud.');
}
