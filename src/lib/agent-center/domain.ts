import type { ServerAgentProfile } from '@/lib/server/agentIdentity';

export type AgentKey = 'finance' | 'maintenance' | 'concierge' | 'community';
export type AutonomyLevel = 'manual' | 'semi_autonomous' | 'autonomous';
export type ToolName =
    | 'get_amenities'
    | 'create_booking'
    | 'create_marketplace_item'
    | 'create_announcement'
    | 'create_service_request'
    | 'register_visitor'
    | 'get_my_expenses'
    | 'run_playbook';

export type PlaybookKey =
    | 'finance_collection_review'
    | 'maintenance_ticket_triage'
    | 'onboarding_import_review'
    | 'iot_emergency_readiness'
    | 'community_broadcast';

export type AgentProfile = ServerAgentProfile;

export type AgentAction = {
    agentKey: AgentKey;
    toolName: ToolName;
    args: Record<string, unknown>;
    requiresConfirmation: boolean;
    title: string;
    summary: string;
    targetHref: string;
    proposalId?: string | null;
    runId?: string | null;
};

export type AgentStep = {
    kind: 'reasoning' | 'tool' | 'confirmation' | 'result' | 'warning';
    title: string;
    detail: string;
    metadata?: Record<string, unknown>;
};

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
