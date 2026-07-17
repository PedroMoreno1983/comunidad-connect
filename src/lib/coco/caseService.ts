import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordAiEvent } from '@/lib/ai/telemetry';

const DEFAULT_COMMUNITY_ID = '00000000-0000-0000-0000-000000000000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CoCoRole = 'admin' | 'resident' | 'concierge';
type CaseType =
    | 'consulta_info'
    | 'reclamo'
    | 'incidencia'
    | 'emergencia'
    | 'gestion_admin'
    | 'novedad_turno'
    | 'actualizacion_ticket'
    | 'alerta_seguridad'
    | 'solicitud_gestion';
type CaseCategory =
    | 'plomeria'
    | 'electricidad'
    | 'ruido'
    | 'seguridad'
    | 'aseo'
    | 'ascensor'
    | 'areas_comunes'
    | 'finanzas'
    | 'administracion'
    | 'otro';
type CaseUrgency = 'baja' | 'media' | 'alta' | 'emergencia';
type CaseAction =
    | 'responder_directo'
    | 'crear_ticket'
    | 'escalar_conserjeria'
    | 'escalar_admin'
    | 'protocolo_emergencia'
    | 'registrar_bitacora'
    | 'actualizar_ticket'
    | 'notificar_admin'
    | 'solicitar_clarificacion';

export interface CoCoCaseContext {
    userId?: string;
    unitId?: string;
    unitName?: string;
    communityId?: string;
    role?: string;
    channel?: string;
    currentPage?: string;
}

export interface CoCoCaseDecision {
    shouldCreateCase: boolean;
    type: CaseType;
    category: CaseCategory;
    urgency: CaseUrgency;
    action: CaseAction;
    title: string;
    reason: string;
}

export interface CoCoCaseSummary {
    created: boolean;
    id?: string;
    title?: string;
    type?: CaseType;
    category?: CaseCategory;
    urgency?: CaseUrgency;
    action?: CaseAction;
    status?: string;
    reason?: string;
    error?: string;
}

type StoredCoCoCase = {
    id: string;
    title: string;
    type: CaseType;
    category: CaseCategory;
    urgency: CaseUrgency;
    action: CaseAction;
    status: string;
};

function validUuid(value?: string | null) {
    if (!value) return null;
    return UUID_RE.test(value) ? value : null;
}

function roleOf(value?: string): CoCoRole {
    return value === 'admin' || value === 'concierge' || value === 'resident' ? value : 'resident';
}

function includesAny(text: string, terms: string[]) {
    return terms.some(term => text.includes(term));
}

function compactTitle(message: string, category: CaseCategory, urgency: CaseUrgency) {
    const clean = message.replace(/\s+/g, ' ').trim();
    const prefix = urgency === 'emergencia' ? 'Emergencia' : urgency === 'alta' ? 'Alta prioridad' : 'Caso CoCo';
    if (!clean) return `${prefix}: ${category}`;
    return `${prefix}: ${clean.slice(0, 72)}${clean.length > 72 ? '...' : ''}`;
}

function toSummary(data: StoredCoCoCase, reason: string): CoCoCaseSummary {
    return {
        created: true,
        id: data.id,
        title: data.title,
        type: data.type,
        category: data.category,
        urgency: data.urgency,
        action: data.action,
        status: data.status,
        reason,
    };
}

async function findRecentDuplicate(message: string, context: CoCoCaseContext): Promise<StoredCoCoCase | null> {
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    let query = supabaseAdmin
        .from('coco_cases')
        .select('id, title, type, category, urgency, action, status')
        .eq('source_message', message.slice(0, 4000))
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1);

    const userId = validUuid(context.userId);
    const unitId = validUuid(context.unitId);
    if (userId) query = query.eq('user_id', userId);
    if (unitId) query = query.eq('unit_id', unitId);

    const { data, error } = await query.maybeSingle();
    if (error) return null;
    return data as StoredCoCoCase | null;
}

async function notifyStaffForCase(data: StoredCoCoCase, context: CoCoCaseContext, sourceMessage: string) {
    if (data.urgency !== 'alta' && data.urgency !== 'emergencia') {
        recordAiEvent({
            provider: 'system',
            feature: 'coco.case_notifications',
            status: 'skipped',
            model: 'rules-v1',
            outputChars: data.title.length,
            fallbackUsed: 'low_urgency',
        });
        return;
    }

    const communityId = validUuid(context.communityId) ?? DEFAULT_COMMUNITY_ID;
    const { data: staff, error: staffError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('community_id', communityId)
        .in('role', ['admin', 'concierge']);

    if (staffError || !staff?.length) {
        recordAiEvent({
            provider: 'system',
            feature: 'coco.case_notifications',
            status: staffError ? 'error' : 'skipped',
            model: 'rules-v1',
            outputChars: data.title.length,
            error: staffError || 'No staff recipients',
        });
        return;
    }

    const type = data.urgency === 'emergencia' ? 'alert' : 'warning';
    const notifications = staff.map(member => ({
        user_id: member.id,
        type,
        category: 'coco_case',
        title: data.urgency === 'emergencia' ? 'Emergencia detectada por CoCo' : 'Caso urgente detectado por CoCo',
        body: `${data.title}\n${sourceMessage.slice(0, 240)}`,
        link: '/admin/mantenimiento',
        community_id: communityId,
    }));

    let insert = await supabaseAdmin.from('notifications').insert(notifications);

    if (insert.error?.message.toLowerCase().includes('community_id')) {
        insert = await supabaseAdmin.from('notifications').insert(
            notifications.map(notification => ({
                user_id: notification.user_id,
                type: notification.type,
                category: notification.category,
                title: notification.title,
                body: notification.body,
                link: notification.link,
            }))
        );
    }

    recordAiEvent({
        provider: 'system',
        feature: 'coco.case_notifications',
        status: insert.error ? 'error' : 'success',
        model: 'rules-v1',
        outputChars: data.title.length,
        error: insert.error,
    });
}

export function classifyCoCoMessage(message: string, context: CoCoCaseContext = {}): CoCoCaseDecision {
    const text = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const role = roleOf(context.role);

    const category: CaseCategory =
        includesAny(text, ['filtr', 'gotera', 'agua', 'caneria', 'bano', 'lavaplatos', 'inund']) ? 'plomeria' :
        includesAny(text, ['luz', 'enchufe', 'corto', 'chisp', 'electric', 'tablero']) ? 'electricidad' :
        includesAny(text, ['ruido', 'musica', 'fiesta', 'gritos', 'molest']) ? 'ruido' :
        includesAny(text, ['intruso', 'sospech', 'robo', 'asalt', 'estacionamiento', 'camara', 'porton', 'seguridad']) ? 'seguridad' :
        includesAny(text, ['ascensor', 'elevador', 'atrapad']) ? 'ascensor' :
        includesAny(text, ['basura', 'sucio', 'limpieza', 'aseo', 'olor']) ? 'aseo' :
        includesAny(text, ['piscina', 'quincho', 'gimnasio', 'sala multiuso', 'area comun', 'jardin']) ? 'areas_comunes' :
        includesAny(text, ['gasto comun', 'gastos comunes', 'pago', 'deuda', 'debo', 'saldo', 'cobro', 'boleta', 'transferencia']) ? 'finanzas' :
        includesAny(text, ['reglamento', 'acta', 'comite', 'administracion', 'circular']) ? 'administracion' :
        'otro';

    const emergency =
        includesAny(text, ['incendio', 'fuego', 'olor a gas', 'gas ', 'humo', 'electrocut', 'chispas', 'corto circuito', 'inundacion']) ||
        (category === 'plomeria' && includesAny(text, ['se esta', 'ahora', 'cayendo', 'chorro', 'no para', 'urgente'])) ||
        (category === 'ascensor' && includesAny(text, ['atrapad', 'encerrad'])) ||
        (category === 'seguridad' && includesAny(text, ['intruso', 'robo', 'asalt', 'amenaza', 'no responde']));

    const high =
        emergency ||
        includesAny(text, ['urgente', 'grave', 'peligro', 'riesgo', 'no puedo entrar', 'sin luz', 'sin agua']) ||
        (role === 'concierge' && category === 'seguridad');

    const recurring = includesAny(text, ['otra vez', 'de nuevo', 'cuarta vez', 'tercera vez', 'varias veces', 'recurrente']);
    const pureGreeting = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|gracias)[\s!.?]*$/.test(text.trim());
    const asksInfo = pureGreeting || includesAny(text, ['cuando vence', 'como pago', 'donde veo', 'como reservo', 'que es']);
    const alreadyActed = role === 'concierge' && includesAny(text, ['ya ', 'subi', 'registre', 'autorice', 'cerre', 'avise', 'llego']);

    let type: CaseType = 'consulta_info';
    let urgency: CaseUrgency = 'baja';
    let action: CaseAction = 'responder_directo';
    let shouldCreateCase = false;
    let reason = 'Consulta informativa, no requiere registro operativo.';

    if (emergency) {
        type = category === 'seguridad' ? 'alerta_seguridad' : 'emergencia';
        urgency = 'emergencia';
        action = category === 'seguridad' ? 'notificar_admin' : 'protocolo_emergencia';
        shouldCreateCase = true;
        reason = 'Hay señales de riesgo activo o daño en curso.';
    } else if (role === 'concierge' && alreadyActed) {
        type = 'novedad_turno';
        urgency = high ? 'alta' : 'media';
        action = 'registrar_bitacora';
        shouldCreateCase = true;
        reason = 'Conserjería reporta una acción ya realizada que debe quedar en bitácora.';
    } else if (role === 'admin' && includesAny(text, ['crea', 'crear', 'agenda', 'programa', 'asigna', 'coordina'])) {
        type = 'gestion_admin';
        urgency = high ? 'alta' : 'media';
        action = 'crear_ticket';
        shouldCreateCase = true;
        reason = 'Administración está solicitando una gestión operativa.';
    } else if (category !== 'finanzas' && category !== 'administracion' && !pureGreeting) {
        type = recurring ? 'reclamo' : 'incidencia';
        urgency = high ? 'alta' : recurring ? 'media' : 'media';
        action = recurring ? 'escalar_admin' : high ? 'escalar_conserjeria' : 'crear_ticket';
        shouldCreateCase = true;
        reason = recurring
            ? 'El mensaje muestra recurrencia y conviene elevarlo con historial.'
            : 'El mensaje describe un problema operativo que requiere seguimiento.';
    } else if (role === 'concierge' && !asksInfo) {
        type = 'solicitud_gestion';
        urgency = 'media';
        action = 'solicitar_clarificacion';
        shouldCreateCase = false;
        reason = 'El reporte de conserjería es ambiguo; conviene pedir un dato antes de registrarlo.';
    }

    return {
        shouldCreateCase,
        type,
        category,
        urgency,
        action,
        title: compactTitle(message, category, urgency),
        reason,
    };
}

export async function maybeCreateCoCoCase(
    message: string,
    context: CoCoCaseContext,
    assistantReply?: string
): Promise<CoCoCaseSummary> {
    const started = Date.now();
    const decision = classifyCoCoMessage(message, context);

    if (!decision.shouldCreateCase) {
        recordAiEvent({
            provider: 'system',
            feature: 'coco.case_router',
            status: 'skipped',
            model: 'rules-v1',
            latencyMs: Date.now() - started,
            promptChars: message.length,
            outputChars: decision.reason.length,
        });
        return { created: false, ...decision };
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        recordAiEvent({
            provider: 'system',
            feature: 'coco.case_router',
            status: 'skipped',
            model: 'rules-v1',
            latencyMs: Date.now() - started,
            promptChars: message.length,
            outputChars: decision.reason.length,
            error: 'Missing Supabase admin env',
        });
        return { created: false, ...decision, error: 'Supabase admin env not configured' };
    }

    const payload = {
        community_id: validUuid(context.communityId) ?? DEFAULT_COMMUNITY_ID,
        user_id: validUuid(context.userId),
        unit_id: validUuid(context.unitId),
        unit_label: context.unitName || (validUuid(context.unitId) ? null : context.unitId) || null,
        role: roleOf(context.role),
        channel: context.channel || 'web',
        type: decision.type,
        category: decision.category,
        urgency: decision.urgency,
        action: decision.action,
        title: decision.title,
        description: message.slice(0, 2000),
        reason: decision.reason,
        source_message: message.slice(0, 4000),
        assistant_reply: assistantReply?.slice(0, 4000) || null,
        status: 'open',
        metadata: {
            currentPage: context.currentPage || null,
            router: 'rules-v1',
        },
    };

    const duplicate = await findRecentDuplicate(message, context);
    if (duplicate) {
        recordAiEvent({
            provider: 'system',
            feature: 'coco.case_router',
            status: 'skipped',
            model: 'rules-v1',
            latencyMs: Date.now() - started,
            promptChars: message.length,
            outputChars: decision.reason.length,
            fallbackUsed: 'recent_duplicate',
        });
        return toSummary(duplicate, decision.reason);
    }

    const { data, error } = await supabaseAdmin
        .from('coco_cases')
        .insert(payload)
        .select('id, title, type, category, urgency, action, status')
        .single();

    if (error) {
        recordAiEvent({
            provider: 'system',
            feature: 'coco.case_router',
            status: 'error',
            model: 'rules-v1',
            latencyMs: Date.now() - started,
            promptChars: message.length,
            outputChars: decision.reason.length,
            error,
        });
        return { created: false, ...decision, error: error.message };
    }

    await notifyStaffForCase(data as StoredCoCoCase, context, message);

    recordAiEvent({
        provider: 'system',
        feature: 'coco.case_router',
        status: 'success',
        model: 'rules-v1',
        latencyMs: Date.now() - started,
        promptChars: message.length,
        outputChars: decision.reason.length,
    });

    return {
        created: true,
        id: data.id,
        title: data.title,
        type: data.type,
        category: data.category,
        urgency: data.urgency,
        action: data.action,
        status: data.status,
        reason: decision.reason,
    };
}
