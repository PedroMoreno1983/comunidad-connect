import { extractResidentQuery, extractUnitNumber, looksReadOnlyRequest } from '@/lib/agent-center/intentSafety';
import { MUTATING_AGENT_TOOLS, type AgentAction, type AgentKey, type AgentProfile } from '@/lib/agent-center/domain';

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
    // Agent Center es exclusivo de administracion; los residentes usan /resident/finances.
    if (profile.role !== 'admin') {
        return buildClarificationAction(message, 'finance', 'La gestion de deudas de residentes es exclusiva de administracion. No realice ningun cambio.');
    }
    const residentQuery = extractResidentQuery(message);
    const unitNumber = extractUnitNumber(message);
    if (!residentQuery && !unitNumber) {
        return buildClarificationAction(message, 'finance', 'Indica el nombre del residente o el numero de departamento cuya deuda deseas consultar. No realice ningun cambio.');
    }
    const subject = unitNumber ? `Depto ${unitNumber}` : residentQuery;
    return {
        agentKey: 'finance',
        toolName: 'get_resident_expenses',
        args: unitNumber ? { unitNumber } : { residentQuery },
        requiresConfirmation: false,
        title: `Consultar deuda de ${subject}`,
        summary: `CoCo revisara los gastos comunes pendientes de ${subject} dentro de esta comunidad.`,
        targetHref: '/admin/finanzas',
    };
}

export function preventReadOnlyMutation(message: string, action: AgentAction): AgentAction {
    if (!looksReadOnlyRequest(message) || !MUTATING_AGENT_TOOLS.includes(action.toolName)) return action;
    return buildClarificationAction(
        message,
        action.agentKey,
        'Entendi que deseas consultar informacion, pero necesito mas detalle para elegir una fuente segura. No realice ningun cambio.',
    );
}
