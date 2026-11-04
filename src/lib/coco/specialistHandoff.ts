/**
 * Deja el pedido en el task engine y audita cada traspaso.
 * Los especialistas no ejecutan escrituras: el riesgo de cada paso sigue en el chat.
 */

import type { AgentPlaybook, AgentProfile } from '@/lib/agent-center/domain';
import { completeAgentTask, createAgentTask } from '@/lib/agent-center/taskEngine';
import { recordOperationEvent } from '@/lib/operations/audit';
import { handoffChain, planSpecialists, SPECIALIST_BRIEFS, type SpecialistKey } from './specialists';

const PLAYBOOK: AgentPlaybook = {
    key: 'coco_specialist_handoff',
    agentKey: 'community',
    name: 'Cocos especializados',
    description: 'Reparte un pedido entre cobranza, legal y mantención, con traspaso auditado y sin escrituras automáticas.',
    targetHref: '/chat',
    requiresAdmin: true,
    steps: ['Traspasar', 'Dejar el encargo'],
};

const AGENT_KEY: Record<SpecialistKey, 'finance' | 'maintenance' | 'community'> = {
    cobranza: 'finance',
    legal: 'community',
    mantencion: 'maintenance',
};

export async function coordinateSpecialists(profile: AgentProfile, message: string) {
    if (profile.role !== 'admin' || !profile.community_id) {
        return { error: 'Solo la administración puede coordinar a los Cocos.' };
    }
    const plan = planSpecialists(message);
    if ('error' in plan) return plan;
    const handoffs = handoffChain(plan.specialists);
    for (const hop of handoffs) {
        await recordOperationEvent({
            communityId: profile.community_id,
            actorId: profile.id,
            actorRole: 'admin',
            action: 'coco.handoff',
            entityType: 'coco_specialist',
            entityId: hop.to,
            summary: `CoCo pasó el pedido de ${hop.from} a ${hop.to}.`,
            metadata: { from: hop.from, to: hop.to, agentKey: AGENT_KEY[hop.to as SpecialistKey] || null, goal: plan.goal },
        });
    }
    const taskId = await createAgentTask(profile, PLAYBOOK, plan.goal, plan.specialists.map(key => ({
        key,
        title: SPECIALIST_BRIEFS[key],
        status: 'completed' as const,
        output: { specialist: key, brief: SPECIALIST_BRIEFS[key], writes: false },
    })), { specialists: plan.specialists, writes: false });
    await completeAgentTask(taskId, { specialists: plan.specialists, writes: false });
    return {
        success: true,
        task_id: taskId,
        specialists: plan.specialists,
        briefs: plan.specialists.map(key => ({ specialist: key, brief: SPECIALIST_BRIEFS[key] })),
        message: `Pasé el pedido por ${plan.specialists.join(' y ')}. Ninguno cambió datos.`,
    };
}
