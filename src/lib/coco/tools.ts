/**
 * tools.ts — CoCo IA Súper Agente
 * 17 herramientas divididas por módulo y perfil.
 * El executor llama directamente a Supabase (Convive Connect DB).
 */

import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { maybeCreateCoCoCase } from './caseService';
import { PUBLIC_SITE_URL } from '@/lib/config';

// ── Definiciones de herramientas para Anthropic ──────────────────────────────

export const TOOL_DEFINITIONS = [

    // ── MÓDULO: RESIDENTE (Info & Finanzas) ─────────────────────────────────
    {
        name: 'get_resident_info',
        description: 'Obtiene nombre, depto, comunidad y datos del residente autenticado.',
        input_schema: {
            type: 'object' as const,
            properties: { unit_id: { type: 'string', description: 'ID de la unidad/depto' } },
            required: ['unit_id'],
        },
    },
    {
        name: 'get_payment_status',
        description: 'Consulta los gastos comunes del residente: monto, estado pagado/pendiente y fecha de vencimiento.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string' },
                month: { type: 'string', description: 'Formato YYYY-MM. Si omites, usa el mes actual.' },
            },
            required: ['unit_id'],
        },
    },
    {
        name: 'get_water_consumption',
        description: 'Consulta el consumo de agua (m3) y el cobro correspondiente del residente para un período.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string' },
                month: { type: 'string', description: 'Formato YYYY-MM. Si omites, usa el mes actual.' },
            },
            required: ['unit_id'],
        },
    },
    {
        name: 'list_services',
        description: 'Consulta el directorio de servicios de mantenimiento (gasfíter, eléctrico, limpieza, etc.).',
        input_schema: {
            type: 'object' as const,
            properties: {
                category: { type: 'string', description: 'Categoría (ej: plumbing, electrical, locksmith, cleaning, general)' },
            },
            required: [],
        },
    },
    {
        name: 'search_marketplace',
        description: 'Busca productos o artículos a la venta en el Marketplace de la comunidad.',
        input_schema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Término de búsqueda (ej: bicicleta, silla, iphone)' },
            },
            required: ['query'],
        },
    },

    // ── MÓDULO: RECLAMOS & MANTENCIÓN ───────────────────────────────────────
    {
        name: 'create_claim',
        description: 'Registra un reclamo o solicitud de mantención en nombre del residente.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string' },
                category: {
                    type: 'string',
                    enum: ['MANTENCIÓN', 'RUIDO', 'ÁREA_COMÚN', 'ASCENSOR', 'SEGURIDAD', 'ESCALACIÓN_URGENTE', 'OTRO'],
                },
                description: { type: 'string', description: 'Descripción del problema.' },
                priority: { type: 'string', enum: ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'] },
            },
            required: ['unit_id', 'category', 'description'],
        },
    },
    {
        name: 'get_claim_status',
        description: 'Consulta el estado actualizado de un reclamo previamente registrado.',
        input_schema: {
            type: 'object' as const,
            properties: { claim_id: { type: 'string' } },
            required: ['claim_id'],
        },
    },
    {
        name: 'list_my_claims',
        description: 'Lista todos los reclamos activos de una unidad, con su estado actual.',
        input_schema: {
            type: 'object' as const,
            properties: { unit_id: { type: 'string' } },
            required: ['unit_id'],
        },
    },

    // ── MÓDULO: RESERVAS DE ESPACIOS COMUNES ────────────────────────────────
    {
        name: 'check_availability',
        description: 'Consulta si un espacio común (piscina, quincho, gym, salón) está disponible en una fecha.',
        input_schema: {
            type: 'object' as const,
            properties: {
                space_name: { type: 'string', description: 'Nombre del espacio, e.g. "piscina", "quincho"' },
                date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
            },
            required: ['space_name', 'date'],
        },
    },
    {
        name: 'create_reservation',
        description: 'Reserva un espacio común para el residente en la fecha y horario indicados.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string' },
                space_name: { type: 'string' },
                date: { type: 'string', description: 'YYYY-MM-DD' },
                start_time: { type: 'string', description: 'HH:MM' },
                end_time: { type: 'string', description: 'HH:MM' },
            },
            required: ['unit_id', 'space_name', 'date', 'start_time', 'end_time'],
        },
    },

    // ── MÓDULO: COMUNICACIÓN ─────────────────────────────────────────────────
    {
        name: 'create_circular',
        description: 'Redacta y publica una circular o aviso oficial para la comunidad. SOLO para administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                title: { type: 'string' },
                body: { type: 'string' },
            },
            required: ['community_id', 'title', 'body'],
        },
    },
    {
        name: 'create_social_post',
        description: 'Publica un mensaje o anuncio en el muro social de la comunidad en nombre del residente.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                content: { type: 'string', description: 'Texto del post.' },
                author_unit_id: { type: 'string' },
            },
            required: ['community_id', 'content', 'author_unit_id'],
        },
    },

    // ── MÓDULO: VOTACIONES ───────────────────────────────────────────────────
    {
        name: 'list_active_polls',
        description: 'Lista las votaciones o encuestas activas en la comunidad.',
        input_schema: {
            type: 'object' as const,
            properties: { community_id: { type: 'string' } },
            required: ['community_id'],
        },
    },
    {
        name: 'vote_in_poll',
        description: 'Emite el voto del residente en una votación activa.',
        input_schema: {
            type: 'object' as const,
            properties: {
                poll_id: { type: 'string' },
                option_id: { type: 'string', description: 'ID de la opción a votar.' },
                unit_id: { type: 'string' },
            },
            required: ['poll_id', 'option_id', 'unit_id'],
        },
    },

    // ── MÓDULO: CONSERJERÍA ──────────────────────────────────────────────────
    {
        name: 'register_visitor',
        description: 'Registra una visita que va a llegar al edificio. Incluye nombre, RUT y a qué depto va.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                visitor_name: { type: 'string' },
                host_unit_id: { type: 'string', description: 'Depto o unidad donde va la visita.' },
                expected_at: { type: 'string', description: 'Hora esperada en formato HH:MM (opcional).' },
            },
            required: ['community_id', 'visitor_name', 'host_unit_id'],
        },
    },
    {
        name: 'register_package',
        description: 'Registra la llegada de un paquete o encomienda para un departamento.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                unit_id: { type: 'string', description: 'Depto destinatario del paquete.' },
                courier: { type: 'string', description: 'Nombre del courier (ej: Chilexpress, DHL).' },
                description: { type: 'string', description: 'Descripción breve del paquete.' },
            },
            required: ['community_id', 'unit_id'],
        },
    },
    {
        name: 'get_pending_packages',
        description: 'Lista los paquetes pendientes de retiro para un departamento.',
        input_schema: {
            type: 'object' as const,
            properties: { unit_id: { type: 'string' } },
            required: ['unit_id'],
        },
    },
    {
        name: 'send_whatsapp_notification',
        description: 'Envía un mensaje de WhatsApp a un residente. Útil si el conserje o admin te pide avisar de algo urgente o encomienda.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string', description: 'ID del departamento al cual notificar' },
                message: { type: 'string', description: 'El mensaje a enviar por WhatsApp.' },
            },
            required: ['unit_id', 'message'],
        },
    },

    // ── MÓDULO: ADMINISTRADOR ────────────────────────────────────────────────
    {
        name: 'get_defaulters_list',
        description: 'Obtiene la lista de unidades con gastos comunes impagos. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                month: { type: 'string', description: 'Formato YYYY-MM. Si omites, devuelve todos los impagos activos.' },
            },
            required: ['community_id'],
        },
    },
    {
        name: 'create_poll',
        description: 'Crea una nueva votación o encuesta para la comunidad. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                options: {
                    type: 'string',
                    description: 'Opciones separadas por coma. Ej: "Sí,No,Abstención"',
                },
                closes_at: { type: 'string', description: 'Fecha/hora de cierre en formato ISO 8601.' },
            },
            required: ['community_id', 'title', 'options'],
        },
    },
    {
        name: 'update_unit_data',
        description: 'Modifica configuración de un departamento. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string' },
                number: { type: 'string', description: 'Nuevo número o identificador del departamento' },
                floor: { type: 'string', description: 'Nuevo piso del departamento' },
            },
            required: ['unit_id'],
        },
    },

    // ── MÓDULO: IOT & PREDICTIVE MAINTENANCE ─────────────────────────────────
    {
        name: 'request_urgent_access_approval',
        description: 'Envía una notificación push/WhatsApp urgente al residente pidiendo aprobación explícita para abrir la cerradura inteligente (SmarLock) en caso de una emergencia (ej. filtración).',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string' },
                reason: { type: 'string', description: 'Por qué se necesita acceso urgente.' },
            },
            required: ['unit_id', 'reason'],
        },
    },
    {
        name: 'dispatch_provider',
        description: 'Identifica un proveedor externo disponible (ej. gasfíter de turno) y notifica al staff para confirmar el despacho de emergencia.',
        input_schema: {
            type: 'object' as const,
            properties: {
                category: { type: 'string', description: 'Categoría del técnico (ej: plumbing, electrical)' },
                urgency: { type: 'string', enum: ['ALTA', 'URGENTE'] },
                details: { type: 'string', description: 'Detalles del evento base enviados al proveedor.' },
            },
            required: ['category', 'urgency', 'details'],
        },
    },

] as const;

// ── Herramientas que mutan datos reales ──────────────────────────────────────
// Estas SIEMPRE deben pasar por confirmación explícita del usuario antes de
// ejecutarse (ver askCoCo en agent.ts). Las que no están en este set son de
// solo lectura y se ejecutan de inmediato.
export const MUTATING_TOOLS = new Set<string>([
    'create_claim',
    'create_reservation',
    'create_circular',
    'create_social_post',
    'vote_in_poll',
    'register_visitor',
    'register_package',
    'send_whatsapp_notification',
    'create_poll',
    'update_unit_data',
    'request_urgent_access_approval',
    'dispatch_provider',
]);

const RESIDENT_TOOLS = new Set([
    'get_resident_info', 'get_payment_status', 'get_water_consumption', 'list_services',
    'search_marketplace', 'create_claim', 'get_claim_status', 'list_my_claims',
    'check_availability', 'create_reservation', 'create_social_post', 'list_active_polls',
    'vote_in_poll', 'register_visitor', 'get_pending_packages',
]);

const CONCIERGE_TOOLS = new Set([
    ...RESIDENT_TOOLS,
    'register_package', 'send_whatsapp_notification', 'request_urgent_access_approval',
    'dispatch_provider',
]);

const ADMIN_TOOLS = new Set([
    ...CONCIERGE_TOOLS,
    'create_circular', 'get_defaulters_list', 'create_poll', 'update_unit_data',
]);

const SYSTEM_TOOLS = new Set([
    'list_services', 'create_claim', 'request_urgent_access_approval', 'dispatch_provider',
]);

export function isToolAllowedForRole(name: string, role?: string) {
    if (role === 'system') return SYSTEM_TOOLS.has(name);
    if (role === 'admin') return ADMIN_TOOLS.has(name) && name !== 'vote_in_poll';
    if (role === 'concierge') return CONCIERGE_TOOLS.has(name) && name !== 'vote_in_poll';
    return RESIDENT_TOOLS.has(name);
}

/** Título + resumen legible de una acción pendiente, para la pantalla de confirmación. */
export function describePendingAction(name: string, input: Record<string, unknown>): { title: string; summary: string } {
    const str = (key: string) => typeof input[key] === 'string' ? (input[key] as string) : '';

    switch (name) {
        case 'create_claim':
            return { title: 'Registrar reclamo', summary: str('description') || 'Nuevo reclamo o solicitud de mantención.' };
        case 'create_reservation':
            return { title: 'Reservar espacio común', summary: `${str('space_name') || 'Espacio'} el ${str('date')} de ${str('start_time')} a ${str('end_time')}.` };
        case 'create_circular':
            return { title: 'Publicar circular', summary: str('title') || 'Aviso oficial para la comunidad.' };
        case 'create_social_post':
            return { title: 'Publicar en el muro social', summary: str('content') || 'Nueva publicación.' };
        case 'vote_in_poll':
            return { title: 'Emitir voto', summary: 'Registrar tu voto en la votación activa.' };
        case 'register_visitor':
            return { title: 'Registrar visita', summary: `${str('visitor_name') || 'Visitante'} → unidad ${str('host_unit_id')}.` };
        case 'register_package':
            return { title: 'Registrar encomienda', summary: `Paquete de ${str('courier') || 'courier'} para la unidad ${str('unit_id')}.` };
        case 'send_whatsapp_notification':
            return { title: 'Enviar WhatsApp', summary: str('message') || 'Notificación a un residente.' };
        case 'create_poll':
            return { title: 'Crear votación', summary: str('title') || 'Nueva votación para la comunidad.' };
        case 'update_unit_data':
            return { title: 'Modificar unidad', summary: `Actualizar datos de la unidad ${str('unit_id')}.` };
        case 'request_urgent_access_approval':
            return { title: 'Pedir acceso de emergencia', summary: str('reason') || 'Solicitud de apertura remota urgente.' };
        case 'dispatch_provider':
            return { title: 'Proponer proveedor de emergencia', summary: str('details') || 'Identificar un proveedor y notificar al equipo para que confirme el despacho.' };
        default:
            return { title: name, summary: 'Acción propuesta por CoCo.' };
    }
}

// ── Executor ─────────────────────────────────────────────────────────────────

interface UserContext {
    user_id?: string;
    unit_id?: string;
    role?: string;
    community_id?: string;
    channel?: string;
}

function isStaff(userCtx: UserContext) {
    return userCtx.role === 'admin' || userCtx.role === 'concierge' || userCtx.role === 'system';
}

function isAdmin(userCtx: UserContext) {
    return userCtx.role === 'admin' || userCtx.role === 'system';
}

function isUuid(value?: string) {
    return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function isIsoDate(value?: string) {
    return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

function isTime(value?: string) {
    return Boolean(value && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value));
}

async function scopedUnit(userCtx: UserContext, requestedUnitId?: string) {
    const communityId = scopedCommunity(userCtx);
    if (!communityId) return undefined;
    let unitReference = isStaff(userCtx) ? requestedUnitId || userCtx.unit_id : userCtx.unit_id;

    if (!isStaff(userCtx) && !unitReference && userCtx.user_id) {
        const { data: ownedUnits } = await supabaseAdmin
            .from('units')
            .select('id')
            .eq('community_id', communityId)
            .eq('owner_id', userCtx.user_id)
            .limit(2);
        if (ownedUnits?.length === 1) unitReference = ownedUnits[0].id;
    }
    if (!unitReference) return undefined;

    if (isUuid(unitReference)) {
        const { data } = await supabaseAdmin
            .from('units')
            .select('id')
            .eq('community_id', communityId)
            .eq('id', unitReference)
            .maybeSingle();
        return data?.id;
    }

    const cleanReference = unitReference.trim().slice(0, 80);
    const byNumber = await supabaseAdmin
        .from('units')
        .select('id')
        .eq('community_id', communityId)
        .eq('number', cleanReference)
        .limit(2);
    if (byNumber.data?.length === 1) return byNumber.data[0].id;

    const byLegacyNumber = await supabaseAdmin
        .from('units')
        .select('id')
        .eq('community_id', communityId)
        .eq('unit_number', cleanReference)
        .limit(2);
    return byLegacyNumber.data?.length === 1 ? byLegacyNumber.data[0].id : undefined;
}

function scopedCommunity(userCtx: UserContext, _requestedCommunityId?: string) {
    void _requestedCommunityId;
    return isUuid(userCtx.community_id) ? userCtx.community_id : undefined;
}

function forbidden(message = 'No tienes permiso para ejecutar esta herramienta.') {
    return { error: message };
}

export async function executeTool(
    name: string,
    input: Record<string, string>,
    userCtx: UserContext
): Promise<unknown> {
    try {
        if (!isToolAllowedForRole(name, userCtx.role)) return forbidden();
        switch (name) {

            // ── RESIDENTE / FINANZAS ─────────────────────────────────────────
            case 'get_resident_info': {
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar tu unidad.');
                const { data: unit, error: unitError } = await supabaseAdmin
                    .from('units')
                    .select('id,number,unit_number,tower,owner_id,community_id')
                    .eq('id', unitId)
                    .maybeSingle();
                if (unitError) return { error: 'No se pudo consultar la unidad.' };
                if (!unit) return { error: 'Unidad no encontrada' };
                const residentId = !isStaff(userCtx) ? userCtx.user_id : unit.owner_id;
                const { data: resident } = residentId
                    ? await supabaseAdmin.from('profiles').select('name,email,phone_number').eq('id', residentId).eq('community_id', unit.community_id).maybeSingle()
                    : { data: null };
                return { ...unit, resident };
            }

            case 'get_payment_status': {
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar tu unidad.');
                const month = input.month || new Date().toISOString().slice(0, 7);
                if (!/^\d{4}-\d{2}$/.test(month)) return { error: 'El periodo debe usar el formato YYYY-MM.' };
                const { data, error } = await supabaseAdmin
                    .from('expenses')
                    .select('amount,status,due_date,paid_at,month')
                    .eq('unit_id', unitId)
                    .eq('community_id', userCtx.community_id)
                    .eq('month', month)
                    .order('due_date', { ascending: false })
                    .limit(3);
                if (error) return { error: 'No se pudo consultar el estado de pago.' };
                return data ?? { error: 'Sin datos de pago para ese período' };
            }

            case 'get_water_consumption': {
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar tu unidad.');
                const month = input.month || new Date().toISOString().slice(0, 7);
                if (!/^\d{4}-\d{2}$/.test(month)) return { error: 'El periodo debe usar el formato YYYY-MM.' };
                const [year, monthNumber] = month.split('-').map(Number);
                const monthName = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][monthNumber - 1];
                if (!monthName) return { error: 'El periodo indicado no es valido.' };
                const { data, error } = await supabaseAdmin
                    .from('water_readings')
                    .select('reading_value,reading_date,month,year')
                    .eq('unit_id', unitId)
                    .eq('community_id', userCtx.community_id)
                    .eq('year', year)
                    .eq('month', monthName)
                    .order('reading_date', { ascending: false })
                    .limit(3);
                if (error) return { error: 'No se pudo consultar el consumo de agua.' };
                return data ?? { error: 'Sin datos de consumo para ese período' };
            }

            case 'list_services': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const query = supabaseAdmin
                    .from('service_providers')
                    .select('id, name, category, rating, contact_phone')
                    .eq('community_id', communityId)
                    .order('rating', { ascending: false });
                
                if (input.category) {
                    query.eq('category', input.category);
                }
                
                const { data, error } = await query.limit(10);
                if (error) return { error: 'No se pudo obtener el directorio de servicios' };
                return data ?? [];
            }

            case 'search_marketplace': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const query = supabaseAdmin
                    .from('marketplace_items')
                    .select('id, title, description, price, category, status')
                    .ilike('title', `%${input.query}%`)
                    .eq('community_id', communityId)
                    .eq('status', 'available')
                    .limit(5);
                const { data, error } = await query;
                if (error) return { error: 'No se pudo buscar en el Marketplace.' };
                return data ?? [];
            }

            // ── RECLAMOS ────────────────────────────────────────────────────
            case 'create_claim': {
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad asociada al reclamo.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const result = await maybeCreateCoCoCase(
                    input.description,
                    {
                        unitId,
                        communityId,
                        role: userCtx.role || 'resident',
                        channel: 'coco_tool',
                    },
                    'Reclamo registrado desde herramienta CoCo.'
                );

                if (!result.created) {
                    return {
                        error: 'No se pudo registrar el reclamo',
                        detail: result.error || result.reason || 'El router de casos no generó un registro.',
                    };
                }

                return { success: true, claim_id: result.id, message: 'Reclamo registrado correctamente.' };
            }

            case 'get_claim_status': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const query = supabaseAdmin
                    .from('coco_cases')
                    .select('id, category, description, status, urgency, created_at, updated_at')
                    .eq('id', input.claim_id)
                    .eq('community_id', communityId);
                if (!isStaff(userCtx)) {
                    const residentUnitId = await scopedUnit(userCtx);
                    if (!residentUnitId) return forbidden('No pude determinar tu unidad.');
                    query.eq('unit_id', residentUnitId);
                }
                const { data, error } = await query.maybeSingle();
                if (error) return { error: 'No se pudo consultar el reclamo.' };
                return data ?? { error: 'Reclamo no encontrado' };
            }

            case 'list_my_claims': {
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad.');
                const query = supabaseAdmin
                    .from('coco_cases')
                    .select('id, category, description, status, urgency, created_at')
                    .eq('unit_id', unitId)
                    .neq('status', 'closed')
                    .order('created_at', { ascending: false })
                    .limit(10);
                if (userCtx.community_id) query.eq('community_id', userCtx.community_id);
                const { data, error } = await query;
                if (error) return { error: 'No se pudieron consultar los reclamos.' };
                return data ?? [];
            }

            // ── RESERVAS ────────────────────────────────────────────────────
            case 'check_availability': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                if (!isIsoDate(input.date)) return { error: 'La fecha debe usar el formato YYYY-MM-DD.' };
                const { data: amenity, error: amenityError } = await supabaseAdmin
                    .from('amenities')
                    .select('id,name')
                    .eq('community_id', communityId)
                    .eq('is_active', true)
                    .ilike('name', `%${input.space_name}%`)
                    .limit(1)
                    .maybeSingle();
                if (amenityError) return { error: 'No se pudo consultar el espacio comun.' };
                if (!amenity) return { error: `No se encontro el espacio "${input.space_name}" en tu comunidad.` };

                const { data, error } = await supabaseAdmin
                    .from('bookings')
                    .select('start_time,end_time')
                    .eq('community_id', communityId)
                    .eq('amenity_id', amenity.id)
                    .eq('date', input.date)
                    .neq('status', 'cancelled')
                    .order('start_time', { ascending: true });
                if (error) return { error: 'No se pudo consultar la disponibilidad.' };
                return {
                    space: amenity.name,
                    date: input.date,
                    occupied_slots: data ?? [],
                    available: !data || data.length === 0,
                };
            }

            case 'create_reservation': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad del residente.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad asociada a la reserva.');
                if (!userCtx.user_id) return forbidden('No se pudo identificar al usuario para crear la reserva.');
                if (!isIsoDate(input.date) || input.date < new Date().toISOString().slice(0, 10)) {
                    return { error: 'La reserva requiere una fecha valida, igual o posterior a hoy.' };
                }
                if (!isTime(input.start_time) || !isTime(input.end_time) || input.start_time >= input.end_time) {
                    return { error: 'El horario debe ser valido y la hora de termino posterior al inicio.' };
                }
                const { data: amenity, error: amenityError } = await supabaseAdmin
                    .from('amenities')
                    .select('id, name')
                    .eq('community_id', communityId)
                    .eq('is_active', true)
                    .ilike('name', `%${input.space_name}%`)
                    .limit(1)
                    .maybeSingle();
                if (amenityError) return { error: 'No se pudo consultar el espacio comun.' };
                if (!amenity) return { error: `No se encontró el espacio "${input.space_name}"` };
                const { data: conflict, error: conflictError } = await supabaseAdmin
                    .from('bookings')
                    .select('id')
                    .eq('community_id', communityId)
                    .eq('amenity_id', amenity.id)
                    .eq('date', input.date)
                    .neq('status', 'cancelled')
                    .lt('start_time', input.end_time)
                    .gt('end_time', input.start_time)
                    .limit(1);
                if (conflictError) return { error: 'No se pudo validar la disponibilidad del horario.' };
                if (conflict?.length) return { error: 'Ese horario ya esta ocupado. Elige otro bloque.' };
                const { data, error } = await supabaseAdmin.rpc('coco_create_booking', {
                    p_community_id: communityId,
                    p_amenity_id: amenity.id,
                    p_user_id: userCtx.user_id,
                    p_date: input.date,
                    p_start_time: input.start_time,
                    p_end_time: input.end_time,
                });
                if (error) return { error: 'No se pudo crear la reserva. Puede que ese horario ya esté ocupado.' };
                return { success: true, booking_id: String(data), message: `Reserva de ${amenity.name} confirmada.` };
            }

            // ── COMUNICACIÓN ─────────────────────────────────────────────────
            case 'create_circular': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden enviar circulares.' };
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const { data, error } = await supabaseAdmin
                    .from('announcements')
                    .insert({
                        community_id: communityId,
                        title: input.title,
                        content: input.body,
                        author_id: userCtx.user_id || null,
                        priority: 'info',
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo publicar la circular.' };
                return { success: true, announcement_id: data.id, message: 'Circular publicada exitosamente.' };
            }

            case 'create_social_post': {
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                if (!userCtx.user_id) return forbidden('No pude determinar el autor de la publicacion.');
                const unitId = await scopedUnit(userCtx, input.author_unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad autora.');
                const { data, error } = await supabaseAdmin
                    .from('social_posts')
                    .insert({
                        community_id: communityId,
                        content: input.content,
                        author_id: userCtx.user_id,
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo publicar en el muro.' };
                return { success: true, post_id: data.id, message: 'Publicación en el muro realizada.' };
            }

            // ── VOTACIONES ──────────────────────────────────────────────────
            case 'list_active_polls': {
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const { data, error } = await supabaseAdmin
                    .from('polls')
                    .select('id,title,description,end_date,options:poll_options(id,text)')
                    .eq('community_id', communityId)
                    .eq('status', 'active')
                    .gte('end_date', new Date().toISOString())
                    .order('end_date', { ascending: true });
                if (error) return { error: 'No se pudieron consultar las votaciones.' };
                return data ?? [];
            }

            case 'vote_in_poll': {
                if (userCtx.role !== 'resident') return forbidden('Solo los residentes pueden emitir votos.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar al residente y su comunidad.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad votante.');
                const { data: poll } = await supabaseAdmin
                    .from('polls')
                    .select('id')
                    .eq('id', input.poll_id)
                    .eq('community_id', communityId)
                    .eq('status', 'active')
                    .gte('end_date', new Date().toISOString())
                    .maybeSingle();
                if (!poll) return { error: 'La votacion no existe, ya cerro o no pertenece a tu comunidad.' };
                const { data: option } = await supabaseAdmin
                    .from('poll_options')
                    .select('id')
                    .eq('id', input.option_id)
                    .eq('poll_id', poll.id)
                    .maybeSingle();
                if (!option) return { error: 'La opcion indicada no pertenece a esta votacion.' };
                const { error } = await supabaseAdmin.rpc('coco_cast_vote', {
                    p_community_id: communityId,
                    p_poll_id: poll.id,
                    p_option_id: option.id,
                    p_user_id: userCtx.user_id,
                });
                if (error) return { error: 'No se pudo registrar el voto. ¿Ya votaste en esta encuesta?' };
                return { success: true, message: '¡Voto registrado exitosamente! 🗳️' };
            }

            // ── CONSERJERÍA ──────────────────────────────────────────────────
            case 'register_visitor': {
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const unitId = await scopedUnit(userCtx, input.host_unit_id);
                if (!unitId) return forbidden('La unidad de destino no existe en tu comunidad o no tienes permiso para usarla.');
                if (!userCtx.user_id) return forbidden('No pude identificar a quien registra la visita.');
                const { data, error } = await supabaseAdmin
                    .from('visitor_logs')
                    .insert({
                        community_id: communityId,
                        visitor_name: input.visitor_name,
                        unit_id: unitId,
                        purpose: input.expected_at
                            ? `Visita esperada a las ${input.expected_at}`
                            : 'Visita registrada desde CoCo',
                        registered_by: userCtx.user_id,
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo registrar la visita.' };
                return { success: true, visitor_id: data.id, message: `Visita de ${input.visitor_name} registrada.` };
            }

            case 'register_package': {
                if (!isStaff(userCtx)) return forbidden('Solo conserjería o administración pueden registrar encomiendas.');
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('La unidad destinataria no existe en tu comunidad.');
                const packageDescription = [input.courier, input.description].filter(Boolean).join(' - ') || 'Encomienda sin descripcion';
                const { data, error } = await supabaseAdmin
                    .from('packages')
                    .insert({
                        community_id: communityId,
                        recipient_unit_id: unitId,
                        description: packageDescription,
                        status: 'pending',
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo registrar el paquete.' };
                return { success: true, package_id: data.id, message: 'Encomienda registrada. Se notificará al residente.' };
            }

            case 'get_pending_packages': {
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const { data, error } = await supabaseAdmin
                    .from('packages')
                    .select('id,description,received_at')
                    .eq('community_id', communityId)
                    .eq('recipient_unit_id', unitId)
                    .eq('status', 'pending')
                    .order('received_at', { ascending: false });
                if (error) return { error: 'No se pudieron consultar las encomiendas.' };
                return data ?? [];
            }

            case 'send_whatsapp_notification': {
                const secret = process.env.WHATSAPP_WEBHOOK_SECRET || '';
                if (!secret) {
                    return {
                        success: false,
                        skipped: true,
                        error: 'WhatsApp interno no está configurado: falta WHATSAPP_WEBHOOK_SECRET.',
                    };
                }

                // Find all profiles for this unit
                if (!isStaff(userCtx)) return forbidden('Solo conserjería o administración pueden enviar WhatsApp a una unidad.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad destino.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const { data: profiles } = await supabaseAdmin
                    .from('profiles')
                    .select('id, name')
                    .eq('community_id', communityId)
                    .eq('unit_id', unitId);
                
                if (!profiles || profiles.length === 0) {
                    return { error: 'No se encontraron residentes registrados con WhatsApp para ese departamento.' };
                }

                const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : PUBLIC_SITE_URL;
                
                let successCount = 0;
                let skippedCount = 0;
                let failedCount = 0;
                for (const p of profiles) {
                    const res = await fetch(`${baseUrl}/api/whatsapp-notify`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${secret}`
                        },
                        body: JSON.stringify({
                            user_id: p.id,
                            title: 'Notificación de CoCo',
                            body: input.message,
                            type: 'info'
                        })
                    });
                    const delivery = await res.json().catch(() => ({})) as { success?: boolean; skipped?: boolean };
                    if (res.ok && delivery.success) successCount++;
                    else if (res.ok && delivery.skipped) skippedCount++;
                    else failedCount++;
                }
                
                return { 
                    success: successCount > 0,
                    sent: successCount,
                    skipped: skippedCount,
                    failed: failedCount,
                    message: successCount > 0
                        ? `Mensaje de WhatsApp enviado a ${successCount} residente(s) del departamento.`
                        : 'No se envio el WhatsApp porque ningun residente de la unidad tiene el canal habilitado.',
                };
            }

            // ── ADMINISTRADOR ────────────────────────────────────────────────
            case 'get_defaulters_list': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden acceder a esta información.' };
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const query = supabaseAdmin
                    .from('expenses')
                    .select('unit_id,amount,due_date,month,units:unit_id(number,unit_number)')
                    .eq('community_id', communityId)
                    .in('status', ['pending', 'overdue'])
                    .order('due_date', { ascending: true });
                if (input.month) query.eq('month', input.month);
                const { data, error } = await query.limit(20);
                if (error) return { error: 'No se pudo consultar la cartera vencida.' };
                return data ?? [];
            }

            case 'create_poll': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden crear votaciones.' };
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const options = input.options.split(',').map(o => o.trim()).filter(Boolean);
                if (options.length < 2) return { error: 'La votacion necesita al menos dos opciones.' };
                const endDate = input.closes_at;
                if (!endDate || Number.isNaN(Date.parse(endDate)) || Date.parse(endDate) <= Date.now()) {
                    return { error: 'La fecha de cierre debe ser valida y posterior al momento actual.' };
                }
                const { data: poll, error: pollErr } = await supabaseAdmin
                    .from('polls')
                    .insert({
                        community_id: communityId,
                        title: input.title,
                        description: input.description || input.title,
                        end_date: new Date(endDate).toISOString(),
                        status: 'active',
                        created_by: userCtx.user_id || null,
                    })
                    .select('id')
                    .single();
                if (pollErr) return { error: 'No se pudo crear la votación.' };
                const { error: optionsError } = await supabaseAdmin.from('poll_options').insert(
                    options.map((text, display_order) => ({ poll_id: poll.id, text, display_order, votes: 0 }))
                );
                if (optionsError) {
                    await supabaseAdmin.from('polls').delete().eq('id', poll.id).eq('community_id', communityId);
                    return { error: 'No se pudieron crear las opciones. La votacion fue revertida.' };
                }
                return { success: true, poll_id: poll.id, message: `Votación "${input.title}" creada con ${options.length} opciones.` };
            }

            case 'update_unit_data': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden modificar información de departamentos.' };
                
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('La unidad no existe en tu comunidad.');
                const updates: Record<string, string | number> = {};
                if (input.number !== undefined) updates.number = input.number.trim().slice(0, 80);
                if (input.floor !== undefined) {
                    const floor = Number(input.floor);
                    if (!Number.isInteger(floor) || floor < -10 || floor > 300) return { error: 'El piso indicado no es valido.' };
                    updates.floor = floor;
                }

                if (Object.keys(updates).length === 0) return { error: 'No se enviaron datos para actualizar' };

                const update = supabaseAdmin
                    .from('units')
                    .update(updates)
                    .eq('id', unitId)
                    .eq('community_id', communityId)
                    .select('id')
                    .maybeSingle();
                const { data: updatedUnit, error } = await update;
                
                if (error || !updatedUnit) return { error: 'No se pudo actualizar el departamento', detail: error?.message };
                return { success: true, message: `Información de la unidad actualizada correctamente.` };
            }

            // ── IOT & PREDICTIVE MAINTENANCE ─────────────────────────────────
            case 'request_urgent_access_approval': {
                if (!isStaff(userCtx)) return forbidden('Solo conserjeria o administracion pueden solicitar acceso urgente.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('La unidad no existe en tu comunidad.');
                const { data: unit, error: unitError } = await supabaseAdmin
                    .from('units')
                    .select('owner_id')
                    .eq('id', unitId)
                    .eq('community_id', communityId)
                    .maybeSingle();
                if (unitError || !unit) return { error: 'No se pudo validar la unidad para solicitar acceso.' };
                const residentFilter = unit?.owner_id
                    ? `unit_id.eq.${unitId},id.eq.${unit.owner_id}`
                    : `unit_id.eq.${unitId}`;
                const { data: residents, error: residentsError } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('community_id', communityId)
                    .or(residentFilter);
                if (residentsError) return { error: 'No se pudieron consultar los residentes de la unidad.' };

                const notifications = (residents || []).map(resident => ({
                    user_id: resident.id,
                    type: 'alert',
                    category: 'iot_access_approval',
                    title: 'Solicitud urgente de acceso',
                    body: input.reason,
                    link: '/resident/cases',
                    community_id: communityId,
                }));

                let notificationError: string | null = null;
                if (notifications.length > 0) {
                    const { error } = await supabaseAdmin.from('notifications').insert(notifications);
                    notificationError = error?.message || null;
                }

                return {
                    success: notifications.length > 0 && !notificationError,
                    status: 'APPROVAL_PENDING',
                    notified_residents: notifications.length,
                    ...(notificationError ? { error: 'No se pudo entregar la solicitud de acceso.' } : {}),
                    message: notifications.length > 0
                        ? `Se notificó a ${notifications.length} residente(s) de la unidad ${input.unit_id} para autorizar acceso urgente.`
                        : `No encontré residentes asociados a la unidad ${input.unit_id}; escalar a conserjería.`
                };
            }

            case 'dispatch_provider': {
                if (!isStaff(userCtx)) return forbidden('Solo conserjeria o administracion pueden gestionar proveedores de emergencia.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const providerQuery = supabaseAdmin
                    .from('service_providers')
                    .select('id, name, contact_phone, category, response_time')
                    .eq('community_id', communityId)
                    .eq('availability', 'available')
                    .order('verified', { ascending: false })
                    .order('rating', { ascending: false })
                    .limit(1);
                if (input.category) providerQuery.eq('category', input.category);

                const { data: providers, error: providerError } = await providerQuery;
                if (providerError) return { error: 'No se pudo consultar el directorio de proveedores.' };
                const provider = providers?.[0];

                const { data: staff, error: staffError } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('community_id', communityId)
                    .in('role', ['admin', 'concierge']);
                if (staffError) return { error: 'No se pudo consultar al equipo de la comunidad.' };

                let staffNotificationError: string | null = null;
                if (staff?.length) {
                    const { error } = await supabaseAdmin.from('notifications').insert(staff.map(member => ({
                        user_id: member.id,
                        type: input.urgency === 'URGENTE' ? 'alert' : 'warning',
                        category: 'iot_provider_dispatch',
                        title: provider ? 'Proveedor sugerido por CoCo' : 'Proveedor requerido por CoCo',
                        body: provider
                            ? `${provider.name} (${provider.contact_phone}) calza con ${input.category}. Detalle: ${input.details}`
                            : `No hay proveedor disponible para ${input.category}. Detalle: ${input.details}`,
                        link: '/admin/mantenimiento',
                        community_id: communityId,
                    })));
                    staffNotificationError = error?.message || null;
                }

                return {
                    success: Boolean(provider) && !staffNotificationError,
                    status: provider ? 'PROVIDER_IDENTIFIED' : 'NO_PROVIDER_AVAILABLE',
                    provider,
                    notified_staff: staff?.length || 0,
                    ...(staffNotificationError ? { error: 'No se pudo notificar al equipo de la comunidad.' } : {}),
                    message: provider
                        ? `Proveedor disponible sugerido: ${provider.name} (${provider.contact_phone}). Staff notificado para confirmar despacho.`
                        : `No encontré proveedor disponible para ${input.category}; staff notificado para gestión manual.`
                };
            }

            default:
                return { error: `Herramienta desconocida: ${name}` };
        }
    } catch (err) {
        console.error(`[CoCo Tool Error] ${name}:`, err);
        return { error: `Error ejecutando herramienta ${name}` };
    }
}
