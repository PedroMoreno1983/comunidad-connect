import type { ServerAgentProfile } from '@/lib/server/agentIdentity';

export type AgentKey = 'finance' | 'maintenance' | 'concierge' | 'community';
export type AutonomyLevel = 'manual' | 'semi_autonomous' | 'autonomous';
export type ToolName =
    | 'create_booking'
    | 'create_marketplace_item'
    | 'create_announcement'
    | 'create_service_request'
    | 'register_visitor'
    | 'get_my_expenses'
    | 'get_resident_expenses'
    | 'create_unit_expense'
    | 'send_unit_payment_reminder'
    | 'get_community_snapshot'
    | 'answer_community_question'
    | 'clarify_intent'
    | 'run_playbook'
    | 'run_mission';

export const AGENT_TOOL_NAMES: ToolName[] = [
    'create_booking',
    'create_marketplace_item',
    'create_announcement',
    'create_service_request',
    'register_visitor',
    'get_my_expenses',
    'get_resident_expenses',
    'create_unit_expense',
    'send_unit_payment_reminder',
    'get_community_snapshot',
    'answer_community_question',
    'clarify_intent',
    'run_playbook',
    'run_mission',
];

export const TOOL_AGENT_KEYS: Partial<Record<ToolName, AgentKey>> = {
    create_booking: 'maintenance',
    create_marketplace_item: 'community',
    create_announcement: 'community',
    create_service_request: 'maintenance',
    register_visitor: 'concierge',
    get_my_expenses: 'finance',
    get_resident_expenses: 'finance',
    create_unit_expense: 'finance',
    send_unit_payment_reminder: 'finance',
    answer_community_question: 'community',
};

// Solo lecturas reales: cualquier herramienta que escriba (incluidos cobros y
// recordatorios de pago) debe quedar fuera para forzar confirmacion humana.
export const READ_ONLY_AGENT_TOOLS: ToolName[] = [
    'get_my_expenses',
    'get_resident_expenses',
    'get_community_snapshot',
    'answer_community_question',
    'clarify_intent',
];

export const MUTATING_AGENT_TOOLS: ToolName[] = AGENT_TOOL_NAMES.filter(
    toolName => !READ_ONLY_AGENT_TOOLS.includes(toolName),
);

// ---------------------------------------------------------------------------
// Niveles de riesgo por herramienta — base de la graduacion de autonomia.
// read:       nunca escribe; nunca requiere confirmacion.
// write_low:  escritura reversible y de bajo impacto (reservas, avisos propios,
//             tickets, bitacora de visitas).
// write_high: escritura con impacto financiero, difusion a terceros o batch
//             (cobros, recordatorios con WhatsApp, comunicados, playbooks).
// ---------------------------------------------------------------------------
export type ToolRiskLevel = 'read' | 'write_low' | 'write_high';

export const TOOL_RISK_LEVELS: Record<ToolName, ToolRiskLevel> = {
    get_my_expenses: 'read',
    get_resident_expenses: 'read',
    get_community_snapshot: 'read',
    answer_community_question: 'read',
    clarify_intent: 'read',
    create_booking: 'write_low',
    create_marketplace_item: 'write_low',
    create_service_request: 'write_low',
    register_visitor: 'write_low',
    create_unit_expense: 'write_high',
    send_unit_payment_reminder: 'write_high',
    create_announcement: 'write_high',
    run_playbook: 'write_high',
    run_mission: 'write_high',
};

/**
 * Decide si una accion requiere confirmacion humana segun la politica del
 * agente responsable. Reglas:
 * - Las lecturas nunca requieren confirmacion.
 * - run_playbook siempre requiere confirmacion (operaciones batch).
 * - manual:           toda escritura requiere confirmacion.
 * - semi_autonomous:  solo write_high requiere confirmacion.
 * - autonomous:       write_low y write_high corren sin confirmacion (playbooks
 *                   excluidos); todo queda auditado igual.
 */
export function effectiveRequiresConfirmation(
    toolName: ToolName,
    policy: Pick<AgentPolicy, 'autonomyLevel'>,
): boolean {
    const risk = TOOL_RISK_LEVELS[toolName];
    if (risk === 'read') return false;
    if (toolName === 'run_playbook') return true;
    if (policy.autonomyLevel === 'autonomous') return false;
    if (policy.autonomyLevel === 'semi_autonomous') return risk === 'write_high';
    return true;
}

export type PlaybookKey =
    | 'finance_collection_review'
    | 'maintenance_ticket_triage'
    | 'onboarding_import_review'
    | 'iot_emergency_readiness'
    | 'community_broadcast'
    | 'multi_agent_mission';

export type AgentProfile = ServerAgentProfile;

export type AgentAction = {
    agentKey: AgentKey;
    toolName: ToolName;
    args: Record<string, unknown>;
    requiresConfirmation: boolean;
    title: string;
    summary: string;
    targetHref: string;
    decision?: {
        intent: string;
        confidence: number;
        explanation: string;
    };
    proposalId?: string | null;
    runId?: string | null;
};

export type AgentStep = {
    kind: 'reasoning' | 'tool' | 'confirmation' | 'result' | 'warning';
    title: string;
    detail: string;
    metadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Orquestacion multi-agente: una mision descompone un objetivo en pasos
// ejecutados por agentes distintos, con contexto compartido y una sola
// tarjeta de aprobacion humana.
// ---------------------------------------------------------------------------
export const MAX_MISSION_STEPS = 4;

export type AgentMissionStep = {
    agentKey: AgentKey;
    toolName: ToolName;
    args: Record<string, unknown>;
    title: string;
    rationale: string;
};

export type AgentMissionPlan = {
    goal: string;
    steps: AgentMissionStep[];
};

/**
 * Una mision requiere confirmacion si ALGUNO de sus pasos la requiere segun la
 * politica del agente de ese paso. Los pasos de lectura nunca la piden.
 */
export function missionRequiresConfirmation(
    steps: AgentMissionStep[],
    policies: Record<AgentKey, Pick<AgentPolicy, 'autonomyLevel'>>,
): boolean {
    return steps.some(step => {
        const policy = policies[step.agentKey];
        return effectiveRequiresConfirmation(step.toolName, policy || { autonomyLevel: 'manual' });
    });
}

export type AgentPolicy = {
    agentKey: AgentKey;
    autonomyLevel: AutonomyLevel;
    active: boolean;
    maxDailyActions: number;
    updatedAt?: string | null;
};

export type AgentSummary = {
    totalRuns: number;
    executedRuns: number;
    pendingProposals: number;
    failedRuns: number;
    successRate: number;
    estimatedMinutesSaved: number;
};

export type AgentPlaybook = {
    key: PlaybookKey;
    agentKey: AgentKey;
    name: string;
    description: string;
    targetHref: string;
    requiresAdmin: boolean;
    steps: string[];
};

export type AgentWorkflow = {
    key: PlaybookKey;
    agentKey: AgentKey;
    name: string;
    status: 'ready' | 'needs_review' | 'blocked';
    priority: 'high' | 'medium' | 'low';
    nextAction: string;
    pendingActions: number;
    completedActions: number;
    estimatedMinutesSaved: number;
    targetHref: string;
    summary: string;
    metrics: Array<{ label: string; value: string; tone: 'success' | 'warning' | 'neutral' }>;
};

export type AgentTaskStatus = 'planned' | 'running' | 'waiting_human' | 'completed' | 'failed' | 'escalated' | 'cancelled';
export type AgentTaskStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting_human' | 'skipped';

export type AgentTaskStepSummary = {
    id: string;
    position: number;
    stepKey: string;
    title: string;
    status: AgentTaskStepStatus;
    attempts: number;
    error?: string | null;
};

export type AgentTaskSummary = {
    id: string;
    agentKey: AgentKey;
    playbookKey?: string | null;
    goal: string;
    status: AgentTaskStatus;
    currentStep: number;
    retryCount: number;
    lastError?: string | null;
    targetHref?: string | null;
    createdAt: string;
    updatedAt: string;
    steps: AgentTaskStepSummary[];
};

export type AgentTriggerSignalKey = 'overdue_expenses' | 'maintenance_backlog' | 'onboarding_gap' | 'emergency_readiness';

export type AgentTriggerRuleSummary = {
    id: string;
    agentKey: AgentKey;
    playbookKey: PlaybookKey;
    name: string;
    signalKey: AgentTriggerSignalKey;
    enabled: boolean;
    intervalMinutes: number;
    cooldownMinutes: number;
    lastEvaluatedAt?: string | null;
    lastTriggeredAt?: string | null;
    nextRunAt: string;
};

export type AgentTriggerRuleRecord = AgentTriggerRuleSummary & {
    communityId: string;
    threshold: Record<string, unknown>;
    context: Record<string, unknown>;
};

export type AgentSignalEvaluation = {
    metric: number;
    shouldTrigger: boolean;
    evidence: string;
    payload: Record<string, unknown>;
};

export const DEFAULT_COMMUNITY_ID = '00000000-0000-0000-0000-000000000000';

export const DEFAULT_AGENT_POLICIES: Record<AgentKey, Omit<AgentPolicy, 'agentKey' | 'updatedAt'>> = {
    finance: { autonomyLevel: 'semi_autonomous', active: true, maxDailyActions: 120 },
    community: { autonomyLevel: 'semi_autonomous', active: true, maxDailyActions: 80 },
    maintenance: { autonomyLevel: 'manual', active: true, maxDailyActions: 80 },
    concierge: { autonomyLevel: 'manual', active: true, maxDailyActions: 100 },
};

export const AGENT_PLAYBOOKS: AgentPlaybook[] = [
    {
        key: 'finance_collection_review',
        agentKey: 'finance',
        name: 'Cobranza controlada',
        description: 'Detecta gastos impagos, prepara notificaciones internas y deja auditoria sin exponer deudas a vecinos.',
        targetHref: '/admin/finanzas',
        requiresAdmin: true,
        steps: ['Detectar gastos impagos', 'Resolver unidades y residentes', 'Notificar residentes vinculados', 'Registrar evento operativo'],
    },
    {
        key: 'maintenance_ticket_triage',
        agentKey: 'maintenance',
        name: 'Ordenar tickets',
        description: 'Ordena tickets abiertos, revisa proveedores verificados y deja el seguimiento listo.',
        targetHref: '/admin/mantenimiento',
        requiresAdmin: true,
        steps: ['Detectar tickets abiertos', 'Revisar proveedores verificados', 'Priorizar seguimiento', 'Registrar bitacora'],
    },
    {
        key: 'onboarding_import_review',
        agentKey: 'community',
        name: 'Cargar residentes',
        description: 'Prepara la carga de residentes, revisa datos y sincroniza unidades con confirmacion.',
        targetHref: '/admin/onboarding',
        requiresAdmin: true,
        steps: ['Subir archivo', 'Extraer residentes', 'Revisar advertencias', 'Sincronizar perfiles y unidades'],
    },
    {
        key: 'iot_emergency_readiness',
        agentKey: 'maintenance',
        name: 'Preparacion de emergencias',
        description: 'Verifica que el edificio tenga responsables y proveedores listos para responder a eventos criticos.',
        targetHref: '/admin/mantenimiento',
        requiresAdmin: true,
        steps: ['Revisar staff disponible', 'Revisar proveedores verificados', 'Crear checklist operativo', 'Registrar brechas'],
    },
    {
        key: 'community_broadcast',
        agentKey: 'community',
        name: 'Comunicado comunitario',
        description: 'Prepara un comunicado trazable para administracion o conserjeria con confirmacion antes de publicar.',
        targetHref: '/comunicaciones',
        requiresAdmin: false,
        steps: ['Definir titulo', 'Redactar contenido', 'Confirmar publicacion', 'Auditar difusion'],
    },
];
