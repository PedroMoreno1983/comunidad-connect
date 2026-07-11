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
                audience: {
                    type: 'string',
                    enum: ['TODOS', 'PROPIETARIOS', 'ARRENDATARIOS'],
                },
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
                visitor_rut: { type: 'string', description: 'RUT del visitante (opcional).' },
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
            return { title: 'Despachar proveedor', summary: str('details') || 'Contactar proveedor externo de emergencia.' };
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

function scopedUnit(userCtx: UserContext, requestedUnitId?: string) {
    return isStaff(userCtx) ? requestedUnitId || userCtx.unit_id : userCtx.unit_id;
}

function scopedCommunity(userCtx: UserContext, requestedCommunityId?: string) {
    return isStaff(userCtx) ? requestedCommunityId || userCtx.community_id : userCtx.community_id;
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
        switch (name) {

            // ── RESIDENTE / FINANZAS ─────────────────────────────────────────
            case 'get_resident_info': {
                const unitId = scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar tu unidad.');
                const { data } = await supabaseAdmin
                    .from('units')
                    .select('unit_number, residents(name, email, phone), communities(name)')
                    .eq('id', unitId)
                    .maybeSingle();
                return data ?? { error: 'Unidad no encontrada' };
            }

            case 'get_payment_status': {
                const unitId = scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar tu unidad.');
                const month = input.month || new Date().toISOString().slice(0, 7);
                const { data } = await supabaseAdmin
                    .from('fees')
                    .select('amount, status, due_date, paid_at')
                    .eq('unit_id', unitId)
                    .like('period', `${month}%`)
                    .order('due_date', { ascending: false })
                    .limit(3);
                return data ?? { error: 'Sin datos de pago para ese período' };
            }

            case 'get_water_consumption': {
                const unitId = scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar tu unidad.');
                const month = input.month || new Date().toISOString().slice(0, 7);
                const { data } = await supabaseAdmin
                    .from('water_readings')
                    .select('period, m3_consumed, amount_charged, reading_date')
                    .eq('unit_id', unitId)
                    .like('period', `${month}%`)
                    .order('reading_date', { ascending: false })
                    .limit(3);
                return data ?? { error: 'Sin datos de consumo para ese período' };
            }

            case 'list_services': {
                const query = supabaseAdmin
                    .from('service_providers')
                    .select('id, name, category, rating, contact_phone')
                    .order('rating', { ascending: false });
                if (userCtx.community_id) query.eq('community_id', userCtx.community_id);
                
                if (input.category) {
                    query.eq('category', input.category);
                }
                
                const { data, error } = await query.limit(10);
                if (error) return { error: 'No se pudo obtener el directorio de servicios' };
                return data ?? [];
            }

            case 'search_marketplace': {
                const query = supabaseAdmin
                    .from('marketplace_items')
                    .select('id, title, description, price, category, status')
                    .ilike('title', `%${input.query}%`)
                    .eq('status', 'available')
                    .limit(5);
                if (userCtx.community_id) query.eq('community_id', userCtx.community_id);
                const { data } = await query;
                return data ?? [];
            }

            // ── RECLAMOS ────────────────────────────────────────────────────
            case 'create_claim': {
                const unitId = scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad asociada al reclamo.');
                const result = await maybeCreateCoCoCase(
                    input.description,
                    {
                        unitId,
                        communityId: userCtx.community_id,
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
                const query = supabaseAdmin
                    .from('coco_cases')
                    .select('id, category, description, status, urgency, created_at, updated_at')
                    .eq('id', input.claim_id);
                if (!isStaff(userCtx)) {
                    if (!userCtx.unit_id) return forbidden('No pude determinar tu unidad.');
                    query.eq('unit_id', userCtx.unit_id);
                } else if (userCtx.community_id) {
                    query.eq('community_id', userCtx.community_id);
                }
                const { data } = await query.maybeSingle();
                return data ?? { error: 'Reclamo no encontrado' };
            }

            case 'list_my_claims': {
                const unitId = scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad.');
                const query = supabaseAdmin
                    .from('coco_cases')
                    .select('id, category, description, status, urgency, created_at')
                    .eq('unit_id', unitId)
                    .neq('status', 'closed')
                    .order('created_at', { ascending: false })
                    .limit(10);
                if (userCtx.community_id) query.eq('community_id', userCtx.community_id);
                const { data } = await query;
                return data ?? [];
            }

            // ── RESERVAS ────────────────────────────────────────────────────
            case 'check_availability': {
                const query = supabaseAdmin
                    .from('bookings')
                    .select('start_time, end_time, amenities(name)')
                    .eq('date', input.date)
                    .ilike('amenities.name', `%${input.space_name}%`)
                    .eq('status', 'confirmed');
                if (userCtx.community_id) query.eq('community_id', userCtx.community_id);
                const { data } = await query;
                return {
                    space: input.space_name,
                    date: input.date,
                    occupied_slots: data ?? [],
                    available: !data || data.length === 0,
                };
            }

            case 'create_reservation': {
                if (!userCtx.community_id) return forbidden('No pude determinar la comunidad del residente.');
                const { data: amenity } = await supabaseAdmin
                    .from('amenities')
                    .select('id, name')
                    .eq('community_id', userCtx.community_id)
                    .ilike('name', `%${input.space_name}%`)
                    .maybeSingle();
                if (!amenity) return { error: `No se encontró el espacio "${input.space_name}"` };
                if (!userCtx.user_id) return { error: 'No se pudo identificar al residente para crear la reserva.' };
                const { data, error } = await supabaseAdmin
                    .from('bookings')
                    .insert({
                        user_id: userCtx.user_id,
                        amenity_id: amenity.id,
                        date: input.date,
                        start_time: input.start_time,
                        end_time: input.end_time,
                        status: 'confirmed',
                        community_id: userCtx.community_id,
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo crear la reserva. Puede que ese horario ya esté ocupado.' };
                return { success: true, booking_id: data.id, message: `Reserva de ${amenity.name} confirmada.` };
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
                        audience: input.audience || 'TODOS',
                        source: 'COCO_IA',
                        created_at: new Date().toISOString(),
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo publicar la circular.' };
                return { success: true, announcement_id: data.id, message: 'Circular publicada exitosamente.' };
            }

            case 'create_social_post': {
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const unitId = scopedUnit(userCtx, input.author_unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad autora.');
                const { data, error } = await supabaseAdmin
                    .from('social_posts')
                    .insert({
                        community_id: communityId,
                        content: input.content,
                        unit_id: unitId,
                        source: 'COCO_IA',
                        created_at: new Date().toISOString(),
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
                const { data } = await supabaseAdmin
                    .from('polls')
                    .select('id, title, description, closes_at, options:poll_options(id, text)')
                    .eq('community_id', communityId)
                    .gte('closes_at', new Date().toISOString())
                    .order('closes_at', { ascending: true });
                return data ?? [];
            }

            case 'vote_in_poll': {
                const unitId = scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad votante.');
                const { error } = await supabaseAdmin
                    .from('poll_votes')
                    .insert({
                        poll_id: input.poll_id,
                        option_id: input.option_id,
                        unit_id: unitId,
                        voted_at: new Date().toISOString(),
                    });
                if (error) return { error: 'No se pudo registrar el voto. ¿Ya votaste en esta encuesta?' };
                return { success: true, message: '¡Voto registrado exitosamente! 🗳️' };
            }

            // ── CONSERJERÍA ──────────────────────────────────────────────────
            case 'register_visitor': {
                if (!isStaff(userCtx) && input.host_unit_id !== userCtx.unit_id) {
                    return forbidden('Solo puedes registrar visitas para tu propia unidad.');
                }
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const { data, error } = await supabaseAdmin
                    .from('visitors')
                    .insert({
                        community_id: communityId,
                        visitor_name: input.visitor_name,
                        visitor_rut: input.visitor_rut || null,
                        host_unit_id: input.host_unit_id,
                        expected_at: input.expected_at || null,
                        status: 'ESPERADO',
                        registered_at: new Date().toISOString(),
                        source: 'COCO_IA',
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
                const { data, error } = await supabaseAdmin
                    .from('packages')
                    .insert({
                        community_id: communityId,
                        unit_id: input.unit_id,
                        courier: input.courier || 'Sin especificar',
                        description: input.description || null,
                        status: 'PENDIENTE_RETIRO',
                        received_at: new Date().toISOString(),
                        source: 'COCO_IA',
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo registrar el paquete.' };
                return { success: true, package_id: data.id, message: 'Encomienda registrada. Se notificará al residente.' };
            }

            case 'get_pending_packages': {
                const unitId = scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad.');
                const { data } = await supabaseAdmin
                    .from('packages')
                    .select('id, courier, description, received_at')
                    .eq('unit_id', unitId)
                    .eq('status', 'PENDIENTE_RETIRO')
                    .order('received_at', { ascending: false });
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
                const unitId = scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad destino.');
                const { data: profiles } = await supabaseAdmin
                    .from('profiles')
                    .select('id, name')
                    .eq('unit_id', unitId);
                
                if (!profiles || profiles.length === 0) {
                    return { error: 'No se encontraron residentes registrados con WhatsApp para ese departamento.' };
                }

                const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : PUBLIC_SITE_URL;
                
                let successCount = 0;
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
                    if (res.ok) successCount++;
                }
                
                return { 
                    success: true, 
                    message: `Mensaje de WhatsApp enviado a ${successCount} residente(s) del departamento.` 
                };
            }

            // ── ADMINISTRADOR ────────────────────────────────────────────────
            case 'get_defaulters_list': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden acceder a esta información.' };
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const query = supabaseAdmin
                    .from('fees')
                    .select('unit_id, amount, due_date, period, units(unit_number)')
                    .eq('community_id', communityId)
                    .eq('status', 'PENDIENTE')
                    .order('due_date', { ascending: true });
                if (input.month) query.like('period', `${input.month}%`);
                const { data } = await query.limit(20);
                return data ?? [];
            }

            case 'create_poll': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden crear votaciones.' };
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const options = input.options.split(',').map(o => o.trim()).filter(Boolean);
                const { data: poll, error: pollErr } = await supabaseAdmin
                    .from('polls')
                    .insert({
                        community_id: communityId,
                        title: input.title,
                        description: input.description || null,
                        closes_at: input.closes_at || null,
                        source: 'COCO_IA',
                    })
                    .select('id')
                    .single();
                if (pollErr) return { error: 'No se pudo crear la votación.' };
                await supabaseAdmin.from('poll_options').insert(
                    options.map(text => ({ poll_id: poll.id, text }))
                );
                return { success: true, poll_id: poll.id, message: `Votación "${input.title}" creada con ${options.length} opciones.` };
            }

            case 'update_unit_data': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden modificar información de departamentos.' };
                
                const updates: Record<string, string | number> = {};
                if (input.number !== undefined) updates.number = input.number;
                if (input.floor !== undefined) updates.floor = Number(input.floor);

                if (Object.keys(updates).length === 0) return { error: 'No se enviaron datos para actualizar' };

                const update = supabaseAdmin
                    .from('units')
                    .update(updates)
                    .eq('id', input.unit_id);
                if (userCtx.community_id) update.eq('community_id', userCtx.community_id);
                const { error } = await update;
                
                if (error) return { error: 'No se pudo actualizar el departamento', detail: error.message };
                return { success: true, message: `Información de la unidad actualizada correctamente.` };
            }

            // ── IOT & PREDICTIVE MAINTENANCE ─────────────────────────────────
            case 'request_urgent_access_approval': {
                const { data: residents } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('unit_id', input.unit_id);

                const notifications = (residents || []).map(resident => ({
                    user_id: resident.id,
                    type: 'alert',
                    category: 'iot_access_approval',
                    title: 'Solicitud urgente de acceso',
                    body: input.reason,
                    link: '/resident/cases',
                    community_id: userCtx.community_id,
                }));

                if (notifications.length > 0) {
                    await supabaseAdmin.from('notifications').insert(notifications);
                }

                return {
                    success: true,
                    status: 'APPROVAL_PENDING',
                    notified_residents: notifications.length,
                    message: notifications.length > 0
                        ? `Se notificó a ${notifications.length} residente(s) de la unidad ${input.unit_id} para autorizar acceso urgente.`
                        : `No encontré residentes asociados a la unidad ${input.unit_id}; escalar a conserjería.`
                };
            }

            case 'dispatch_provider': {
                const providerQuery = supabaseAdmin
                    .from('service_providers')
                    .select('id, name, contact_phone, category, response_time')
                    .eq('availability', 'available')
                    .order('verified', { ascending: false })
                    .order('rating', { ascending: false })
                    .limit(1);
                if (userCtx.community_id) providerQuery.eq('community_id', userCtx.community_id);
                if (input.category) providerQuery.eq('category', input.category);

                const { data: providers } = await providerQuery;
                const provider = providers?.[0];

                const { data: staff } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('community_id', userCtx.community_id)
                    .in('role', ['admin', 'concierge']);

                if (staff?.length) {
                    await supabaseAdmin.from('notifications').insert(staff.map(member => ({
                        user_id: member.id,
                        type: input.urgency === 'URGENTE' ? 'alert' : 'warning',
                        category: 'iot_provider_dispatch',
                        title: provider ? 'Proveedor sugerido por CoCo' : 'Proveedor requerido por CoCo',
                        body: provider
                            ? `${provider.name} (${provider.contact_phone}) calza con ${input.category}. Detalle: ${input.details}`
                            : `No hay proveedor disponible para ${input.category}. Detalle: ${input.details}`,
                        link: '/admin/mantenimiento',
                        community_id: userCtx.community_id,
                    })));
                }

                return {
                    success: Boolean(provider),
                    status: provider ? 'PROVIDER_IDENTIFIED' : 'NO_PROVIDER_AVAILABLE',
                    provider,
                    notified_staff: staff?.length || 0,
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
