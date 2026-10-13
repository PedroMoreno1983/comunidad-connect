/**
 * actionExecutor.ts — Ejecuta una AgentAction ya validada (y, si es escritura,
 * ya confirmada por una persona).
 *
 * Vivia dentro de `app/api/agent-center/route.ts`. Se movio a lib sin cambios de
 * comportamiento porque ahora la necesitan tres llamadores: la ruta (tarjetas de
 * aprobacion), las misiones y el ciclo agentico (`agentLoop.ts`), que ejecuta
 * lecturas por su cuenta y reanuda tareas desde `tasks/[id]/resume`.
 */
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { validateAgentActionArgs } from '@/lib/agent-center/actionValidation';
import { getResidentExpenseSummary } from '@/lib/agent-center/financeQueries';
import { executeCreateUnitExpense, executeSendUnitPaymentReminder } from '@/lib/agent-center/unitFinanceActions';
import { runAgentPlaybook } from '@/lib/agent-center/taskPlaybooks';
import { resumeCoCoAction } from '@/lib/agent-center/conversationalFallback';
import { executeAgentMission, type AgentExecutionResult } from '@/lib/agent-center/orchestrator';
import { researchCommunityQuestion } from '@/lib/agent-center/communityResearch';
import { chileTodayISO } from '@/lib/agent-center/chileDate';
import { executeAgentTool, getAgentToolDefinition } from '@/lib/agent-center/agentTools';
import { DEFAULT_COMMUNITY_ID, type AgentAction, type AgentProfile } from '@/lib/agent-center/domain';

function cleanText(value: unknown, max = 500) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
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


export async function executeAgentAction(action: AgentAction, profile: AgentProfile): Promise<AgentExecutionResult> {
    const admin = getSupabaseAdmin();
    const communityId = profile.community_id || DEFAULT_COMMUNITY_ID;
    action = { ...action, args: validateAgentActionArgs(action) };

    if (action.toolName === 'clarify_intent') {
        return {
            entityType: 'agent_clarification',
            entityId: null,
            title: 'Necesito mas detalle',
            message: action.summary || 'Necesito que aclares la consulta. No realice ningun cambio.',
        };
    }

    if (action.toolName === 'run_playbook') {
        return runAgentPlaybook(action, profile);
    }

    if (action.toolName === 'get_my_expenses') {
        const unit = await getUserUnit(profile);
        if (!unit?.id) throw new Error('No encontre una unidad asociada a tu perfil.');
        const { data, error } = await admin
            .from('expenses')
            .select('id, month, amount, status, due_date')
            .eq('unit_id', String(unit.id))
            .eq('community_id', communityId)
            .order('due_date', { ascending: false })
            .limit(6);
        if (error) throw error;
        const rows = (data || []) as Array<{ amount?: number | string | null; status?: string | null }>;
        const pending = rows.filter(row => row.status !== 'paid');
        const amount = pending.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        return {
            entityType: 'expenses',
            entityId: null,
            title: 'Gastos revisados',
            message: `Hay ${pending.length} gasto(s) no pagado(s) por $${amount.toLocaleString('es-CL')}.`,
            data: rows,
        };
    }

    if (action.toolName === 'get_resident_expenses') {
        return getResidentExpenseSummary(profile, action.args.residentQuery, action.args.unitNumber);
    }

    if (action.toolName === 'create_unit_expense') {
        return executeCreateUnitExpense(action, profile, communityId);
    }

    if (action.toolName === 'send_unit_payment_reminder') {
        return executeSendUnitPaymentReminder(action, profile, communityId);
    }
    if (action.toolName === 'get_community_snapshot') {
        const today = chileTodayISO();
        const [expenseQuery, serviceQuery, bookingQuery, residentQuery] = await Promise.all([
            admin.from('expenses').select('unit_id, amount, status').eq('community_id', communityId).in('status', ['pending', 'overdue']).limit(2000),
            admin.from('service_requests').select('id, status').eq('community_id', communityId).in('status', ['pending', 'in_progress']).limit(1000),
            admin.from('bookings').select('id, status').eq('community_id', communityId).gte('date', today).in('status', ['pending', 'confirmed']).limit(1000),
            admin.from('profiles').select('id', { count: 'exact', head: true }).eq('community_id', communityId).eq('role', 'resident'),
        ]);
        if (expenseQuery.error) throw expenseQuery.error;
        if (serviceQuery.error) throw serviceQuery.error;
        if (bookingQuery.error) throw bookingQuery.error;
        if (residentQuery.error) throw residentQuery.error;

        const expenses = expenseQuery.data || [];
        const pendingAmount = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const metrics = {
            delinquentUnits: new Set(expenses.map(row => row.unit_id).filter(Boolean)).size,
            pendingExpenses: expenses.length,
            pendingAmount,
            openServiceRequests: (serviceQuery.data || []).length,
            upcomingBookings: (bookingQuery.data || []).length,
            residents: residentQuery.count || 0,
        };
        const focus = String(action.args.focus || 'all');
        const message = focus === 'finance'
            ? `Hay ${metrics.delinquentUnits} unidad(es) con deuda, ${metrics.pendingExpenses} gasto(s) pendiente(s) por $${pendingAmount.toLocaleString('es-CL')}.`
            : focus === 'maintenance'
                ? `Hay ${metrics.openServiceRequests} solicitud(es) de servicio abierta(s).`
                : focus === 'community'
                    ? `La comunidad tiene ${metrics.residents} residente(s) y ${metrics.upcomingBookings} reserva(s) proximas.`
                    : `Resumen: ${metrics.residents} residentes, ${metrics.delinquentUnits} unidades con deuda por $${pendingAmount.toLocaleString('es-CL')}, ${metrics.openServiceRequests} solicitudes abiertas y ${metrics.upcomingBookings} reservas proximas.`;
        return { entityType: 'community_snapshot', entityId: communityId, title: 'Estado del edificio revisado', message, data: metrics };
    }

    if (action.toolName === 'answer_community_question') {
        const research = await researchCommunityQuestion(String(action.args.question || ''), profile);
        return {
            entityType: 'community_research',
            entityId: communityId,
            title: 'Investigacion completada',
            message: research.answer,
            data: { sources: research.trace },
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
        const { data: conflict, error: conflictError } = await admin
            .from('bookings')
            .select('id')
            .eq('amenity_id', amenity.id)
            .eq('date', String(action.args.date))
            .in('status', ['pending', 'confirmed'])
            .lt('start_time', String(action.args.endTime))
            .gt('end_time', String(action.args.startTime))
            .limit(1)
            .maybeSingle();
        if (conflictError) throw conflictError;
        if (conflict) throw new Error('El espacio ya tiene una reserva que se cruza con ese horario.');
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
        const { data: provider, error: providerError } = await admin
            .from('service_providers')
            .select('id, name')
            .eq('community_id', communityId)
            .eq('verified', true)
            .eq('name', 'Mesa de ayuda interna')
            .limit(1)
            .maybeSingle();
        if (providerError) throw providerError;
        if (!provider) throw new Error('No hay una mesa de ayuda interna verificada. Configurala antes de crear tickets desde Agent Center.');

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

    if (action.toolName === 'run_mission') {
        return executeAgentMission(action, profile, executeAgentAction);
    }

    if (action.toolName === 'coco_action') {
        // Puente al cerebro de CoCo: reanuda su sesion con la confirmacion humana
        // y CoCo ejecuta la accion con sus propias tools y guardas.
        return resumeCoCoAction(action, profile);
    }

    // Herramientas del ciclo agentico (estacionamientos, super, votaciones,
    // mantencion, directorio): agentTools revalida rol, comunidad y argumentos.
    if (getAgentToolDefinition(action.toolName)) {
        return executeAgentTool(action.toolName, action.args, profile);
    }

    throw new Error('Herramienta no soportada.');
}

