import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceRateLimit } from '@/lib/security/rateLimit';

type AgentKey = 'finance' | 'maintenance' | 'concierge' | 'community';
type ToolName =
    | 'get_amenities'
    | 'create_booking'
    | 'create_marketplace_item'
    | 'create_announcement'
    | 'create_service_request'
    | 'register_visitor'
    | 'get_my_expenses';

type AgentProfile = {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
    unit_id?: string | null;
    community_id?: string | null;
};

type AgentAction = {
    agentKey: AgentKey;
    toolName: ToolName;
    args: Record<string, unknown>;
    requiresConfirmation: boolean;
    title: string;
    summary: string;
    targetHref: string;
};

type AgentStep = {
    kind: 'reasoning' | 'tool' | 'confirmation' | 'result' | 'warning';
    title: string;
    detail: string;
    metadata?: Record<string, unknown>;
};

const DEFAULT_COMMUNITY_ID = '00000000-0000-0000-0000-000000000000';

async function getSupabaseUserClient() {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: () => {},
            },
        }
    );
}

function cleanText(value: unknown, max = 500) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
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

function inferAction(message: string): AgentAction {
    const lower = message.toLowerCase();
    const agentKey = pickAgent(message);
    const date = dateFromText(message);
    const { start, end } = timeFromText(message);

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

async function getProfile(userId: string): Promise<AgentProfile | null> {
    const { data } = await getSupabaseAdmin()
        .from('profiles')
        .select('id, name, email, role, unit_id, community_id')
        .eq('id', userId)
        .maybeSingle();
    return (data as AgentProfile | null) || null;
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

async function logActivity(profile: AgentProfile, action: AgentAction, status: 'preview' | 'executed' | 'failed', result?: Record<string, unknown>) {
    const communityId = profile.community_id || DEFAULT_COMMUNITY_ID;
    const runId = await bestEffortInsert('agent_runs', {
        user_id: profile.id,
        community_id: communityId,
        agent_key: action.agentKey,
        intent: action.toolName,
        user_message: action.summary,
        status: status === 'preview' ? 'awaiting_confirmation' : status,
        summary: action.title,
        metadata: { targetHref: action.targetHref },
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
        status: status === 'executed' ? 'executed' : 'proposed',
        executed_at: status === 'executed' ? new Date().toISOString() : null,
    });

    await bestEffortInsert('agent_activity_log', {
        community_id: communityId,
        user_id: profile.id,
        agent_key: action.agentKey,
        action: action.toolName,
        entity_type: result?.entityType,
        entity_id: result?.entityId,
        severity: status === 'failed' ? 'error' : status === 'executed' ? 'success' : 'info',
        summary: status === 'executed' ? `Ejecutado: ${action.title}` : action.title,
        metadata: { runId, toolCallId, ...result },
    });

    return { runId, toolCallId };
}

async function executeAction(action: AgentAction, profile: AgentProfile) {
    const admin = getSupabaseAdmin();
    const communityId = profile.community_id || DEFAULT_COMMUNITY_ID;

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
        let { data: amenities, error: amenitiesError } = await amenitiesQuery;
        if ((!amenities || amenities.length === 0) && communityId !== DEFAULT_COMMUNITY_ID) {
            const fallback = await admin.from('amenities').select('id, name').eq('is_active', true).ilike('name', `%${hint || ''}%`).limit(10);
            amenities = fallback.data;
            amenitiesError = fallback.error;
        }
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

    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const profile = await getProfile(user.id);
    if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });

    const { data } = await getSupabaseAdmin()
        .from('agent_activity_log')
        .select('id, agent_key, action, severity, summary, created_at, metadata')
        .eq('community_id', profile.community_id || DEFAULT_COMMUNITY_ID)
        .order('created_at', { ascending: false })
        .limit(12);

    return NextResponse.json({ activity: data || [] });
}

export async function POST(req: NextRequest) {
    const limited = enforceRateLimit(req, 'agent_center.execute', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const supabaseUser = await getSupabaseUserClient();
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const profile = await getProfile(user.id);
        if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });

        const body = await req.json();
        const message = cleanText(body.message, 1200);
        const incomingAction = body.action && typeof body.action === 'object' ? body.action as AgentAction : null;
        const action = incomingAction || inferAction(message);
        const confirmed = Boolean(body.confirmed);

        const steps: AgentStep[] = [
            {
                kind: 'reasoning',
                title: 'Intencion detectada',
                detail: `${action.agentKey} agent preparo la accion "${action.toolName}".`,
            },
            {
                kind: 'tool',
                title: `Herramienta: ${action.toolName}`,
                detail: JSON.stringify(action.args),
                metadata: action.args,
            },
        ];

        if (action.requiresConfirmation && !confirmed) {
            await logActivity(profile, action, 'preview');
            steps.push({
                kind: 'confirmation',
                title: 'Confirmacion requerida',
                detail: action.summary,
            });
            return NextResponse.json({
                status: 'awaiting_confirmation',
                reply: 'Tengo la accion lista. Revisa la tarjeta y confirma para ejecutarla con trazabilidad.',
                action,
                steps,
            });
        }

        const result = await executeAction(action, profile);
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
