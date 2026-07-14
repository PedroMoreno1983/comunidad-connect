import { extractResidentQuery } from '@/lib/agent-center/intentSafety';
import type { AgentAction, AgentKey, AgentProfile } from '@/lib/agent-center/domain';

function cleanMessage(value: string, max = 700) {
    return value.trim().slice(0, max);
}

export function buildClarificationAction(
    message: string,
    agentKey: AgentKey,
    detail = 'Necesito que aclares que deseas consultar o ejecutar. No realice ningun cambio.',
): AgentAction {
    return {
        agentKey,
        toolName: 'clarify_intent',
        args: { requestedText: cleanMessage(message) },
        requiresConfirmation: false,
        title: 'Necesito mas detalle',
        summary: detail,
        targetHref: '/agent-center',
    };
}

export function buildIndividualDebtAction(message: string, profile: AgentProfile): AgentAction {
    if (profile.role === 'admin') {
        const residentQuery = extractResidentQuery(message);
        if (!residentQuery) {
            return buildClarificationAction(message, 'finance', 'Indica el nombre del residente cuya deuda deseas consultar. No realice ningun cambio.');
        }
        return {
            agentKey: 'finance',
            toolName: 'get_resident_expenses',
            args: { residentQuery },
            requiresConfirmation: false,
            title: `Consultar deuda de ${residentQuery}`,
            summary: `CoCo revisara los gastos comunes pendientes de ${residentQuery} dentro de esta comunidad.`,
            targetHref: '/admin/finanzas',
        };
    }

    return {
        agentKey: 'finance',
        toolName: 'get_my_expenses',
        args: {},
        requiresConfirmation: false,
        title: 'Consultar gastos de la unidad',
        summary: 'CoCo revisara los gastos comunes pendientes asociados a tu unidad.',
        targetHref: '/resident/finances',
    };
}
