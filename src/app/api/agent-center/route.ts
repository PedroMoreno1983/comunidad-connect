import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile, type ServerAgentProfile } from '@/lib/server/agentIdentity';
import { recordOperationEvent } from '@/lib/operations/audit';

type AgentKey = 'finance' | 'maintenance' | 'concierge' | 'community';
type AutonomyLevel = 'manual' | 'semi_autonomous' | 'autonomous';
type ToolName =
    | 'get_amenities'
    | 'create_booking'
    | 'create_marketplace_item'
    | 'create_announcement'
    | 'create_service_request'
    | 'register_visitor'
    | 'get_my_expenses'
    | 'run_playbook';

type PlaybookKey =
    | 'finance_collection_review'
    | 'maintenance_ticket_triage'
    | 'onboarding_import_review'
    | 'iot_emergency_readiness'
    | 'community_broadcast';

type AgentProfile = ServerAgentProfile;

type AgentAction = {
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

type AgentStep = {
    kind: 'reasoning' | 'tool' | 'confirmation' | 'result' | 'warning';
    title: string;
    detail: string;
    metadata?: Record<string, unknown>;
};

const DEFAULT_COMMUNITY_ID = '00000000-0000-0000-0000-000000000000';

type AgentPolicy = {
    agentKey: AgentKey;
    autonomyLevel: AutonomyLevel;
    active: boolean;
    maxDailyActions: number;
    updatedAt?: string | null;
};

type AgentSummary = {
    totalRuns: number;
    executedRuns: number;
    pendingProposals: number;
    failedRuns: number;
    successRate: number;
    estimatedMinutesSaved: number;
};

type AgentPlaybook = {
    key: PlaybookKey;
    agentKey: AgentKey;
    name: string;
    description: string;
    targetHref: string;
    requiresAdmin: boolean;
    steps: string[];
};

type AgentWorkflow = {
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

const DEFAULT_AGENT_POLICIES: Record<AgentKey, Omit<AgentPolicy, 'agentKey' | 'updatedAt'>> = {
    finance: { autonomyLevel: 'semi_autonomous', active: true, maxDailyActions: 120 },
    community: { autonomyLevel: 'semi_autonomous', active: true, maxDailyActions: 80 },
    maintenance: { autonomyLevel: 'manual', active: true, maxDailyActions: 80 },
    concierge: { autonomyLevel: 'manual', active: true, maxDailyActions: 100 },
};

const AGENT_PLAYBOOKS: AgentPlaybook[] = [
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
        description: 'Ordena tickets abiertos, revisa proveedores y deja el seguimiento listo.',
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
        name: 'Emergencia IoT',
        description: 'Verifica que el edificio tenga responsables y proveedores listos para responder a alertas criticas.',
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

function cleanText(value: unknown, max = 500) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function isSmallTalk(message: string) {
    const normalized = normalizeText(message).replace(/[!?.\s]+$/g, '');
    return /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|gracias|ok|oka|dale)$/.test(normalized);
}

function isTooAmbiguousForAction(message: string) {
    const normalized = normalizeText(message);
    if (normalized.length > 18) return false;
    const actionHints = [
        'gasto',
        'pago',
        'deuda',
        'moros',
        'visita',
        'visitante',
        'paquete',
        'ingreso',
        'marketplace',
        'vender',
        'publica',
        'aviso',
        'comunicado',
        'reserva',
        'quincho',
        'sala',
        'ticket',
        'reclamo',
        'falla',
        'mantencion',
        'ascensor',
        'luz',
        'filtracion',
        'playbook',
    ];
    return !actionHints.some(hint => normalized.includes(hint));
}

function moneyFromText(text: string) {
    const compact = text.toLowerCase().replace(/\./g, '');
    const match = compact.match(/(?:\$|a\s+)?(\d{1,8})(?:\s*(mil|k))?/);
    if (!match) return 0;
    const amount = Number(match[1]);
    return match[2] ? amount * 1000 : amount;
}

function getNextWeekdayDate(targetWeekday: number) {
    const now = new Date();
    const current = now.getDay();
    const delta = (targetWeekday + 7 - current) % 7 || 7;
    const date = new Date(now);
    date.setDate(now.getDate() + delta);
    return date.toISOString().slice(0, 10);
}

function dateFromText(text: string) {
    const lower = text.toLowerCase();
    const iso = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) return iso[1];
    if (lower.includes('mañana') || lower.includes('manana')) {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        return date.toISOString().slice(0, 10);
    }
    const weekdays: Record<string, number> = {
        domingo: 0,
        lunes: 1,
        martes: 2,
        miercoles: 3,
        miércoles: 3,
        jueves: 4,
        viernes: 5,
        sabado: 6,
        sábado: 6,
    };
    const found = Object.entries(weekdays).find(([name]) => lower.includes(name));
    return found ? getNextWeekdayDate(found[1]) : new Date().toISOString().slice(0, 10);
}

function timeFromText(text: string) {
    const match = text.match(/\b([01]?\d|2[0-3])(?::([0-5]\d))?\b/);
    const hour = match ? Number(match[1]) : 10;
    const minute = match?.[2] || '00';
    const start = `${String(hour).padStart(2, '0')}:${minute}`;
    const endHour = Math.min(23, hour + 2);
    return { start, end: `${String(endHour).padStart(2, '0')}:${minute}` };
}

function pickAgent(message: string): AgentKey {
    const lower = message.toLowerCase();
    if (lower.includes('gasto') || lower.includes('pago') || lower.includes('moros')) return 'finance';
    if (lower.includes('visita') || lower.includes('visitante') || lower.includes('paquete') || lower.includes('ingreso')) return 'concierge';
    if (lower.includes('marketplace') || lower.includes('vender') || lower.includes('aviso') || lower.includes('comunicado')) return 'community';
    return 'maintenance';
}

function getPlaybook(key: unknown) {
    return AGENT_PLAYBOOKS.find(playbook => playbook.key === key) || null;
}

function playbookAction(playbook: AgentPlaybook, message: string): AgentAction {
    return {
        agentKey: playbook.agentKey,
        toolName: 'run_playbook',
        args: {
            playbookKey: playbook.key,
            requestedText: cleanText(message, 600),
        },
        requiresConfirmation: true,
        title: `Preparar revision: ${playbook.name}`,
        summary: playbook.description,
        targetHref: playbook.targetHref,
    };
}

const AGENT_LABELS: Record<AgentKey, string> = {
    finance: 'Finanzas',
    maintenance: 'Mantenimiento',
    concierge: 'Conserjeria',
    community: 'Comunidad',
};

const TOOL_LABELS: Record<ToolName, string> = {
    get_amenities: 'Consultar espacios comunes',
    create_booking: 'Preparar reserva',
    create_marketplace_item: 'Preparar publicacion',
    create_announcement: 'Preparar comunicado',
    create_service_request: 'Preparar solicitud de servicio',
    register_visitor: 'Registrar visita',
    get_my_expenses: 'Consultar gastos comunes',
    run_playbook: 'Preparar revision',
};

function humanizeArgKey(key: string) {
    const labels: Record<string, string> = {
        amenityHint: 'Espacio',
        category: 'Categoria',
        date: 'Fecha',
        description: 'Descripcion',
        endTime: 'Termino',
        playbookKey: 'Accion',
        preferredDate: 'Fecha preferida',
        preferredTime: 'Hora preferida',
        price: 'Precio',
        requestedText: 'Solicitud original',
        startTime: 'Inicio',
        title: 'Titulo',
        visitorName: 'Visitante',
    };
    return labels[key] || key;
}

function summarizeArgs(args: Record<string, unknown>) {
    const summary = Object.entries(args)
        .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
        .map(([key, value]) => `${humanizeArgKey(key)}: ${String(value).slice(0, 90)}`)
        .join(' · ');

    return summary || 'Sin parametros adicionales.';
}

function traceStepsForAction(action: AgentAction): AgentStep[] {
    const playbook = action.toolName === 'run_playbook' ? getPlaybook(action.args.playbookKey) : null;

    if (playbook) {
        return [
            {
                kind: 'reasoning',
                title: 'Accion seleccionada',
                detail: `${playbook.name}. ${playbook.description}`,
            },
            {
                kind: 'tool',
                title: 'Pasos preparados',
                detail: playbook.steps.join(' -> '),
                metadata: action.args,
            },
        ];
    }

    return [
        {
            kind: 'reasoning',
            title: 'Accion preparada',
            detail: `${AGENT_LABELS[action.agentKey]} preparo: ${TOOL_LABELS[action.toolName]}.`,
        },
        {
            kind: 'tool',
            title: 'Datos a revisar',
            detail: summarizeArgs(action.args),
            metadata: action.args,
        },
    ];
}

function activityDisplayForAction(action: AgentAction) {
    const playbook = action.toolName === 'run_playbook' ? getPlaybook(action.args.playbookKey) : null;
    if (playbook) return playbook.name;
    return TOOL_LABELS[action.toolName] || 'Actividad CoCo';
}

function activitySummaryForStatus(action: AgentAction, status: 'preview' | 'executed' | 'failed' | 'rejected') {
    const displayName = activityDisplayForAction(action).replace(/^Workflow: /, '');

    if (status === 'executed') return `Ejecutado: ${displayName}`;
    if (status === 'rejected') return `Rechazado: ${displayName}`;
    if (status === 'failed') return `Error al procesar: ${displayName}`;
    return `Preparado para revision: ${displayName}`;
}

function inferActionHeuristic(message: string): AgentAction {
    const lower = message.toLowerCase();
    const agentKey = pickAgent(message);
    const date = dateFromText(message);
    const { start, end } = timeFromText(message);
    const wantsWorkflow = lower.includes('playbook') || lower.includes('workflow') || lower.includes('flujo') || lower.includes('proceso') || lower.includes('prepara');
    const wantsResidentOnboarding = lower.includes('onboarding') || lower.includes('nomina') || lower.includes('residentes') || lower.includes('cargar usuarios') || lower.includes('cargar edificio') || lower.includes('activar edificio');
    const wantsCollection = lower.includes('moros') || lower.includes('cobran') || lower.includes('impago') || lower.includes('deudor') || lower.includes('cobros pendientes');
    const wantsIotReadiness = lower.includes('iot') || lower.includes('emergencia') || lower.includes('filtracion');
    const wantsMaintenanceReview = lower.includes('tickets abiertos') || lower.includes('triage') || lower.includes('mantencion') || lower.includes('mantenimiento') || lower.includes('proveedor');
    const wantsBroadcastWorkflow = (wantsWorkflow || lower.includes('difusion')) && (lower.includes('comunicado') || lower.includes('aviso') || lower.includes('anuncio'));

    if (wantsResidentOnboarding) {
        const playbook = getPlaybook('onboarding_import_review');
        if (playbook) return playbookAction(playbook, message);
    }
    if (wantsCollection) {
        const playbook = getPlaybook('finance_collection_review');
        if (playbook) return playbookAction(playbook, message);
    }
    if (wantsIotReadiness) {
        const playbook = getPlaybook('iot_emergency_readiness');
        if (playbook) return playbookAction(playbook, message);
    }
    if (wantsMaintenanceReview && wantsWorkflow) {
        const playbook = getPlaybook('maintenance_ticket_triage');
        if (playbook) return playbookAction(playbook, message);
    }
    if (wantsBroadcastWorkflow) {
        const playbook = getPlaybook('community_broadcast');
        if (playbook) return playbookAction(playbook, message);
    }

    if (lower.includes('gasto') || lower.includes('pago') || lower.includes('deuda')) {
        return {
            agentKey: 'finance',
            toolName: 'get_my_expenses',
            args: {},
            requiresConfirmation: false,
            title: 'Consultar gastos de la unidad',
            summary: 'CoCo revisara gastos comunes pendientes asociados a tu unidad.',
            targetHref: '/resident/finances',
        };
    }

    if (lower.includes('vender') || lower.includes('publica') || lower.includes('marketplace')) {
        const price = moneyFromText(message);
        const title = cleanText(
            message
                .replace(/quiero/gi, '')
                .replace(/vender/gi, '')
                .replace(/publicar/gi, '')
                .replace(/a\s+\$?\d+[\d.]*\s*(mil|k)?/gi, ''),
            90
        ) || 'Articulo publicado por CoCo';
        return {
            agentKey: 'community',
            toolName: 'create_marketplace_item',
            args: { title, description: message, price, category: lower.includes('tele') || lower.includes('led') ? 'electronics' : 'other' },
            requiresConfirmation: true,
            title: `Publicar "${title}" en Marketplace`,
            summary: `Precio sugerido: $${price.toLocaleString('es-CL')}. Quedara asociado a tu perfil.`,
            targetHref: '/marketplace/my-listings',
        };
    }

    if (lower.includes('comunicado') || lower.includes('aviso') || lower.includes('anuncio')) {
        const title = cleanText(message.replace(/(crea|crear|publica|publicar|comunicado|aviso|anuncio)/gi, ''), 90) || 'Comunicado de administracion';
        return {
            agentKey: 'community',
            toolName: 'create_announcement',
            args: { title, content: message, priority: lower.includes('urgente') ? 'alert' : 'info' },
            requiresConfirmation: true,
            title: `Publicar comunicado: ${title}`,
            summary: 'Accion disponible solo para administracion o conserjeria.',
            targetHref: '/comunicaciones',
        };
    }

    if (lower.includes('visita') || lower.includes('visitante') || lower.includes('ingreso')) {
        const nameMatch = message.match(/(?:visita|visitante|ingreso de|registrar a)\s+([A-Za-zÁÉÍÓÚáéíóúÑñ\s]{2,60})/i);
        const visitorName = cleanText(nameMatch?.[1], 60) || 'Visitante registrado por CoCo';
        return {
            agentKey: 'concierge',
            toolName: 'register_visitor',
            args: { visitorName, purpose: 'Registro creado desde Agent Center' },
            requiresConfirmation: true,
            title: `Registrar visita: ${visitorName}`,
            summary: 'Se creara una entrada en la bitacora de visitas de la comunidad.',
            targetHref: '/concierge/visitors',
        };
    }

    if (lower.includes('reserva') || lower.includes('quincho') || lower.includes('sala')) {
        const amenityHint = lower.includes('quincho') ? 'quincho' : lower.includes('sala') ? 'sala' : '';
        return {
            agentKey: 'maintenance',
            toolName: 'create_booking',
            args: { amenityHint, date, startTime: start, endTime: end },
            requiresConfirmation: true,
            title: `Reservar espacio comun para ${date} a las ${start}`,
            summary: 'CoCo buscara el espacio por nombre y creara una reserva confirmada si esta disponible.',
            targetHref: '/amenities',
        };
    }

    return {
        agentKey,
        toolName: 'create_service_request',
        args: { description: message, preferredDate: date, preferredTime: start },
        requiresConfirmation: true,
        title: 'Crear ticket de mantenimiento',
        summary: 'CoCo registrara una solicitud operacional para que quede trazabilidad.',
        targetHref: '/services/my-requests',
    };
}

async function getUserUnit(profile: AgentProfile) {
    if (profile.unit_id) {
        const { data } = await getSupabaseAdmin()
            .from('units')
            .select('id, number, unit_number, tower, community_id')
            .eq('id', profile.unit_id)
            .maybeSingle();
        if (data) return data as Record<string, unknown>;
    }

    const { data } = await getSupabaseAdmin()
        .from('units')
        .select('id, number, unit_number, tower, community_id')
        .eq('owner_id', profile.id)
        .maybeSingle();
    return (data as Record<string, unknown> | null) || null;
}

async function bestEffortInsert(table: string, payload: Record<string, unknown>) {
    try {
        const { data } = await getSupabaseAdmin().from(table).insert(payload).select('id').maybeSingle();
        return typeof data?.id === 'string' ? data.id : null;
    } catch {
        return null;
    }
}

function normalizeAutonomyLevel(value: unknown): AutonomyLevel {
    return value === 'semi_autonomous' || value === 'autonomous' ? value : 'manual';
}

function normalizeAgentPolicy(row: Record<string, unknown>): AgentPolicy | null {
    const agentKey = row.agent_key;
    if (!['finance', 'maintenance', 'concierge', 'community'].includes(String(agentKey))) return null;

    return {
        agentKey: agentKey as AgentKey,
        autonomyLevel: normalizeAutonomyLevel(row.autonomy_level),
        active: row.active !== false,
        maxDailyActions: Number(row.max_daily_actions || DEFAULT_AGENT_POLICIES[agentKey as AgentKey].maxDailyActions),
        updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
    };
}

async function getAgentPolicies(profile: AgentProfile): Promise<Record<AgentKey, AgentPolicy>> {
    const communityId = profile.community_id || DEFAULT_COMMUNITY_ID;
    const admin = getSupabaseAdmin();
    const defaults = Object.fromEntries(
        (Object.keys(DEFAULT_AGENT_POLICIES) as AgentKey[]).map(agentKey => [
            agentKey,
            { agentKey, ...DEFAULT_AGENT_POLICIES[agentKey], updatedAt: null },
        ])
    ) as Record<AgentKey, AgentPolicy>;

    const { data } = await admin
        .from('agent_policies')
        .select('agent_key, autonomy_level, active, max_daily_actions, updated_at')
        .eq('community_id', communityId);

    const existing = new Set<string>();
    for (const row of (data || []) as Record<string, unknown>[]) {
        const policy = normalizeAgentPolicy(row);
        if (!policy) continue;
        defaults[policy.agentKey] = policy;
        existing.add(policy.agentKey);
    }

    const missing = (Object.keys(DEFAULT_AGENT_POLICIES) as AgentKey[])
        .filter(agentKey => !existing.has(agentKey))
        .map(agentKey => ({
            community_id: communityId,
            agent_key: agentKey,
            autonomy_level: DEFAULT_AGENT_POLICIES[agentKey].autonomyLevel,
            active: DEFAULT_AGENT_POLICIES[agentKey].active,
            max_daily_actions: DEFAULT_AGENT_POLICIES[agentKey].maxDailyActions,
            updated_by: profile.id,
        }));

    if (missing.length > 0 && profile.community_id) {
        await admin
            .from('agent_policies')
            .upsert(missing, { onConflict: 'community_id,agent_key', ignoreDuplicates: true });
    }

    return defaults;
}

async function getAgentSummary(profile: AgentProfile): Promise<AgentSummary> {
    const communityId = profile.community_id || DEFAULT_COMMUNITY_ID;
    const admin = getSupabaseAdmin();

    const [
        totalRuns,
        executedRuns,
        failedRuns,
        pendingProposals,
    ] = await Promise.all([
        admin.from('agent_runs').select('id', { count: 'exact', head: true }).eq('community_id', communityId),
        admin.from('agent_runs').select('id', { count: 'exact', head: true }).eq('community_id', communityId).eq('status', 'executed'),
        admin.from('agent_runs').select('id', { count: 'exact', head: true }).eq('community_id', communityId).eq('status', 'failed'),
        admin.from('agent_tool_calls').select('id', { count: 'exact', head: true }).eq('community_id', communityId).eq('status', 'proposed'),
    ]);

    const total = totalRuns.count || 0;
    const executed = executedRuns.count || 0;
    const failed = failedRuns.count || 0;
    const successRate = total > 0 ? Math.round((executed / total) * 1000) / 10 : 0;

    return {
        totalRuns: total,
        executedRuns: executed,
        failedRuns: failed,
        pendingProposals: pendingProposals.count || 0,
        successRate,
        estimatedMinutesSaved: executed * 8,
    };
}

function workflowStatus(pending: number, blockers: number): AgentWorkflow['status'] {
    if (blockers > 0) return 'blocked';
    if (pending > 0) return 'needs_review';
    return 'ready';
}

function workflowPriority(pending: number, blockers: number): AgentWorkflow['priority'] {
    if (blockers > 0 || pending >= 5) return 'high';
    if (pending > 0) return 'medium';
    return 'low';
}

async function getAgentWorkflows(profile: AgentProfile): Promise<AgentWorkflow[]> {
    const admin = getSupabaseAdmin();
    const communityId = profile.community_id || DEFAULT_COMMUNITY_ID;

    const [
        pendingExpenses,
        openServiceRequests,
        verifiedProviders,
        unitCount,
        profileCount,
        pendingProposals,
    ] = await Promise.all([
        admin
            .from('expenses')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .in('status', ['pending', 'overdue']),
        admin
            .from('service_requests')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .in('status', ['pending', 'accepted', 'in-progress']),
        admin
            .from('service_providers')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .eq('verified', true),
        admin
            .from('units')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId),
        admin
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId),
        admin
            .from('agent_tool_calls')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .eq('status', 'proposed'),
    ]);

    const expenseCount = pendingExpenses.count || 0;
    const requestCount = openServiceRequests.count || 0;
    const providerCount = verifiedProviders.count || 0;
    const units = unitCount.count || 0;
    const profiles = profileCount.count || 0;
    const pendingAuditActions = pendingProposals.count || 0;
    const onboardingGap = Math.max(0, units - profiles);

    return [
        {
            key: 'maintenance_ticket_triage',
            agentKey: 'maintenance',
            name: 'Tickets y proveedores',
            status: workflowStatus(requestCount, providerCount > 0 ? 0 : 1),
            priority: workflowPriority(requestCount, providerCount > 0 ? 0 : 1),
            nextAction: providerCount > 0
                ? 'Ordenar tickets abiertos y preparar seguimiento'
                : 'Registrar o verificar proveedores antes de asignar tareas',
            pendingActions: requestCount,
            completedActions: 0,
            estimatedMinutesSaved: requestCount * 18,
            targetHref: '/admin/mantenimiento',
            summary: 'CoCo puede ordenar incidencias, revisar proveedores y dejar seguimiento claro.',
            metrics: [
                { label: 'Tickets abiertos', value: String(requestCount), tone: requestCount > 0 ? 'warning' : 'success' },
                { label: 'Proveedores verificados', value: String(providerCount), tone: providerCount > 0 ? 'success' : 'warning' },
                { label: 'Ahorro potencial', value: `${requestCount * 18} min`, tone: 'neutral' },
            ],
        },
        {
            key: 'finance_collection_review',
            agentKey: 'finance',
            name: 'Morosos y cobranza',
            status: workflowStatus(expenseCount, 0),
            priority: workflowPriority(expenseCount, 0),
            nextAction: expenseCount > 0 ? 'Preparar avisos privados para gastos pendientes' : 'No hay cobros pendientes por gestionar',
            pendingActions: expenseCount,
            completedActions: 0,
            estimatedMinutesSaved: expenseCount * 5,
            targetHref: '/admin/finanzas',
            summary: 'Ordena gastos pendientes y prepara avisos privados sin exponer deudas.',
            metrics: [
                { label: 'Cobros pendientes', value: String(expenseCount), tone: expenseCount > 0 ? 'warning' : 'success' },
                { label: 'Propuestas por aprobar', value: String(pendingAuditActions), tone: pendingAuditActions > 0 ? 'warning' : 'neutral' },
                { label: 'Ahorro potencial', value: `${expenseCount * 5} min`, tone: 'neutral' },
            ],
        },
        {
            key: 'onboarding_import_review',
            agentKey: 'community',
            name: 'Cargar residentes',
            status: workflowStatus(onboardingGap, units > 0 ? 0 : 1),
            priority: workflowPriority(onboardingGap, units > 0 ? 0 : 1),
            nextAction: units > 0 ? 'Revisar residentes faltantes y preparar accesos' : 'Cargar unidades base del edificio',
            pendingActions: onboardingGap,
            completedActions: profiles,
            estimatedMinutesSaved: Math.max(1, onboardingGap) * 3,
            targetHref: '/admin/onboarding',
            summary: 'Revisa nominas, detecta datos faltantes y prepara accesos por unidad.',
            metrics: [
                { label: 'Unidades', value: String(units), tone: units > 0 ? 'success' : 'warning' },
                { label: 'Perfiles comunidad', value: String(profiles), tone: profiles > 0 ? 'success' : 'neutral' },
                { label: 'Brecha estimada', value: String(onboardingGap), tone: onboardingGap > 0 ? 'warning' : 'success' },
            ],
        },
        {
            key: 'community_broadcast',
            agentKey: 'community',
            name: 'Comunicados',
            status: workflowStatus(pendingAuditActions, 0),
            priority: workflowPriority(pendingAuditActions, 0),
            nextAction: pendingAuditActions > 0 ? 'Revisar propuestas antes de publicar' : 'Preparar comunicado cuando administracion lo solicite',
            pendingActions: pendingAuditActions,
            completedActions: 0,
            estimatedMinutesSaved: pendingAuditActions * 3,
            targetHref: '/comunicaciones',
            summary: 'Redacta avisos para revisar antes de publicar.',
            metrics: [
                { label: 'Propuestas pendientes', value: String(pendingAuditActions), tone: pendingAuditActions > 0 ? 'warning' : 'success' },
                { label: 'Modo', value: 'Aprobacion', tone: 'neutral' },
                { label: 'Ahorro potencial', value: `${pendingAuditActions * 3} min`, tone: 'neutral' },
            ],
        },
    ];
}

async function updateAgentPolicy(profile: AgentProfile, body: Record<string, unknown>) {
    if (profile.role !== 'admin') {
        throw new Error('Solo administracion puede cambiar politicas de agentes.');
    }
    if (!profile.community_id) {
        throw new Error('El administrador no tiene comunidad asignada.');
    }

    const agentKey = body.agentKey;
    if (!['finance', 'maintenance', 'concierge', 'community'].includes(String(agentKey))) {
        throw new Error('Agente no soportado.');
    }

    const autonomyLevel = normalizeAutonomyLevel(body.autonomyLevel);
    const active = typeof body.active === 'boolean' ? body.active : true;
    const maxDailyActions = Math.max(1, Math.min(500, Number(body.maxDailyActions || DEFAULT_AGENT_POLICIES[agentKey as AgentKey].maxDailyActions)));

    const { error } = await getSupabaseAdmin()
        .from('agent_policies')
        .upsert({
            community_id: profile.community_id,
            agent_key: agentKey,
            autonomy_level: autonomyLevel,
            active,
            max_daily_actions: maxDailyActions,
            updated_by: profile.id,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'community_id,agent_key' });

    if (error) throw error;

    await bestEffortInsert('agent_activity_log', {
        community_id: profile.community_id,
        user_id: profile.id,
        agent_key: String(agentKey),
        action: 'policy_update',
        severity: 'info',
        summary: `Politica actualizada: ${agentKey} ahora esta ${active ? 'activo' : 'inactivo'} en modo ${autonomyLevel}.`,
        metadata: { autonomyLevel, active, maxDailyActions },
    });
}

const GEMINI_SYSTEM_PROMPT = `
Eres el motor de inferencia de intenciones del Agent Center de Convive Connect.
Tu tarea es analizar el mensaje del usuario y traducirlo a una propuesta de acción de base de datos en formato JSON que calce exactamente con una de las siguientes herramientas soportadas.

Definición de agentes y herramientas:
1. Agente 'finance':
   - Herramienta 'get_my_expenses': Para consultar cobros, deudas o estado de pago de gastos comunes del residente.
     Argumentos: {}
     requiresConfirmation: false
     targetHref: '/resident/finances'
     title: 'Consultar gastos de la unidad'
     summary: 'CoCo revisará los gastos comunes pendientes asociados a tu unidad.'

2. Agente 'maintenance':
   - Herramienta 'create_booking': Para reservar un espacio común (ej: quincho, sala multiuso, piscina).
     Argumentos: { "amenityHint": "nombre del espacio", "date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM" } (Si no se especifica hora, asume 2 horas a partir de las 10:00 o la hora sugerida).
     requiresConfirmation: true
     targetHref: '/amenities'
     title: 'Reservar espacio común'
     summary: 'CoCo buscará el espacio por nombre y creará una reserva.'
   - Herramienta 'create_service_request': Para reportar fallas, luces parpadeando, mantenciones o problemas de infraestructura.
     Argumentos: { "description": "detalle de la falla", "preferredDate": "YYYY-MM-DD", "preferredTime": "HH:MM" }
     requiresConfirmation: true
     targetHref: '/services/my-requests'
     title: 'Crear ticket de mantenimiento'
     summary: 'CoCo registrará una solicitud operacional para que quede trazabilidad.'

3. Agente 'concierge':
   - Herramienta 'register_visitor': Para autorizar e ingresar visitas, amigos, repartidores o familiares.
     Argumentos: { "visitorName": "nombre de la visita", "purpose": "motivo de la visita" }
     requiresConfirmation: true
     targetHref: '/concierge/visitors'
     title: 'Registrar visita'
     summary: 'Se creará una entrada en la bitácora de visitas de la comunidad.'

4. Agente 'community':
   - Herramienta 'create_marketplace_item': Para vender, permutar o publicar un objeto en el mercado de vecinos.
     Argumentos: { "title": "nombre breve del producto", "description": "descripción", "price": número, "category": "electronics" | "furniture" | "clothing" | "other" }
     requiresConfirmation: true
     targetHref: '/marketplace/my-listings'
     title: 'Publicar en Marketplace'
     summary: 'El artículo quedará publicado en el marketplace vecinal.'
   - Herramienta 'create_announcement': Para publicar avisos, comunicados o noticias de administración. (Nota: Solo permitida si el usuario es 'admin' o 'concierge').
     Argumentos: { "title": "título del aviso", "content": "contenido completo", "priority": "info" | "alert" }
     requiresConfirmation: true
     targetHref: '/comunicaciones'
     title: 'Publicar comunicado oficial'
     summary: 'El aviso quedará visible para todos los vecinos en el feed oficial.'

5. Acciones frecuentes:
   - Usa run_playbook cuando el usuario pida cargar residentes, activar un edificio, revisar morosos, preparar cobranza, ordenar tickets abiertos, preparar emergencia IoT o preparar un comunicado guiado.
   - Herramienta 'run_playbook': Para preparar una tarea guiada con aprobacion humana.
     Argumentos: { "playbookKey": "finance_collection_review" | "maintenance_ticket_triage" | "onboarding_import_review" | "iot_emergency_readiness" | "community_broadcast", "requestedText": "texto original del usuario" }
     requiresConfirmation: true
     targetHref: usa el targetHref del playbook.
     title: 'Preparar revision'
     summary: 'CoCo preparara un proceso guiado con auditoria y confirmacion humana.'

Instrucciones de formato:
- Debes responder EXCLUSIVAMENTE con un objeto JSON válido que calce con la interfaz AgentAction.
- No incluyas bloques de código markdown (\`\`\`json).
- La interfaz de retorno debe ser:
  {
    "agentKey": "finance" | "maintenance" | "concierge" | "community",
    "toolName": "get_my_expenses" | "create_booking" | "create_marketplace_item" | "create_announcement" | "register_visitor" | "create_service_request" | "run_playbook",
    "args": { ... },
    "requiresConfirmation": boolean,
    "title": "Título descriptivo breve de la acción",
    "summary": "Resumen en una frase de lo que ocurrirá",
    "targetHref": "href correspondiente"
  }
`;

async function callGeminiInference(message: string, profile: AgentProfile): Promise<AgentAction | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    
    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const todayISO = new Date().toISOString().slice(0, 10);
    const systemInstruction = `${GEMINI_SYSTEM_PROMPT}\n\n**Fecha actual del servidor (hoy)**: ${todayISO}\n**Contexto del usuario**: Nombre: ${profile.name || ''} | Rol: ${profile.role || ''} | Unidad ID: ${profile.unit_id || ''}`;
    
    const body = {
        systemInstruction: {
            role: "system",
            parts: [{ text: systemInstruction }]
        },
        contents: [
            { role: "user", parts: [{ text: message }] }
        ],
        generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
        },
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!res.ok) return null;
        const data = await res.json();
        const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!output) return null;

        const parsed = JSON.parse(output) as AgentAction;
        if (parsed && parsed.agentKey && parsed.toolName) {
            return parsed;
        }
        return null;
    } catch (err) {
        console.warn("[Gemini Inference Fallback triggered]", err);
        return null;
    }
}

async function inferAction(message: string, profile: AgentProfile): Promise<AgentAction> {
    const geminiResult = await callGeminiInference(message, profile);
    if (geminiResult) {
        return normalizeAction(geminiResult);
    }
    return normalizeAction(inferActionHeuristic(message));
}

const TOOL_NAMES: ToolName[] = [
    'get_amenities',
    'create_booking',
    'create_marketplace_item',
    'create_announcement',
    'create_service_request',
    'register_visitor',
    'get_my_expenses',
    'run_playbook',
];

function isToolName(value: unknown): value is ToolName {
    return typeof value === 'string' && TOOL_NAMES.includes(value as ToolName);
}

function normalizeAction(action: AgentAction): AgentAction {
    if (!['finance', 'maintenance', 'concierge', 'community'].includes(action.agentKey)) {
        throw new Error('Agente no soportado.');
    }
    if (!isToolName(action.toolName)) {
        throw new Error('Herramienta no soportada.');
    }

    const safeArgs = action.args && typeof action.args === 'object' ? action.args : {};
    const playbook = action.toolName === 'run_playbook' ? getPlaybook(safeArgs.playbookKey) : null;
    const writesRequireConfirmation = action.toolName !== 'get_my_expenses';

    return {
        agentKey: playbook?.agentKey || action.agentKey,
        toolName: action.toolName,
        args: safeArgs,
        requiresConfirmation: writesRequireConfirmation ? true : Boolean(action.requiresConfirmation),
        title: playbook ? `Preparar revision: ${playbook.name}` : cleanText(action.title, 140) || 'Accion preparada',
        summary: playbook?.description || cleanText(action.summary, 280) || 'CoCo preparo una accion operacional.',
        targetHref: playbook?.targetHref || cleanText(action.targetHref, 120) || '/agent-center',
        proposalId: action.proposalId || null,
        runId: action.runId || null,
    };
}

function mergeEditableArgs(storedArgs: Record<string, unknown>, incomingArgs?: Record<string, unknown>) {
    if (!incomingArgs || typeof incomingArgs !== 'object') return storedArgs;

    const merged: Record<string, unknown> = { ...storedArgs };
    for (const key of Object.keys(storedArgs)) {
        if (Object.prototype.hasOwnProperty.call(incomingArgs, key)) {
            merged[key] = incomingArgs[key];
        }
    }
    return merged;
}

async function logActivity(profile: AgentProfile, action: AgentAction, status: 'preview' | 'executed' | 'failed' | 'rejected', result?: Record<string, unknown>) {
    const communityId = profile.community_id || DEFAULT_COMMUNITY_ID;
    const policies = await getAgentPolicies(profile);
    const displayAction = activityDisplayForAction(action);
    const displaySummary = activitySummaryForStatus(action, status);
    const runId = await bestEffortInsert('agent_runs', {
        user_id: profile.id,
        community_id: communityId,
        agent_key: action.agentKey,
        intent: action.toolName,
        user_message: action.summary,
        autonomy_level: policies[action.agentKey]?.autonomyLevel || 'manual',
        status: status === 'preview' ? 'awaiting_confirmation' : status,
        summary: displaySummary,
        metadata: {
            displayAction,
            displaySummary,
            targetHref: action.targetHref,
            proposedAction: {
                agentKey: action.agentKey,
                toolName: action.toolName,
                title: action.title,
                summary: action.summary,
                args: action.args,
                targetHref: action.targetHref,
            },
        },
        completed_at: status === 'preview' ? null : new Date().toISOString(),
    });

    const toolCallId = await bestEffortInsert('agent_tool_calls', {
        run_id: runId,
        user_id: profile.id,
        community_id: communityId,
        tool_name: action.toolName,
        args: action.args,
        result: result || {},
        requires_confirmation: action.requiresConfirmation,
        status: status === 'executed' ? 'executed' : status === 'rejected' ? 'rejected' : 'proposed',
        executed_at: status === 'executed' ? new Date().toISOString() : null,
    });

    await bestEffortInsert('agent_activity_log', {
        community_id: communityId,
        user_id: profile.id,
        agent_key: action.agentKey,
        action: action.toolName,
        entity_type: result?.entityType,
        entity_id: result?.entityId,
        severity: status === 'failed' ? 'error' : status === 'executed' ? 'success' : status === 'rejected' ? 'warning' : 'info',
        summary: displaySummary,
        metadata: {
            runId,
            toolCallId,
            displayAction,
            displaySummary,
            proposedAction: {
                agentKey: action.agentKey,
                toolName: action.toolName,
                title: action.title,
                summary: action.summary,
                args: action.args,
                targetHref: action.targetHref,
            },
            ...result,
        },
    });

    return { runId, toolCallId };
}

async function recordApproval(profile: AgentProfile, action: AgentAction, decision: 'approved' | 'rejected', reason?: string) {
    if (!action.proposalId || !action.runId) return;
    await bestEffortInsert('agent_action_approvals', {
        run_id: action.runId,
        tool_call_id: action.proposalId,
        user_id: profile.id,
        community_id: profile.community_id || DEFAULT_COMMUNITY_ID,
        decision,
        reason: reason || null,
    });
}

async function markPersistedProposal(action: AgentAction, status: 'executed' | 'rejected' | 'failed', result?: Record<string, unknown>) {
    if (!action.proposalId || !action.runId) return;
    const admin = getSupabaseAdmin();
    await admin
        .from('agent_tool_calls')
        .update({
            status,
            result: result || {},
            executed_at: status === 'executed' ? new Date().toISOString() : null,
        })
        .eq('id', action.proposalId);

    await admin
        .from('agent_runs')
        .update({
            status,
            completed_at: new Date().toISOString(),
        })
        .eq('id', action.runId);
}

async function loadPersistedProposal(incomingAction: AgentAction | null, profile: AgentProfile) {
    const proposalId = cleanText(incomingAction?.proposalId, 80);
    if (!proposalId) throw new Error('La propuesta ya no tiene identificador auditable. Vuelve a generar la accion.');

    const admin = getSupabaseAdmin();
    const { data: toolCall, error: toolError } = await admin
        .from('agent_tool_calls')
        .select('id, run_id, user_id, community_id, tool_name, args, requires_confirmation, status')
        .eq('id', proposalId)
        .maybeSingle();

    if (toolError || !toolCall) throw new Error('No encontre la propuesta auditada.');
    if (toolCall.user_id !== profile.id) throw new Error('La propuesta no pertenece a tu usuario.');
    if ((toolCall.community_id || DEFAULT_COMMUNITY_ID) !== (profile.community_id || DEFAULT_COMMUNITY_ID)) {
        throw new Error('La propuesta pertenece a otra comunidad.');
    }
    if (toolCall.status !== 'proposed') throw new Error('La propuesta ya fue procesada.');
    if (!isToolName(toolCall.tool_name)) throw new Error('Herramienta no soportada.');

    const { data: run, error: runError } = await admin
        .from('agent_runs')
        .select('id, agent_key, user_message, summary, metadata')
        .eq('id', toolCall.run_id)
        .maybeSingle();

    if (runError || !run) throw new Error('No encontre la corrida asociada.');
    if (!['finance', 'maintenance', 'concierge', 'community'].includes(String(run.agent_key))) {
        throw new Error('Agente no soportado.');
    }

    const metadata = run.metadata && typeof run.metadata === 'object'
        ? run.metadata as Record<string, unknown>
        : {};
    const storedArgs = toolCall.args && typeof toolCall.args === 'object'
        ? toolCall.args as Record<string, unknown>
        : {};
    const incomingArgs = incomingAction?.args && typeof incomingAction.args === 'object'
        ? incomingAction.args
        : undefined;

    const action = normalizeAction({
        agentKey: run.agent_key as AgentKey,
        toolName: toolCall.tool_name,
        args: mergeEditableArgs(storedArgs, incomingArgs),
        requiresConfirmation: Boolean(toolCall.requires_confirmation),
        title: cleanText(run.summary, 140) || incomingAction?.title || 'Accion preparada',
        summary: cleanText(run.user_message, 280) || incomingAction?.summary || 'CoCo preparo una accion operacional.',
        targetHref: cleanText(metadata.targetHref, 120) || incomingAction?.targetHref || '/agent-center',
        proposalId: String(toolCall.id),
        runId: String(run.id),
    });

    await admin
        .from('agent_tool_calls')
        .update({ args: action.args })
        .eq('id', action.proposalId);

    return action;
}

function requireAdmin(profile: AgentProfile, message = 'Solo administracion puede preparar esta accion.') {
    if (profile.role !== 'admin') throw new Error(message);
}

async function runFinanceCollectionPlaybook(profile: AgentProfile) {
    requireAdmin(profile);
    const admin = getSupabaseAdmin();
    const communityId = profile.community_id || DEFAULT_COMMUNITY_ID;
    const { data: expenses, error } = await admin
        .from('expenses')
        .select('id, unit_id, month, total_amount, status, due_date')
        .eq('community_id', communityId)
        .in('status', ['pending', 'overdue'])
        .order('due_date', { ascending: true })
        .limit(100);

    if (error) throw error;

    const rows = (expenses || []) as Array<{
        id: string;
        unit_id: string;
        month?: string | null;
        total_amount?: string | number | null;
        status?: string | null;
        due_date?: string | null;
    }>;
    const unitIds = Array.from(new Set(rows.map(row => row.unit_id).filter(Boolean)));
    const { data: units } = unitIds.length
        ? await admin
            .from('units')
            .select('id, number, unit_number, owner_id, resident_profile_id')
            .in('id', unitIds)
        : { data: [] };

    const unitById = new Map((units || []).map(unit => [String(unit.id), unit as Record<string, unknown>]));
    const notifications = rows.flatMap(row => {
        const unit = unitById.get(row.unit_id);
        const profileId = String(unit?.owner_id || unit?.resident_profile_id || '');
        if (!profileId) return [];
        const unitLabel = String(unit?.unit_number || unit?.number || row.unit_id);
        return [{
            user_id: profileId,
            type: row.status === 'overdue' ? 'alert' : 'warning',
            category: 'finance_collection',
            title: 'Gasto comun pendiente',
            body: `Tu unidad ${unitLabel} registra un gasto comun pendiente de $${Number(row.total_amount || 0).toLocaleString('es-CL')} (${row.month || 'periodo actual'}).`,
            link: '/resident/finances',
            community_id: communityId,
        }];
    });

    if (notifications.length > 0) {
        const { error: notificationError } = await admin.from('notifications').insert(notifications);
        if (notificationError) throw notificationError;
    }

    await recordOperationEvent({
        communityId,
        actorId: profile.id,
        actorRole: profile.role,
        action: 'agent.playbook.finance_collection_review',
        entityType: 'agent_playbook',
        severity: notifications.length === rows.length ? 'success' : 'warning',
        status: notifications.length === rows.length ? 'success' : 'pending',
        summary: `Cobranza privada: ${rows.length} cobro(s) impago(s), ${notifications.length} notificacion(es) creadas`,
        metadata: {
            pendingExpenses: rows.length,
            notifications: notifications.length,
            missingResidents: Math.max(0, rows.length - notifications.length),
        },
    });

    return {
        entityType: 'agent_playbook',
        entityId: null,
        title: 'Cobranza controlada ejecutada',
        message: `Detecte ${rows.length} gasto(s) impago(s) y cree ${notifications.length} notificacion(es) privadas a residentes vinculados.`,
        data: {
            pendingExpenses: rows.length,
            notifications: notifications.length,
            missingResidents: Math.max(0, rows.length - notifications.length),
        },
    };
}

async function runMaintenanceTicketTriagePlaybook(profile: AgentProfile) {
    requireAdmin(profile);
    const admin = getSupabaseAdmin();
    const communityId = profile.community_id || DEFAULT_COMMUNITY_ID;
    const [{ data: requests, error: requestsError }, { count: providerCount }] = await Promise.all([
        admin
            .from('service_requests')
            .select('id, description, status, preferred_date, preferred_time, provider_id, created_at')
            .eq('community_id', communityId)
            .in('status', ['pending', 'accepted', 'in-progress'])
            .order('created_at', { ascending: true })
            .limit(25),
        admin
            .from('service_providers')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .eq('verified', true),
    ]);

    if (requestsError) throw requestsError;

    const rows = (requests || []) as Array<{
        id: string;
        description?: string | null;
        status?: string | null;
        preferred_date?: string | null;
        preferred_time?: string | null;
        provider_id?: string | null;
    }>;
    const unassigned = rows.filter(row => !row.provider_id).length;
    const oldOpen = rows.filter(row => {
        if (!row.preferred_date) return false;
        const due = new Date(row.preferred_date);
        return Number.isFinite(due.getTime()) && due < new Date();
    }).length;
    const warnings = [
        ...(providerCount ? [] : ['No hay proveedores verificados para derivar tickets.']),
        ...(unassigned ? [`${unassigned} ticket(s) no tienen proveedor asociado.`] : []),
        ...(oldOpen ? [`${oldOpen} ticket(s) tienen fecha preferida vencida.`] : []),
    ];

    await recordOperationEvent({
        communityId,
        actorId: profile.id,
        actorRole: profile.role,
        action: 'agent.playbook.maintenance_ticket_triage',
        entityType: 'agent_playbook',
        severity: warnings.length ? 'warning' : 'success',
        status: warnings.length ? 'pending' : 'success',
        summary: warnings.length ? 'Revision de mantencion detecto brechas operativas' : 'Mantencion sin brechas criticas',
        metadata: {
            openRequests: rows.length,
            verifiedProviders: providerCount || 0,
            unassigned,
            oldOpen,
            warnings,
            sample: rows.slice(0, 5).map(row => ({
                id: row.id,
                status: row.status,
                preferredDate: row.preferred_date,
                description: cleanText(row.description, 160),
            })),
        },
    });

    return {
        entityType: 'agent_playbook',
        entityId: null,
        title: warnings.length ? 'Revision con acciones pendientes' : 'Mantenimiento ordenado',
        message: warnings.length
            ? `Revise ${rows.length} ticket(s) abiertos y detecte ${warnings.length} brecha(s): ${warnings.join(' ')}`
            : `Revise ${rows.length} ticket(s) abiertos. Hay proveedores verificados y no detecte atrasos criticos.`,
        targetHref: '/admin/mantenimiento',
        data: {
            openRequests: rows.length,
            verifiedProviders: providerCount || 0,
            unassigned,
            oldOpen,
            warnings,
        },
    };
}

async function runOnboardingReviewPlaybook(profile: AgentProfile) {
    requireAdmin(profile);
    const communityId = profile.community_id || DEFAULT_COMMUNITY_ID;
    await recordOperationEvent({
        communityId,
        actorId: profile.id,
        actorRole: profile.role,
        action: 'agent.playbook.onboarding_import_review',
        entityType: 'agent_playbook',
        severity: 'info',
        status: 'pending',
        summary: 'Carga de residentes preparada: cargar archivo, revisar calidad y sincronizar unidades',
        metadata: { targetHref: '/admin/onboarding' },
    });

    return {
        entityType: 'agent_playbook',
        entityId: null,
        title: 'Carga de residentes lista para revisar',
        message: 'Abre Carga Masiva para subir Excel/PDF, revisar advertencias del agente y sincronizar perfiles con confirmacion.',
        targetHref: '/admin/onboarding',
        data: { checklist: getPlaybook('onboarding_import_review')?.steps || [] },
    };
}

async function runIotReadinessPlaybook(profile: AgentProfile) {
    requireAdmin(profile);
    const admin = getSupabaseAdmin();
    const communityId = profile.community_id || DEFAULT_COMMUNITY_ID;
    const [{ count: staffCount }, { count: providerCount }] = await Promise.all([
        admin
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .in('role', ['admin', 'concierge']),
        admin
            .from('service_providers')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .eq('verified', true),
    ]);

    const warnings = [
        ...(staffCount ? [] : ['No hay staff administrativo/conserjeria disponible.']),
        ...(providerCount ? [] : ['No hay proveedores verificados para despacho.']),
    ];

    await recordOperationEvent({
        communityId,
        actorId: profile.id,
        actorRole: profile.role,
        action: 'agent.playbook.iot_emergency_readiness',
        entityType: 'agent_playbook',
        severity: warnings.length ? 'warning' : 'success',
        status: warnings.length ? 'pending' : 'success',
        summary: warnings.length ? 'Emergencia IoT detecto brechas de preparacion' : 'Emergencia IoT lista para revisar',
        metadata: { staffCount: staffCount || 0, providerCount: providerCount || 0, warnings },
    });

    return {
        entityType: 'agent_playbook',
        entityId: null,
        title: warnings.length ? 'Emergencia IoT con brechas' : 'Emergencia IoT preparada',
        message: warnings.length
            ? `Detecte ${warnings.length} brecha(s): ${warnings.join(' ')}`
            : 'Hay staff y proveedores verificados para responder a alertas IoT criticas.',
        targetHref: '/admin/mantenimiento',
        data: { staffCount: staffCount || 0, providerCount: providerCount || 0, warnings },
    };
}

async function runCommunityBroadcastPlaybook(profile: AgentProfile, requestedText: string) {
    if (!['admin', 'concierge'].includes(profile.role)) {
        throw new Error('Solo administracion o conserjeria pueden preparar comunicados oficiales.');
    }
    const communityId = profile.community_id || DEFAULT_COMMUNITY_ID;
    await recordOperationEvent({
        communityId,
        actorId: profile.id,
        actorRole: profile.role,
        action: 'agent.playbook.community_broadcast',
        entityType: 'agent_playbook',
        severity: 'info',
        status: 'pending',
        summary: 'Comunicado preparado para revision humana',
        metadata: { requestedText: cleanText(requestedText, 700), targetHref: '/comunicaciones' },
    });

    return {
        entityType: 'agent_playbook',
        entityId: null,
        title: 'Comunicado preparado',
        message: 'Deje el flujo de comunicado preparado. Revisa el contenido y publica desde Comunicaciones para mantener control editorial.',
        targetHref: '/comunicaciones',
        data: { requestedText: cleanText(requestedText, 700), checklist: getPlaybook('community_broadcast')?.steps || [] },
    };
}

async function runPlaybook(action: AgentAction, profile: AgentProfile) {
    const playbookKey = cleanText(action.args.playbookKey, 80) as PlaybookKey;
    const playbook = getPlaybook(playbookKey);
    if (!playbook) throw new Error('Accion no soportada.');
    if (playbook.requiresAdmin) requireAdmin(profile);

    if (playbook.key === 'finance_collection_review') return runFinanceCollectionPlaybook(profile);
    if (playbook.key === 'maintenance_ticket_triage') return runMaintenanceTicketTriagePlaybook(profile);
    if (playbook.key === 'onboarding_import_review') return runOnboardingReviewPlaybook(profile);
    if (playbook.key === 'iot_emergency_readiness') return runIotReadinessPlaybook(profile);
    if (playbook.key === 'community_broadcast') return runCommunityBroadcastPlaybook(profile, cleanText(action.args.requestedText, 700));
    throw new Error('Accion no soportada.');
}

async function executeAction(action: AgentAction, profile: AgentProfile) {
    const admin = getSupabaseAdmin();
    const communityId = profile.community_id || DEFAULT_COMMUNITY_ID;

    if (action.toolName === 'run_playbook') {
        return runPlaybook(action, profile);
    }

    if (action.toolName === 'get_my_expenses') {
        const unit = await getUserUnit(profile);
        if (!unit?.id) throw new Error('No encontre una unidad asociada a tu perfil.');
        const { data, error } = await admin
            .from('expenses')
            .select('id, month, total_amount, status, due_date')
            .eq('unit_id', String(unit.id))
            .order('due_date', { ascending: false })
            .limit(6);
        if (error) throw error;
        const rows = (data || []) as Array<{ total_amount?: number | string | null; status?: string | null }>;
        const pending = rows.filter(row => row.status !== 'paid');
        const amount = pending.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
        return {
            entityType: 'expenses',
            entityId: null,
            title: 'Gastos revisados',
            message: `Hay ${pending.length} gasto(s) no pagado(s) por $${amount.toLocaleString('es-CL')}.`,
            data: rows,
        };
    }

    if (action.toolName === 'create_marketplace_item') {
        const { data, error } = await admin
            .from('marketplace_items')
            .insert({
                seller_id: profile.id,
                title: cleanText(action.args.title, 120),
                description: cleanText(action.args.description, 1200),
                price: Number(action.args.price || 0),
                category: cleanText(action.args.category, 30) || 'other',
                allow_sale: true,
                allow_swap: false,
                allow_barter: false,
                payment_status: 'none',
                community_id: communityId,
            })
            .select('id, title, price')
            .single();
        if (error) throw error;
        return { entityType: 'marketplace_item', entityId: data.id, title: 'Publicacion creada', message: `${data.title} quedo publicado en Marketplace.`, data };
    }

    if (action.toolName === 'create_booking') {
        const hint = cleanText(action.args.amenityHint, 80).toLowerCase();
        let amenitiesQuery = admin.from('amenities').select('id, name').eq('community_id', communityId).eq('is_active', true).limit(10);
        if (hint) amenitiesQuery = amenitiesQuery.ilike('name', `%${hint}%`);
        const { data: amenities, error: amenitiesError } = await amenitiesQuery;
        if (amenitiesError) throw amenitiesError;
        const amenity = amenities?.[0];
        if (!amenity) throw new Error('No encontre un espacio comun activo que calce con la solicitud.');
        const { data, error } = await admin
            .from('bookings')
            .insert({
                amenity_id: amenity.id,
                user_id: profile.id,
                date: cleanText(action.args.date, 20),
                start_time: cleanText(action.args.startTime, 10),
                end_time: cleanText(action.args.endTime, 10),
                status: 'confirmed',
                notes: 'Reserva creada desde Agent Center',
                community_id: communityId,
            })
            .select('id, date, start_time, end_time')
            .single();
        if (error) throw error;
        return { entityType: 'booking', entityId: data.id, title: 'Reserva confirmada', message: `${amenity.name} reservado para ${data.date} a las ${data.start_time}.`, data };
    }

    if (action.toolName === 'create_announcement') {
        if (!['admin', 'concierge'].includes(profile.role || '')) throw new Error('Solo administracion o conserjeria pueden publicar comunicados.');
        const { data, error } = await admin
            .from('announcements')
            .insert({
                title: cleanText(action.args.title, 120),
                content: cleanText(action.args.content, 2000),
                priority: cleanText(action.args.priority, 20) || 'info',
                author_id: profile.id,
                author_name: profile.name || profile.email || 'Administracion',
                community_id: communityId,
            })
            .select('id, title')
            .single();
        if (error) throw error;
        return { entityType: 'announcement', entityId: data.id, title: 'Comunicado publicado', message: `${data.title} ya esta visible para la comunidad.`, data };
    }

    if (action.toolName === 'register_visitor') {
        if (!['admin', 'concierge', 'resident'].includes(profile.role || '')) throw new Error('No tienes permiso para registrar visitas.');
        const unit = await getUserUnit(profile);
        const { data, error } = await admin
            .from('visitor_logs')
            .insert({
                visitor_name: cleanText(action.args.visitorName, 100),
                unit_id: unit?.id || null,
                purpose: cleanText(action.args.purpose, 200) || 'Visita registrada desde Agent Center',
                registered_by: profile.id,
                community_id: communityId,
            })
            .select('id, visitor_name')
            .single();
        if (error) throw error;
        return { entityType: 'visitor_log', entityId: data.id, title: 'Visita registrada', message: `${data.visitor_name} quedo en bitacora.`, data };
    }

    if (action.toolName === 'create_service_request') {
        let { data: provider } = await admin
            .from('service_providers')
            .select('id, name')
            .eq('community_id', communityId)
            .eq('category', 'general')
            .limit(1)
            .maybeSingle();

        if (!provider) {
            const created = await admin
                .from('service_providers')
                .insert({
                    name: 'Equipo de Mantencion Comunidad',
                    category: 'general',
                    contact_phone: 'Administracion',
                    bio: 'Proveedor interno para tickets creados por CoCo.',
                    community_id: communityId,
                    verified: true,
                })
                .select('id, name')
                .single();
            if (created.error) throw created.error;
            provider = created.data;
        }

        const { data, error } = await admin
            .from('service_requests')
            .insert({
                provider_id: provider.id,
                user_id: profile.id,
                preferred_date: cleanText(action.args.preferredDate, 20),
                preferred_time: cleanText(action.args.preferredTime, 20),
                description: cleanText(action.args.description, 1200),
                status: 'pending',
                community_id: communityId,
            })
            .select('id, description, status')
            .single();
        if (error) throw error;
        return { entityType: 'service_request', entityId: data.id, title: 'Ticket creado', message: `Solicitud enviada a ${provider.name}.`, data };
    }

    throw new Error('Herramienta no soportada.');
}

export async function GET(req: NextRequest) {
    const limited = enforceRateLimit(req, 'agent_center.read', { limit: 80, windowMs: 60_000 });
    if (limited) return limited;

    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });

    const { data } = await getSupabaseAdmin()
        .from('agent_activity_log')
        .select('id, agent_key, action, severity, summary, created_at, metadata')
        .eq('community_id', profile.community_id || DEFAULT_COMMUNITY_ID)
        .order('created_at', { ascending: false })
        .limit(12);

    const [policies, summary, workflows] = await Promise.all([
        getAgentPolicies(profile),
        getAgentSummary(profile),
        getAgentWorkflows(profile),
    ]);

    return NextResponse.json({ activity: data || [], policies: Object.values(policies), summary, workflows, playbooks: AGENT_PLAYBOOKS });
}

export async function POST(req: NextRequest) {
    const limited = enforceRateLimit(req, 'agent_center.execute', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });

        const rawBody = await req.json();
        const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};

        if (body.type === 'policy_update') {
            await updateAgentPolicy(profile, body);
            const [policies, summary, workflows] = await Promise.all([
                getAgentPolicies(profile),
                getAgentSummary(profile),
                getAgentWorkflows(profile),
            ]);
            return NextResponse.json({
                status: 'policy_updated',
                reply: 'Politica del agente actualizada y registrada en auditoria.',
                policies: Object.values(policies),
                summary,
                workflows,
                playbooks: AGENT_PLAYBOOKS,
            });
        }

        const message = cleanText(body.message, 1200);
        const incomingAction = body.action && typeof body.action === 'object' ? body.action as AgentAction : null;
        const confirmed = Boolean(body.confirmed);
        const rejected = Boolean(body.rejected);
        const requestedPlaybook = body.type === 'playbook_request' ? getPlaybook(body.playbookKey) : null;
        if (body.type === 'playbook_request' && !requestedPlaybook) {
            throw new Error('Accion no soportada.');
        }

        if (!confirmed && !rejected && !requestedPlaybook && (isSmallTalk(message) || isTooAmbiguousForAction(message))) {
            return NextResponse.json({
                status: 'executed',
                reply: 'Hola. Puedo ayudarte con acciones concretas: cargar residentes, preparar cobranza, crear un comunicado, registrar una visita, reservar espacios o abrir tickets. Elige una accion guiada o escribeme lo que necesitas y te mostrare una propuesta antes de ejecutarla.',
                steps: [
                    {
                        kind: 'reasoning',
                        title: 'Sin accion detectada',
                        detail: 'El mensaje no incluye una instruccion operativa suficiente, por lo que no se ejecuto ninguna herramienta.',
                    },
                ],
            });
        }

        const action = confirmed || rejected
            ? await loadPersistedProposal(incomingAction, profile)
            : requestedPlaybook
                ? normalizeAction(playbookAction(requestedPlaybook, message || requestedPlaybook.description))
            : await inferAction(message, profile);
        const policies = await getAgentPolicies(profile);
        const policy = policies[action.agentKey];
        if (!policy.active) {
            throw new Error(`El agente ${action.agentKey} esta desactivado para esta comunidad.`);
        }

        if (rejected) {
            await recordApproval(profile, action, 'rejected', 'Usuario rechazo desde Agent Center');
            await markPersistedProposal(action, 'rejected');
            await logActivity(profile, action, 'rejected');
            const steps: AgentStep[] = [
                {
                    kind: 'reasoning',
                    title: 'Accion cancelada',
                    detail: `El usuario rechazo la ejecucion de la herramienta "${action.toolName}".`,
                },
                {
                    kind: 'warning',
                    title: 'Ejecucion cancelada',
                    detail: 'La accion propuesta fue descartada y no se guardaron cambios en la base de datos.',
                }
            ];
            return NextResponse.json({
                status: 'rejected',
                reply: 'Entendido. He cancelado la propuesta de accion y registrado el descarte en la bitacora de auditoria.',
                action,
                steps,
            });
        }

        const steps: AgentStep[] = traceStepsForAction(action);

        if (action.requiresConfirmation && !confirmed) {
            const audit = await logActivity(profile, action, 'preview');
            if (!audit.runId || !audit.toolCallId) {
                throw new Error('La auditoria agéntica no esta configurada. Aplica la migracion 029_agent_center_audit.sql antes de confirmar acciones reales.');
            }
            const persistedAction = {
                ...action,
                proposalId: audit.toolCallId,
                runId: audit.runId,
            };
            steps.push({
                kind: 'confirmation',
                title: 'Revision humana requerida',
                detail: action.summary,
            });
            return NextResponse.json({
                status: 'awaiting_confirmation',
                reply: 'Tengo la accion lista. Revisa la tarjeta y confirma para ejecutarla con trazabilidad.',
                action: persistedAction,
                steps,
            });
        }

        let result: Awaited<ReturnType<typeof executeAction>>;
        try {
            result = await executeAction(action, profile);
        } catch (error) {
            await markPersistedProposal(action, 'failed', {
                error: error instanceof Error ? error.message : 'No se pudo ejecutar la accion.',
            });
            await logActivity(profile, action, 'failed', {
                error: error instanceof Error ? error.message : 'No se pudo ejecutar la accion.',
            });
            throw error;
        }
        await recordApproval(profile, action, 'approved', 'Usuario confirmo desde Agent Center');
        await markPersistedProposal(action, 'executed', result);
        await logActivity(profile, action, 'executed', result);
        steps.push({
            kind: 'result',
            title: result.title,
            detail: result.message,
            metadata: result,
        });

        return NextResponse.json({
            status: 'executed',
            reply: result.message,
            action,
            result,
            steps,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'No se pudo ejecutar la accion.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
