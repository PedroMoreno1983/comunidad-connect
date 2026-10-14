/**
 * agentTools.ts — Herramientas nuevas del ciclo agentico del Agent Center.
 *
 * Cada herramienta declara: su esquema para Claude, los roles que la pueden
 * usar, si lee o escribe, como valida sus argumentos y como se ejecuta.
 *
 * Regla de diseño: aqui NO viven reglas de negocio nuevas. Cada herramienta
 * delega en la pieza que ya es dueña de esa regla:
 *   - estacionamientos  -> executeTool de CoCo (search_parking, get_my_parking,
 *                          book_parking -> RPC parking_book_as) y las etiquetas
 *                          de src/lib/parking.ts.
 *   - votaciones        -> executeTool de CoCo (list_active_polls, create_poll).
 *   - compras grupales  -> src/lib/supermarketGroupOrders.ts.
 *   - mantencion        -> readOpenMaintenanceRequests (taskPlaybooks) y el ciclo
 *                          de vida de src/lib/services/requestLifecycle.ts.
 *   - residentes/unidad -> las lecturas de communityResearch.ts.
 *
 * Toda herramienta trabaja SOLO sobre `profile.community_id`: ningun argumento
 * que mande Claude puede elegir otra comunidad.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { executeTool as executeCoCoTool } from '@/lib/coco/tools';
import { BOOKING_STATUS_LABELS, SPOT_STATUS_LABELS, formatParkingRange } from '@/lib/parking';
import { listSupermarketGroupOrders } from '@/lib/supermarketGroupOrders';
import { serviceRequestTransitionError, validServiceSchedule } from '@/lib/services/requestLifecycle';
import { recordOperationEvent } from '@/lib/operations/audit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { readOpenMaintenanceRequests, readPreventiveInputs } from '@/lib/agent-center/taskPlaybooks';
import { scoreAssetRisks } from '@/lib/maintenance/assetRisk';
import { runCommunityReadTool } from '@/lib/agent-center/communityResearch';
import { chileTodayISO } from '@/lib/agent-center/chileDate';
import { getUnitStatement } from '@/lib/finance/collectionService';
import { createAgreement, listAgreementsForUnits } from '@/lib/finance/agreementService';
import { activeCommitteeMembers } from '@/lib/finance/committeeMembers';
import { proposeAgreementPlan, type AgreementProposal } from '@/lib/finance/agreementProposal';
import type { AgentKey, AgentProfile, ToolName } from '@/lib/agent-center/domain';
import type { AgentExecutionResult } from '@/lib/agent-center/orchestrator';
import type { ParkingBookingStatus, ParkingSpotStatus, ServiceRequestStatus, UserRole } from '@/lib/types';

export type AgentToolRisk = 'read' | 'write';

export type AgentToolDefinition = {
    name: ToolName;
    agentKey: AgentKey;
    risk: AgentToolRisk;
    roles: UserRole[];
    targetHref: string;
    label: string;
    tool: Anthropic.Tool;
    validate: (input: Record<string, unknown>, profile: AgentProfile) => Record<string, unknown>;
    execute: (args: Record<string, unknown>, profile: AgentProfile) => Promise<AgentExecutionResult>;
};

const STAFF: UserRole[] = ['admin', 'concierge'];
const EVERYONE: UserRole[] = ['admin', 'concierge', 'resident'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown, max = 200) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function requiredText(value: unknown, label: string, min: number, max: number) {
    const cleaned = text(value, max);
    if (cleaned.length < min) throw new Error(`${label} es obligatorio.`);
    return cleaned;
}

function uuid(value: unknown, label: string) {
    const cleaned = text(value, 40);
    if (!UUID.test(cleaned)) throw new Error(`${label} no es un identificador valido. Usa el que devolvio una lectura.`);
    return cleaned;
}

function isoDateTime(value: unknown, label: string) {
    const cleaned = text(value, 40);
    const parsed = new Date(cleaned);
    if (!cleaned || !Number.isFinite(parsed.getTime())) throw new Error(`${label} debe venir en formato ISO 8601.`);
    return parsed.toISOString();
}

function flag(value: unknown) {
    return value === true || value === 'true';
}

function communityOf(profile: AgentProfile) {
    if (!profile.community_id || !UUID.test(profile.community_id)) throw new Error('Tu perfil no tiene una comunidad asignada.');
    return profile.community_id;
}

function isStaff(profile: AgentProfile) {
    return profile.role === 'admin' || profile.role === 'concierge';
}

/** Contexto para reutilizar el executor de CoCo, siempre con la comunidad del perfil. */
function cocoContext(profile: AgentProfile, userId = profile.id) {
    return { user_id: userId, role: profile.role, community_id: communityOf(profile), unit_id: profile.unit_id || undefined, channel: 'agent-center' };
}

/** CoCo devuelve `{ error }` en vez de lanzar: aqui se convierte en error real. */
function unwrapCoCo<T>(value: unknown): T {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof (value as { error?: unknown }).error === 'string') {
        throw new Error((value as { error: string }).error);
    }
    return value as T;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
}

function daysSince(iso: unknown, now = Date.now()) {
    const time = Date.parse(String(iso || ''));
    return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / 86_400_000)) : 0;
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

type CoCoParkingSearch = { disponibles?: Array<Record<string, unknown>>; total_publicados?: number; nota?: string };

const getParkingStatus: AgentToolDefinition = {
    name: 'get_parking_status',
    agentKey: 'concierge',
    risk: 'read',
    roles: EVERYONE,
    targetHref: '/estacionamientos',
    label: 'Revisar estacionamientos',
    tool: {
        name: 'get_parking_status',
        description: 'Estado de los estacionamientos de la comunidad: cupos disponibles en un rango horario (con spot_id y tarifas) y, para administracion/conserjeria, las reservas vigentes y el estado de los cupos. Sin rango usa las proximas 2 horas.',
        input_schema: {
            type: 'object',
            properties: {
                startsAt: { type: 'string', description: 'Inicio ISO 8601 con zona horaria de Chile, p. ej. 2026-10-14T09:00:00-03:00' },
                endsAt: { type: 'string', description: 'Fin ISO 8601' },
                coveredOnly: { type: 'boolean' },
                needsEvCharger: { type: 'boolean' },
            },
            required: [],
            additionalProperties: false,
        },
    },
    validate(input) {
        const startsAt = input.startsAt ? isoDateTime(input.startsAt, 'El inicio') : new Date().toISOString();
        const endsAt = input.endsAt ? isoDateTime(input.endsAt, 'El fin') : new Date(Date.parse(startsAt) + 2 * 3_600_000).toISOString();
        if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error('El fin debe ser posterior al inicio.');
        return { startsAt, endsAt, coveredOnly: flag(input.coveredOnly), needsEvCharger: flag(input.needsEvCharger) };
    },
    async execute(args, profile) {
        const communityId = communityOf(profile);
        const availability = unwrapCoCo<CoCoParkingSearch>(await executeCoCoTool('search_parking', {
            starts_at: String(args.startsAt),
            ends_at: String(args.endsAt),
            covered_only: String(Boolean(args.coveredOnly)),
            needs_ev_charger: String(Boolean(args.needsEvCharger)),
        }, cocoContext(profile)));
        const available = availability.disponibles || [];
        const range = formatParkingRange(String(args.startsAt), String(args.endsAt));

        if (!isStaff(profile)) {
            const mine = unwrapCoCo<Record<string, unknown>>(await executeCoCoTool('get_my_parking', {}, cocoContext(profile)));
            return {
                entityType: 'parking_status', entityId: communityId, title: 'Estacionamientos revisados', targetHref: '/estacionamientos',
                message: `${plural(available.length, 'cupo disponible', 'cupos disponibles')} para ${range}.`,
                data: { range, available, mine },
            };
        }

        const admin = getSupabaseAdmin();
        const [spotsQuery, bookingsQuery] = await Promise.all([
            admin.from('parking_spots').select('id, status').eq('community_id', communityId).limit(500),
            admin.from('parking_bookings')
                .select('id, spot_id, starts_at, ends_at, status, total_amount, parking_spots(label, floor_level)')
                .eq('community_id', communityId)
                .in('status', ['confirmed', 'active'])
                .gte('ends_at', new Date().toISOString())
                .order('starts_at', { ascending: true })
                .limit(50),
        ]);
        if (spotsQuery.error) throw spotsQuery.error;
        if (bookingsQuery.error) throw bookingsQuery.error;

        const spotsByStatus: Record<string, number> = {};
        for (const spot of spotsQuery.data || []) {
            const label = SPOT_STATUS_LABELS[spot.status as ParkingSpotStatus] || String(spot.status);
            spotsByStatus[label] = (spotsByStatus[label] || 0) + 1;
        }
        const bookings = (bookingsQuery.data || []).map(row => {
            const spot = (Array.isArray(row.parking_spots) ? row.parking_spots[0] : row.parking_spots) as { label?: string; floor_level?: string } | null;
            return {
                bookingId: row.id,
                spot: spot?.label || 'Cupo',
                status: BOOKING_STATUS_LABELS[row.status as ParkingBookingStatus] || String(row.status),
                range: formatParkingRange(String(row.starts_at), String(row.ends_at)),
                totalAmount: Number(row.total_amount || 0),
            };
        });
        const active = (bookingsQuery.data || []).filter(row => row.status === 'active').length;
        return {
            entityType: 'parking_status', entityId: communityId, title: 'Estacionamientos revisados', targetHref: '/estacionamientos',
            message: `${plural(available.length, 'cupo disponible', 'cupos disponibles')} para ${range}; ${plural(bookings.length, 'reserva vigente', 'reservas vigentes')} (${active} en curso).`,
            data: { range, available, spotsByStatus, bookings },
        };
    },
};

const getSupermarketOrdersSummary: AgentToolDefinition = {
    name: 'get_supermarket_orders_summary',
    agentKey: 'community',
    risk: 'read',
    roles: EVERYONE,
    targetHref: '/supermercado',
    label: 'Revisar compras grupales del super',
    tool: {
        name: 'get_supermarket_orders_summary',
        description: 'Resumen de los pedidos y compras grupales del supermercado de la comunidad: estado, cierre, participantes, productos, tienda elegida, total y pagos pendientes. Las compras individuales de cada hogar son privadas y no se incluyen.',
        input_schema: {
            type: 'object',
            properties: { status: { type: 'string', enum: ['open', 'ready', 'locked', 'completed', 'all'] } },
            required: [],
            additionalProperties: false,
        },
    },
    validate(input) {
        const status = text(input.status, 20) || 'all';
        if (!['open', 'ready', 'locked', 'completed', 'all'].includes(status)) throw new Error('El estado de la compra grupal no es valido.');
        return { status };
    },
    async execute(args, profile) {
        const communityId = communityOf(profile);
        const orders = await listSupermarketGroupOrders({ id: profile.id, name: profile.name, role: profile.role, community_id: communityId });
        const filtered = orders.filter(order => args.status === 'all' || order.status === args.status);
        const byStatus: Record<string, number> = {};
        for (const order of filtered) byStatus[order.status] = (byStatus[order.status] || 0) + 1;
        const summary = filtered.slice(0, 15).map(order => ({
            orderId: order.id,
            title: order.title,
            status: order.status,
            closesAt: order.closesAt,
            members: order.members.length,
            items: order.items.length,
            pendingPayments: order.members.filter(member => !member.paidAt).length,
            selectedStore: order.selectedStore || null,
            selectedTotal: order.selectedTotal ?? null,
            governanceStatus: order.governanceStatus,
        }));
        const open = filtered.filter(order => order.status === 'open').length;
        return {
            entityType: 'supermarket_group_orders', entityId: communityId, title: 'Compras grupales revisadas', targetHref: '/supermercado',
            message: `${plural(filtered.length, 'compra grupal', 'compras grupales')} (${open} abierta(s)).`,
            data: { byStatus, orders: summary },
        };
    },
};

type CoCoPoll = { id: string; title: string; description?: string; end_date: string; options?: Array<{ id: string; text: string }> };

const getActivePolls: AgentToolDefinition = {
    name: 'get_active_polls',
    agentKey: 'community',
    risk: 'read',
    roles: EVERYONE,
    targetHref: '/votaciones',
    label: 'Revisar votaciones activas',
    tool: {
        name: 'get_active_polls',
        description: 'Votaciones activas de la comunidad con sus opciones, votos acumulados, opcion que lidera y fecha de cierre.',
        input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
    validate: () => ({}),
    async execute(_args, profile) {
        const communityId = communityOf(profile);
        const polls = unwrapCoCo<CoCoPoll[]>(await executeCoCoTool('list_active_polls', {}, cocoContext(profile))) || [];
        const pollIds = polls.map(poll => poll.id);
        const votes = new Map<string, number>();
        if (pollIds.length) {
            // Los ids vienen de la consulta ya acotada a la comunidad.
            const { data, error } = await getSupabaseAdmin().from('poll_options').select('id, poll_id, votes').in('poll_id', pollIds);
            if (error) throw error;
            for (const row of data || []) votes.set(String(row.id), Number(row.votes || 0));
        }
        const summary = polls.map(poll => {
            const options = (poll.options || []).map(option => ({ optionId: option.id, text: option.text, votes: votes.get(option.id) || 0 }));
            const totalVotes = options.reduce((sum, option) => sum + option.votes, 0);
            const leader = totalVotes ? [...options].sort((a, b) => b.votes - a.votes)[0] : null;
            return { pollId: poll.id, title: poll.title, closesAt: poll.end_date, totalVotes, leading: leader?.text || null, options };
        });
        return {
            entityType: 'polls', entityId: communityId, title: 'Votaciones revisadas', targetHref: '/votaciones',
            message: `${plural(summary.length, 'votacion activa', 'votaciones activas')}.`,
            data: { polls: summary },
        };
    },
};

const getMaintenanceBacklog: AgentToolDefinition = {
    name: 'get_maintenance_backlog',
    agentKey: 'maintenance',
    risk: 'read',
    roles: STAFF,
    targetHref: '/admin/mantenimiento',
    label: 'Revisar backlog de mantencion',
    tool: {
        name: 'get_maintenance_backlog',
        description: 'Backlog de tickets de mantencion abiertos con antiguedad en dias, proveedor asignado, fecha comprometida vencida y ticketId. Usalo antes de asignar o actualizar un ticket.',
        input_schema: {
            type: 'object',
            properties: { minAgeDays: { type: 'number', description: 'Solo tickets con al menos esta antiguedad' } },
            required: [],
            additionalProperties: false,
        },
    },
    validate(input) {
        const minAgeDays = Number(input.minAgeDays ?? 0);
        return { minAgeDays: Number.isFinite(minAgeDays) && minAgeDays > 0 ? Math.min(3650, Math.floor(minAgeDays)) : 0 };
    },
    async execute(args, profile) {
        const communityId = communityOf(profile);
        const { data: requests } = await readOpenMaintenanceRequests(communityId);
        const providerIds = Array.from(new Set(requests.map(row => row.provider_id).filter((id): id is string => Boolean(id))));
        const providers = new Map<string, string>();
        if (providerIds.length) {
            const { data, error } = await getSupabaseAdmin().from('service_providers').select('id, name')
                .eq('community_id', communityId).in('id', providerIds);
            if (error) throw error;
            for (const row of data || []) providers.set(String(row.id), String(row.name));
        }
        const today = new Date().toISOString().slice(0, 10);
        const tickets = requests
            .map(row => ({
                ticketId: row.id,
                description: String(row.description || '').slice(0, 160),
                status: row.status,
                ageDays: daysSince(row.created_at),
                provider: row.provider_id ? providers.get(String(row.provider_id)) || 'Proveedor de otra fuente' : null,
                preferredDate: row.preferred_date || null,
                overdue: Boolean(row.preferred_date && String(row.preferred_date) < today),
            }))
            .filter(ticket => ticket.ageDays >= Number(args.minAgeDays || 0))
            .sort((a, b) => b.ageDays - a.ageDays);
        const buckets = {
            hasta7Dias: tickets.filter(ticket => ticket.ageDays <= 7).length,
            de8a30Dias: tickets.filter(ticket => ticket.ageDays > 7 && ticket.ageDays <= 30).length,
            masDe30Dias: tickets.filter(ticket => ticket.ageDays > 30).length,
        };
        const unassigned = tickets.filter(ticket => !ticket.provider).length;
        const overdue = tickets.filter(ticket => ticket.overdue).length;
        return {
            entityType: 'maintenance_backlog', entityId: communityId, title: 'Backlog de mantencion revisado', targetHref: '/admin/mantenimiento',
            message: `${plural(tickets.length, 'ticket abierto', 'tickets abiertos')}: ${unassigned} sin proveedor, ${overdue} con fecha vencida, ${buckets.masDe30Dias} con mas de 30 dias.`,
            data: { total: tickets.length, unassigned, overdue, buckets, oldest: tickets.slice(0, 15) },
        };
    },
};

const findResidentOrUnit: AgentToolDefinition = {
    name: 'find_resident_or_unit',
    agentKey: 'community',
    risk: 'read',
    roles: STAFF,
    targetHref: '/admin/units',
    label: 'Buscar residente o unidad',
    tool: {
        name: 'find_resident_or_unit',
        description: 'Busca residentes (nombre, correo, departamento; devuelve residentId) y unidades (torre, numero, ocupacion) de la comunidad.',
        input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    },
    validate: input => ({ query: requiredText(input.query, 'El texto de busqueda', 1, 80) }),
    async execute(args, profile) {
        const communityId = communityOf(profile);
        const [residents, units] = await Promise.all([
            runCommunityReadTool('find_residents', { query: args.query }, profile),
            runCommunityReadTool('read_units', { query: args.query }, profile),
        ]);
        const residentRows = (Array.isArray(residents) ? residents : []).slice(0, 10).map(row => {
            const record = row as Record<string, unknown>;
            return { residentId: record.id, name: record.full_name || record.name, email: record.email, department: record.department_number || null };
        });
        const unitRows = (Array.isArray(units) ? units : []).slice(0, 10);
        return {
            entityType: 'directory_search', entityId: communityId, title: 'Busqueda en el directorio', targetHref: '/admin/units',
            message: `${plural(residentRows.length, 'residente')} y ${plural(unitRows.length, 'unidad', 'unidades')} coinciden con "${args.query}".`,
            data: { residents: residentRows, units: unitRows },
        };
    },
};

const getMaintenanceRisk: AgentToolDefinition = {
    name: 'get_maintenance_risk',
    agentKey: 'maintenance',
    risk: 'read',
    roles: STAFF,
    targetHref: '/admin/mantenimiento',
    label: 'Revisar riesgo de activos',
    tool: {
        name: 'get_maintenance_risk',
        description: 'Mantencion predictiva: puntaje de riesgo 0-100 por activo del edificio (edad vs vida util, fallas correctivas recientes y si se aceleran, preventiva atrasada, costo de 12 meses), con razones legibles, dias promedio entre fallas y costo. Ordenado de mayor a menor riesgo. No escribe nada.',
        input_schema: {
            type: 'object',
            properties: { onlyAtRisk: { type: 'boolean', description: 'Solo activos de riesgo medio o alto' } },
            required: [],
            additionalProperties: false,
        },
    },
    validate(input) {
        return { onlyAtRisk: flag(input.onlyAtRisk) };
    },
    async execute(args, profile) {
        const communityId = communityOf(profile);
        const inputs = await readPreventiveInputs(communityId);
        const all = scoreAssetRisks({ ...inputs, today: chileTodayISO() });
        const risks = args.onlyAtRisk ? all.filter(risk => risk.level !== 'low') : all;
        const high = all.filter(risk => risk.level === 'high');
        const medium = all.filter(risk => risk.level === 'medium');
        const cost12m = all.reduce((sum, risk) => sum + risk.cost12m, 0);
        return {
            entityType: 'building_assets', entityId: communityId, title: 'Riesgo de activos revisado', targetHref: '/admin/mantenimiento',
            message: `${plural(all.length, 'activo')}: ${high.length} de riesgo alto${high.length ? ` (${high.slice(0, 3).map(risk => risk.assetName).join(', ')})` : ''}, ${medium.length} medio. Costo de mantencion en 12 meses: $${Math.round(cost12m).toLocaleString('es-CL')}.`,
            data: { total: all.length, high: high.length, medium: medium.length, cost12m, assets: risks.slice(0, 20) },
        };
    },
};

// ---------------------------------------------------------------------------
// Escrituras (dentro del ciclo SIEMPRE pasan por confirmacion humana)
// ---------------------------------------------------------------------------

const createPoll: AgentToolDefinition = {
    name: 'create_poll',
    agentKey: 'community',
    risk: 'write',
    roles: ['admin'],
    targetHref: '/votaciones',
    label: 'Crear votacion',
    tool: {
        name: 'create_poll',
        description: 'Crea una votacion para la comunidad. Requiere confirmacion humana. Solo administracion.',
        input_schema: {
            type: 'object',
            properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 10 },
                closesAt: { type: 'string', description: 'Cierre ISO 8601, posterior a ahora' },
            },
            required: ['title', 'options', 'closesAt'],
            additionalProperties: false,
        },
    },
    validate(input) {
        const title = requiredText(input.title, 'El titulo de la votacion', 3, 140);
        const rawOptions = Array.isArray(input.options) ? input.options : [];
        const options = Array.from(new Set(rawOptions.map(option => text(option, 80)).filter(Boolean)));
        if (options.length < 2 || options.length > 10) throw new Error('La votacion necesita entre 2 y 10 opciones distintas.');
        // create_poll de CoCo recibe las opciones separadas por coma.
        if (options.some(option => option.includes(','))) throw new Error('Las opciones no pueden contener comas.');
        const closesAt = isoDateTime(input.closesAt, 'El cierre de la votacion');
        if (Date.parse(closesAt) <= Date.now()) throw new Error('El cierre de la votacion debe ser posterior a ahora.');
        return { title, description: text(input.description, 600), options, closesAt };
    },
    async execute(args, profile) {
        const result = unwrapCoCo<{ poll_id?: string; message?: string }>(await executeCoCoTool('create_poll', {
            title: String(args.title),
            description: String(args.description || ''),
            options: (args.options as string[]).join(','),
            closes_at: String(args.closesAt),
        }, cocoContext(profile)));
        return {
            entityType: 'poll', entityId: result.poll_id || null, title: 'Votacion creada', targetHref: '/votaciones',
            message: result.message || `Votacion "${args.title}" creada.`,
            data: { pollId: result.poll_id, options: args.options, closesAt: args.closesAt },
        };
    },
};

const MAINTENANCE_STATUSES: ServiceRequestStatus[] = ['pending', 'accepted', 'awaiting_confirmation', 'cancelled'];

const updateMaintenanceTicket: AgentToolDefinition = {
    name: 'update_maintenance_ticket',
    agentKey: 'maintenance',
    risk: 'write',
    roles: STAFF,
    targetHref: '/admin/mantenimiento',
    label: 'Actualizar ticket de mantencion',
    tool: {
        name: 'update_maintenance_ticket',
        description: 'Asigna un proveedor verificado y/o cambia el estado o la fecha de un ticket de mantencion abierto. Usa ticketId de get_maintenance_backlog. Requiere confirmacion humana.',
        input_schema: {
            type: 'object',
            properties: {
                ticketId: { type: 'string' },
                providerId: { type: 'string', description: 'Proveedor verificado de la comunidad' },
                status: { type: 'string', enum: MAINTENANCE_STATUSES },
                preferredDate: { type: 'string', description: 'YYYY-MM-DD, para reagendar' },
                preferredTime: { type: 'string', description: 'HH:MM, para reagendar' },
                note: { type: 'string' },
            },
            required: ['ticketId'],
            additionalProperties: false,
        },
    },
    validate(input) {
        const ticketId = uuid(input.ticketId, 'El ticket');
        const providerId = input.providerId ? uuid(input.providerId, 'El proveedor') : '';
        const status = text(input.status, 30);
        if (status && !MAINTENANCE_STATUSES.includes(status as ServiceRequestStatus)) throw new Error('El estado del ticket no es valido.');
        const preferredDate = text(input.preferredDate, 10);
        const preferredTime = text(input.preferredTime, 5);
        if ((preferredDate || preferredTime) && !validServiceSchedule(preferredDate, preferredTime)) {
            throw new Error('Para reagendar indica fecha YYYY-MM-DD y hora HH:MM validas.');
        }
        if (!providerId && !status && !preferredDate) throw new Error('Indica que cambiar del ticket: proveedor, estado o fecha.');
        return { ticketId, providerId, status, preferredDate, preferredTime, note: text(input.note, 300) };
    },
    async execute(args, profile) {
        const communityId = communityOf(profile);
        const admin = getSupabaseAdmin();
        const { data: ticket, error } = await admin.from('service_requests')
            .select('id, provider_id, user_id, status, description, preferred_date, preferred_time, community_id')
            .eq('id', String(args.ticketId)).eq('community_id', communityId).maybeSingle();
        if (error) throw error;
        if (!ticket) throw new Error('El ticket no existe en tu comunidad.');

        const patch: Record<string, unknown> = {};
        let providerName: string | null = null;
        if (args.providerId) {
            if (!['pending', 'accepted'].includes(String(ticket.status))) throw new Error('Solo se asigna proveedor a un ticket pendiente o aceptado.');
            const { data: provider, error: providerError } = await admin.from('service_providers')
                .select('id, name, verified, community_id')
                .eq('id', String(args.providerId)).eq('community_id', communityId).maybeSingle();
            if (providerError) throw providerError;
            if (!provider) throw new Error('El proveedor no existe en tu comunidad.');
            if (!provider.verified) throw new Error('Solo se pueden asignar proveedores verificados.');
            patch.provider_id = provider.id;
            providerName = String(provider.name);
        }

        const reschedule = Boolean(args.preferredDate);
        // Reagendar vuelve el ticket a 'pending' (regla de requestLifecycle).
        const next = (reschedule ? 'pending' : String(args.status || '')) as ServiceRequestStatus;
        if (reschedule && args.status && args.status !== 'pending') throw new Error('Reagendar deja el ticket pendiente; no combines reagendar con otro estado.');
        if (next && (next !== ticket.status || reschedule)) {
            const transitionError = serviceRequestTransitionError({
                current: ticket.status as ServiceRequestStatus,
                next,
                requester: ticket.user_id === profile.id,
                manager: isStaff(profile),
                reschedule,
            });
            if (transitionError) throw new Error(transitionError);
            patch.status = next;
            if (reschedule) {
                patch.preferred_date = args.preferredDate;
                patch.preferred_time = args.preferredTime;
            }
        }
        if (!Object.keys(patch).length) throw new Error('El ticket ya esta en ese estado; no hay cambios que aplicar.');

        const { data: updated, error: updateError } = await admin.from('service_requests')
            .update(patch)
            .eq('id', ticket.id).eq('community_id', communityId).eq('status', ticket.status)
            .select('id, status, provider_id, preferred_date, preferred_time')
            .maybeSingle();
        if (updateError) throw updateError;
        if (!updated) throw new Error('El ticket cambio mientras se preparaba la accion. Vuelve a revisarlo.');

        await recordOperationEvent({
            communityId,
            actorId: profile.id,
            actorRole: profile.role,
            action: 'agent.tool.update_maintenance_ticket',
            entityType: 'service_request',
            entityId: String(ticket.id),
            severity: patch.status === 'cancelled' ? 'warning' : 'success',
            status: 'success',
            summary: providerName ? `Ticket asignado a ${providerName}` : `Ticket actualizado a ${String(patch.status || ticket.status)}`,
            metadata: { previousStatus: ticket.status, nextStatus: patch.status || ticket.status, providerId: patch.provider_id || null, note: args.note || null },
        });
        const changes = [
            providerName ? `asignado a ${providerName}` : '',
            patch.status ? `estado ${String(patch.status)}` : '',
            reschedule ? `reagendado para ${String(args.preferredDate)} ${String(args.preferredTime)}` : '',
        ].filter(Boolean).join(', ');
        return {
            entityType: 'service_request', entityId: String(ticket.id), title: 'Ticket actualizado', targetHref: '/admin/mantenimiento',
            message: `Ticket "${String(ticket.description || '').slice(0, 60)}": ${changes}.`,
            data: updated,
        };
    },
};

type CoCoParkingBooking = { reserva_id?: string; estacionamiento?: string; total_amount?: number; access_code?: string; starts_at?: string; ends_at?: string };

const createParkingBooking: AgentToolDefinition = {
    name: 'create_parking_booking',
    agentKey: 'concierge',
    risk: 'write',
    roles: EVERYONE,
    targetHref: '/estacionamientos',
    label: 'Reservar estacionamiento',
    tool: {
        name: 'create_parking_booking',
        description: 'Reserva un estacionamiento (cobra segun la tarifa del cupo). Usa spotId devuelto por get_parking_status. Administracion o conserjeria pueden reservar para un residente indicando residentId (de find_resident_or_unit); el residente debe tener vehiculo registrado. Requiere confirmacion humana.',
        input_schema: {
            type: 'object',
            properties: {
                spotId: { type: 'string' },
                startsAt: { type: 'string', description: 'ISO 8601' },
                endsAt: { type: 'string', description: 'ISO 8601' },
                residentId: { type: 'string', description: 'Opcional, solo staff: conductor de la reserva' },
            },
            required: ['spotId', 'startsAt', 'endsAt'],
            additionalProperties: false,
        },
    },
    validate(input, profile) {
        const spotId = uuid(input.spotId, 'El estacionamiento');
        const startsAt = isoDateTime(input.startsAt, 'El inicio');
        const endsAt = isoDateTime(input.endsAt, 'El fin');
        if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error('El fin debe ser posterior al inicio.');
        const residentId = input.residentId ? uuid(input.residentId, 'El residente') : '';
        if (residentId && residentId !== profile.id && !isStaff(profile)) throw new Error('Solo puedes reservar estacionamiento para ti.');
        return { spotId, startsAt, endsAt, ...(residentId && residentId !== profile.id ? { residentId } : {}) };
    },
    async execute(args, profile) {
        const communityId = communityOf(profile);
        let driverId = profile.id;
        if (args.residentId) {
            if (!isStaff(profile)) throw new Error('Solo puedes reservar estacionamiento para ti.');
            const { data: resident, error } = await getSupabaseAdmin().from('profiles').select('id, name')
                .eq('id', String(args.residentId)).eq('community_id', communityId).maybeSingle();
            if (error) throw error;
            if (!resident) throw new Error('El residente no pertenece a tu comunidad.');
            driverId = String(resident.id);
        }
        const booking = unwrapCoCo<CoCoParkingBooking>(await executeCoCoTool('book_parking', {
            spot_id: String(args.spotId),
            starts_at: String(args.startsAt),
            ends_at: String(args.endsAt),
        }, cocoContext(profile, driverId)));
        const range = formatParkingRange(String(booking.starts_at || args.startsAt), String(booking.ends_at || args.endsAt));
        return {
            entityType: 'parking_booking', entityId: booking.reserva_id || null, title: 'Estacionamiento reservado', targetHref: '/estacionamientos',
            message: `${booking.estacionamiento || 'Cupo'} reservado para ${range}${booking.total_amount ? ` por $${Number(booking.total_amount).toLocaleString('es-CL')}` : ''}.`,
            data: booking,
        };
    },
};

// ---------------------------------------------------------------------------
// Convenios de pago: el agente calcula una propuesta a la medida y la deja
// para aprobación humana (y del comité, si existe). Nunca se crea solo.
// ---------------------------------------------------------------------------

function optionalInstallments(value: unknown) {
    if (value === undefined || value === null || value === '') return null;
    const count = Number(value);
    if (!Number.isInteger(count) || count < 2 || count > 36) throw new Error('Un convenio tiene entre 2 y 36 cuotas.');
    return count;
}

function clp(value: number) {
    return `$${Math.round(value).toLocaleString('es-CL')}`;
}

async function buildAgreementProposal(communityId: string, unitId: string, installmentCount: number | null) {
    const statement = await getUnitStatement(communityId, unitId);
    const { data: lastExpense, error } = await getSupabaseAdmin().from('expenses').select('amount, month')
        .eq('community_id', communityId).eq('unit_id', unitId).order('month', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    const proposal: AgreementProposal = proposeAgreementPlan({
        balance: statement.balance,
        monthlyFee: lastExpense ? Number(lastExpense.amount) : null,
        today: chileTodayISO(),
        installmentCount,
    });
    return { proposal, unitLabel: statement.unitLabel, overdueAmount: statement.overdueAmount, oldestOverdueMonth: statement.oldestOverdueMonth };
}

async function openAgreementFor(communityId: string, unitId: string) {
    const agreements = await listAgreementsForUnits(communityId, [unitId]);
    return agreements.find(item => item.status === 'active' || item.status === 'pending_committee') || null;
}

const previewPaymentAgreement: AgentToolDefinition = {
    name: 'preview_payment_agreement',
    agentKey: 'finance',
    risk: 'read',
    roles: ['admin'],
    targetHref: '/admin/finanzas/convenios',
    label: 'Calcular propuesta de convenio',
    tool: {
        name: 'preview_payment_agreement',
        description: 'Calcula una propuesta de convenio de pago para una unidad con saldo pendiente: total, cuotas y primera fecha. La cuota se ajusta para que el pago mensual siga siendo llevable. No crea nada. Solo administracion.',
        input_schema: {
            type: 'object',
            properties: {
                unitId: { type: 'string', description: 'UUID de la unidad (de find_resident_or_unit o de la cobranza)' },
                installmentCount: { type: 'integer', minimum: 2, maximum: 36, description: 'Opcional: cuotas pedidas por la administracion' },
            },
            required: ['unitId'],
            additionalProperties: false,
        },
    },
    validate(input) {
        return { unitId: uuid(input.unitId, 'La unidad'), installmentCount: optionalInstallments(input.installmentCount) };
    },
    async execute(args, profile) {
        const communityId = communityOf(profile);
        const unitId = String(args.unitId);
        const existing = await openAgreementFor(communityId, unitId);
        if (existing) {
            return {
                entityType: 'payment_agreement', entityId: existing.id, title: 'La unidad ya tiene convenio', targetHref: '/admin/finanzas/convenios',
                message: `La unidad ${existing.unitLabel || ''} ya tiene un convenio ${existing.status === 'active' ? 'vigente' : 'en revision del comite'}. No corresponde proponer otro.`,
                data: { existingAgreementId: existing.id, status: existing.status },
            };
        }
        const { proposal, unitLabel, overdueAmount, oldestOverdueMonth } = await buildAgreementProposal(communityId, unitId, args.installmentCount as number | null);
        return {
            entityType: 'unit', entityId: unitId, title: 'Propuesta de convenio', targetHref: '/admin/finanzas/convenios',
            message: `Unidad ${unitLabel}: ${clp(proposal.totalAmount)} en ${proposal.installmentCount} cuotas de cerca de ${clp(proposal.installmentAmount)}, desde el ${proposal.startDate}. ${proposal.reasoning}`,
            data: { unitId, unitLabel, overdueAmount, oldestOverdueMonth, ...proposal },
        };
    },
};

const proposePaymentAgreement: AgentToolDefinition = {
    name: 'propose_payment_agreement',
    agentKey: 'finance',
    risk: 'write',
    roles: ['admin'],
    targetHref: '/admin/finanzas/convenios',
    label: 'Proponer convenio de pago',
    tool: {
        name: 'propose_payment_agreement',
        description: 'Crea un convenio de pago para una unidad con el plan de preview_payment_agreement. Si la comunidad tiene comite de finanzas, queda pendiente de su revision. Requiere confirmacion humana. Solo administracion.',
        input_schema: {
            type: 'object',
            properties: {
                unitId: { type: 'string' },
                installmentCount: { type: 'integer', minimum: 2, maximum: 36 },
                reviewerId: { type: 'string', description: 'Opcional: integrante del comite que revisa' },
                note: { type: 'string', description: 'Contexto humano del acuerdo (opcional)' },
            },
            required: ['unitId'],
            additionalProperties: false,
        },
    },
    validate(input) {
        const reviewer = text(input.reviewerId, 40);
        return {
            unitId: uuid(input.unitId, 'La unidad'),
            installmentCount: optionalInstallments(input.installmentCount),
            reviewerId: reviewer ? uuid(reviewer, 'El revisor del comite') : null,
            note: text(input.note, 300),
        };
    },
    async execute(args, profile) {
        const communityId = communityOf(profile);
        const unitId = String(args.unitId);
        if (await openAgreementFor(communityId, unitId)) throw new Error('Esa unidad ya tiene un convenio vigente o en revision.');
        // Se recalcula con el saldo de este momento: entre la propuesta y la
        // aprobacion pudo entrar un pago.
        const { proposal, unitLabel } = await buildAgreementProposal(communityId, unitId, args.installmentCount as number | null);
        const committee = await activeCommitteeMembers(communityId);
        const reviewerId = committee.length
            ? (committee.some(member => member.id === args.reviewerId) ? String(args.reviewerId) : committee[0].id)
            : undefined;
        const agreement = await createAgreement(communityId, profile.id, {
            unitId,
            title: `Convenio comunitario unidad ${unitLabel}`,
            totalAmount: proposal.totalAmount,
            installmentCount: proposal.installmentCount,
            startDate: proposal.startDate,
            notes: [proposal.reasoning, String(args.note || '')].filter(Boolean).join(' '),
            reviewerId,
        });
        await recordOperationEvent({
            communityId, actorId: profile.id, actorRole: profile.role,
            action: 'agent.payment_agreement.proposed', entityType: 'payment_agreement', entityId: agreement.id,
            severity: 'info', status: 'success',
            summary: `Convenio propuesto para la unidad ${unitLabel}: ${proposal.installmentCount} cuotas`,
            metadata: { unitId, ...proposal, reviewerId: reviewerId || null },
        });
        const pending = agreement.status === 'pending_committee';
        return {
            entityType: 'payment_agreement', entityId: agreement.id,
            title: pending ? 'Convenio enviado al comite' : 'Convenio abierto', targetHref: '/admin/finanzas/convenios',
            message: `Unidad ${unitLabel}: ${clp(proposal.totalAmount)} en ${proposal.installmentCount} cuotas desde el ${proposal.startDate}. ${pending ? 'Queda pendiente de la revision del comite.' : 'Ya esta vigente y se aviso al propietario.'}`,
            data: { agreementId: agreement.id, status: agreement.status, ...proposal },
        };
    },
};

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
    getParkingStatus,
    getSupermarketOrdersSummary,
    getActivePolls,
    getMaintenanceBacklog,
    getMaintenanceRisk,
    findResidentOrUnit,
    createPoll,
    updateMaintenanceTicket,
    createParkingBooking,
    previewPaymentAgreement,
    proposePaymentAgreement,
];

const BY_NAME = new Map<string, AgentToolDefinition>(AGENT_TOOL_DEFINITIONS.map(definition => [definition.name, definition]));

export function getAgentToolDefinition(name: string): AgentToolDefinition | null {
    return BY_NAME.get(name) || null;
}

export function isAgentToolAllowedForRole(name: string, role?: string | null): boolean {
    const definition = BY_NAME.get(name);
    return Boolean(definition && role && definition.roles.includes(role as UserRole));
}

/**
 * Punto unico de ejecucion. Revalida rol, comunidad y argumentos aunque el
 * llamador ya lo haya hecho: la confirmacion humana puede llegar por otra ruta.
 */
export async function executeAgentTool(name: string, rawArgs: Record<string, unknown>, profile: AgentProfile): Promise<AgentExecutionResult> {
    const definition = BY_NAME.get(name);
    if (!definition) throw new Error('Herramienta no soportada.');
    if (!isAgentToolAllowedForRole(name, profile.role)) throw new Error('Tu rol no permite usar esta herramienta.');
    communityOf(profile);
    const args = definition.validate(rawArgs || {}, profile);
    return definition.execute(args, profile);
}

export function validateAgentToolArgs(name: string, rawArgs: Record<string, unknown>, profile: AgentProfile) {
    const definition = BY_NAME.get(name);
    if (!definition) throw new Error('Herramienta no soportada.');
    return definition.validate(rawArgs || {}, profile);
}
