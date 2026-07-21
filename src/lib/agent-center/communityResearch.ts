import Anthropic from '@anthropic-ai/sdk';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromMessages, estimateTokensFromText, recordAiUsage } from '@/lib/ai/budget';
import type { AgentProfile } from '@/lib/agent-center/domain';
import { normalizeIntentText } from '@/lib/agent-center/intentSafety';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const MAX_ROUNDS = 4;

type ResearchTrace = { source: string; args: Record<string, unknown>; records: number };

const READ_TOOLS: Anthropic.Tool[] = [
    {
        name: 'find_residents',
        description: 'Busca residentes por nombre, correo o numero de departamento.',
        input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    },
    {
        name: 'read_units',
        description: 'Consulta unidades/departamentos, torre, piso y vinculacion de residentes/propietarios.',
        input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: [], additionalProperties: false },
    },
    {
        name: 'read_expenses',
        description: 'Consulta gastos comunes pendientes o pagados. Puede filtrar por unidad.',
        input_schema: {
            type: 'object',
            properties: {
                unitNumber: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'overdue', 'paid', 'all'] },
            },
            required: ['status'],
            additionalProperties: false,
        },
    },
    {
        name: 'read_service_requests',
        description: 'Consulta solicitudes y tickets de servicio de la comunidad.',
        input_schema: {
            type: 'object',
            properties: { query: { type: 'string' }, status: { type: 'string' } },
            required: [],
            additionalProperties: false,
        },
    },
    {
        name: 'read_bookings',
        description: 'Consulta reservas de espacios comunes por fecha o nombre del espacio.',
        input_schema: {
            type: 'object',
            properties: { dateFrom: { type: 'string' }, dateTo: { type: 'string' }, amenity: { type: 'string' } },
            required: [],
            additionalProperties: false,
        },
    },
    {
        name: 'read_announcements',
        description: 'Consulta comunicados oficiales recientes por texto.',
        input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: [], additionalProperties: false },
    },
    {
        name: 'read_amenities',
        description: 'Consulta espacios comunes configurados y su estado activo.',
        input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: [], additionalProperties: false },
    },
    {
        name: 'read_visitors',
        description: 'Consulta bitacora de visitas por fecha, nombre, motivo o unidad.',
        input_schema: { type: 'object', properties: { query: { type: 'string' }, dateFrom: { type: 'string' }, dateTo: { type: 'string' } }, required: [], additionalProperties: false },
    },
    {
        name: 'read_packages',
        description: 'Consulta encomiendas y paquetes por estado, descripcion o unidad destinataria.',
        input_schema: { type: 'object', properties: { query: { type: 'string' }, status: { type: 'string', enum: ['pending', 'picked-up', 'all'] } }, required: [], additionalProperties: false },
    },
    {
        name: 'read_marketplace_items',
        description: 'Consulta publicaciones del marketplace vecinal por texto, categoria o estado.',
        input_schema: { type: 'object', properties: { query: { type: 'string' }, status: { type: 'string' }, category: { type: 'string' } }, required: [], additionalProperties: false },
    },
    {
        name: 'read_polls',
        description: 'Consulta votaciones comunitarias, opciones y votos acumulados.',
        input_schema: { type: 'object', properties: { query: { type: 'string' }, status: { type: 'string', enum: ['active', 'closed', 'all'] } }, required: [], additionalProperties: false },
    },
    {
        name: 'read_operation_events',
        description: 'Consulta la bitacora operativa auditada del condominio por accion, estado, severidad o texto.',
        input_schema: { type: 'object', properties: { query: { type: 'string' }, action: { type: 'string' }, status: { type: 'string' }, severity: { type: 'string' } }, required: [], additionalProperties: false },
    },
    {
        name: 'read_coco_cases',
        description: 'Consulta casos CoCo y solicitudes operacionales clasificadas por urgencia, categoria o estado.',
        input_schema: { type: 'object', properties: { query: { type: 'string' }, status: { type: 'string' }, urgency: { type: 'string' }, category: { type: 'string' } }, required: [], additionalProperties: false },
    },
    {
        name: 'search_uploaded_documents',
        description: 'Busca en documentos privados cargados por administracion: actas, reglamentos, contratos, nominas, comunicados y antecedentes operacionales.',
        input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    },
];
function clean(value: unknown, max = 100) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function contains(candidate: unknown, query: string) {
    return normalizeIntentText(String(candidate || '')).includes(normalizeIntentText(query));
}

async function runReadTool(name: string, rawInput: unknown, profile: AgentProfile) {
    const input = asRecord(rawInput);
    const communityId = profile.community_id;
    if (!communityId) throw new Error('El administrador no tiene una comunidad asignada.');
    const admin = getSupabaseAdmin();

    if (name === 'find_residents') {
        const query = clean(input.query);
        const { data, error } = await admin.from('profiles')
            .select('id, name, full_name, email, unit_id, department_number')
            .eq('community_id', communityId).eq('role', 'resident').limit(500);
        if (error) throw error;
        return (data || []).filter(row => [row.name, row.full_name, row.email, row.department_number].some(value => contains(value, query))).slice(0, 20);
    }

    if (name === 'read_units') {
        const { data, error } = await admin.from('units')
            .select('id, tower, number, floor, type, resident_profile_id, owner_id, created_at')
            .eq('community_id', communityId).order('tower', { ascending: true }).order('number', { ascending: true }).limit(500);
        if (error) throw error;
        const text = clean(input.query, 80);
        return (data || [])
            .filter(row => !text || [row.tower, row.number, row.type].some(value => contains(value, text)))
            .map(row => ({ tower: row.tower, number: row.number, floor: row.floor, type: row.type, hasResident: Boolean(row.resident_profile_id), hasOwner: Boolean(row.owner_id), createdAt: row.created_at }));
    }
    if (name === 'read_expenses') {
        const unitNumber = clean(input.unitNumber, 30);
        let unitIds: string[] = [];
        if (unitNumber) {
            const { data: units, error: unitError } = await admin.from('units')
                .select('id, number, unit_number').eq('community_id', communityId).limit(500);
            if (unitError) throw unitError;
            unitIds = (units || []).filter(unit => [unit.number, unit.unit_number].some(value => normalizeIntentText(String(value || '')) === normalizeIntentText(unitNumber))).map(unit => String(unit.id));
            if (unitIds.length === 0) return [];
        }
        let query = admin.from('expenses').select('id, unit_id, month, amount, status, due_date').eq('community_id', communityId).limit(500);
        const status = clean(input.status, 20) || 'all';
        if (status !== 'all') query = query.eq('status', status);
        if (unitIds.length) query = query.in('unit_id', unitIds);
        const { data, error } = await query.order('due_date', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    if (name === 'read_service_requests') {
        const { data, error } = await admin.from('service_requests')
            .select('id, description, status, preferred_date, preferred_time, created_at')
            .eq('community_id', communityId).order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        const text = clean(input.query, 120);
        const status = clean(input.status, 30);
        return (data || []).filter(row => (!text || contains(row.description, text)) && (!status || row.status === status)).slice(0, 100);
    }

    if (name === 'read_bookings') {
        const { data: amenities, error: amenityError } = await admin.from('amenities').select('id, name').eq('community_id', communityId).limit(100);
        if (amenityError) throw amenityError;
        const amenityText = clean(input.amenity, 80);
        const amenityIds = (amenities || []).filter(item => !amenityText || contains(item.name, amenityText)).map(item => String(item.id));
        let query = admin.from('bookings').select('id, amenity_id, date, start_time, end_time, status, user_id').eq('community_id', communityId).limit(300);
        const dateFrom = clean(input.dateFrom, 10);
        const dateTo = clean(input.dateTo, 10);
        if (dateFrom) query = query.gte('date', dateFrom);
        if (dateTo) query = query.lte('date', dateTo);
        if (amenityText) {
            if (!amenityIds.length) return [];
            query = query.in('amenity_id', amenityIds);
        }
        const { data, error } = await query.order('date', { ascending: true });
        if (error) throw error;
        const names = new Map((amenities || []).map(item => [String(item.id), item.name]));
        return (data || []).map(row => ({ ...row, amenity: names.get(String(row.amenity_id)) || 'Espacio comun' }));
    }

    if (name === 'read_announcements') {
        const { data, error } = await admin.from('announcements').select('id, title, content, priority, created_at')
            .eq('community_id', communityId).order('created_at', { ascending: false }).limit(80);
        if (error) throw error;
        const text = clean(input.query, 120);
        return (data || []).filter(row => !text || contains(`${row.title} ${row.content}`, text)).slice(0, 40);
    }

    if (name === 'read_amenities') {
        const { data, error } = await admin.from('amenities').select('id, name, is_active').eq('community_id', communityId).limit(100);
        if (error) throw error;
        const text = clean(input.query, 80);
        return (data || []).filter(row => !text || contains(row.name, text));
    }


    if (name === 'read_visitors') {
        let query = admin.from('visitor_logs').select('id, visitor_name, unit_id, entry_time, exit_time, purpose, created_at')
            .eq('community_id', communityId).order('entry_time', { ascending: false }).limit(200);
        const dateFrom = clean(input.dateFrom, 10);
        const dateTo = clean(input.dateTo, 10);
        if (dateFrom) query = query.gte('entry_time', dateFrom);
        if (dateTo) query = query.lte('entry_time', `${dateTo}T23:59:59`);
        const { data, error } = await query;
        if (error) throw error;
        const unitIds = Array.from(new Set((data || []).map(row => String(row.unit_id || '')).filter(Boolean)));
        const { data: units } = unitIds.length ? await admin.from('units').select('id, tower, number').in('id', unitIds) : { data: [] };
        const unitLabels = new Map((units || []).map(unit => [String(unit.id), `${unit.tower || ''}${unit.tower ? '-' : ''}${unit.number || ''}`]));
        const text = clean(input.query, 120);
        return (data || [])
            .map(row => ({ visitorName: row.visitor_name, unit: unitLabels.get(String(row.unit_id)) || null, entryTime: row.entry_time, exitTime: row.exit_time, purpose: row.purpose, createdAt: row.created_at }))
            .filter(row => !text || [row.visitorName, row.unit, row.purpose].some(value => contains(value, text)));
    }

    if (name === 'read_packages') {
        let query = admin.from('packages').select('id, recipient_unit_id, description, received_at, picked_up_at, status, created_at')
            .eq('community_id', communityId).order('received_at', { ascending: false }).limit(200);
        const status = clean(input.status, 30) || 'all';
        if (status !== 'all') query = query.eq('status', status);
        const { data, error } = await query;
        if (error) throw error;
        const unitIds = Array.from(new Set((data || []).map(row => String(row.recipient_unit_id || '')).filter(Boolean)));
        const { data: units } = unitIds.length ? await admin.from('units').select('id, tower, number').in('id', unitIds) : { data: [] };
        const unitLabels = new Map((units || []).map(unit => [String(unit.id), `${unit.tower || ''}${unit.tower ? '-' : ''}${unit.number || ''}`]));
        const text = clean(input.query, 120);
        return (data || [])
            .map(row => ({ description: row.description, unit: unitLabels.get(String(row.recipient_unit_id)) || null, status: row.status, receivedAt: row.received_at, pickedUpAt: row.picked_up_at, createdAt: row.created_at }))
            .filter(row => !text || [row.description, row.unit, row.status].some(value => contains(value, text)));
    }

    if (name === 'read_marketplace_items') {
        let query = admin.from('marketplace_items')
            .select('id, title, description, price, category, status, allow_sale, allow_swap, allow_barter, payment_status, created_at')
            .eq('community_id', communityId).order('created_at', { ascending: false }).limit(120);
        const status = clean(input.status, 30);
        const category = clean(input.category, 40);
        if (status) query = query.eq('status', status);
        if (category) query = query.eq('category', category);
        const { data, error } = await query;
        if (error) throw error;
        const text = clean(input.query, 120);
        return (data || []).filter(row => !text || contains(`${row.title} ${row.description} ${row.category} ${row.status}`, text));
    }

    if (name === 'read_polls') {
        let query = admin.from('polls')
            .select('id, title, description, status, category, end_date, created_at, options:poll_options(id, text, votes, display_order)')
            .eq('community_id', communityId).order('created_at', { ascending: false }).limit(80);
        const status = clean(input.status, 20) || 'all';
        if (status !== 'all') query = query.eq('status', status);
        const { data, error } = await query;
        if (error) throw error;
        const text = clean(input.query, 120);
        return (data || []).filter(row => !text || contains(`${row.title} ${row.description} ${row.category} ${row.status}`, text));
    }

    if (name === 'read_operation_events') {
        let query = admin.from('operation_events')
            .select('id, action, entity_type, severity, status, summary, created_at')
            .eq('community_id', communityId).order('created_at', { ascending: false }).limit(200);
        const action = clean(input.action, 80);
        const status = clean(input.status, 30);
        const severity = clean(input.severity, 20);
        if (action) query = query.eq('action', action);
        if (status) query = query.eq('status', status);
        if (severity) query = query.eq('severity', severity);
        const { data, error } = await query;
        if (error) throw error;
        const text = clean(input.query, 120);
        return (data || []).filter(row => !text || contains(`${row.action} ${row.entity_type} ${row.severity} ${row.status} ${row.summary}`, text));
    }

    if (name === 'read_coco_cases') {
        let query = admin.from('coco_cases')
            .select('id, title, type, category, urgency, action, status, reason, unit_label, created_at')
            .eq('community_id', communityId).order('created_at', { ascending: false }).limit(200);
        const status = clean(input.status, 30);
        const urgency = clean(input.urgency, 30);
        const category = clean(input.category, 40);
        if (status) query = query.eq('status', status);
        if (urgency) query = query.eq('urgency', urgency);
        if (category) query = query.eq('category', category);
        const { data, error } = await query;
        if (error) throw error;
        const text = clean(input.query, 120);
        return (data || []).filter(row => !text || contains(`${row.title} ${row.type} ${row.category} ${row.urgency} ${row.status} ${row.reason} ${row.unit_label}`, text));
    }
    if (name === 'search_uploaded_documents') {
        const search = clean(input.query, 160);
        if (!search) throw new Error('Indica que informacion deseas buscar en los documentos.');
        const { data, error } = await admin.from('onboarding_import_documents')
            .select('id, file_name, document_kind, summary, search_text, created_at')
            .eq('community_id', communityId).eq('status', 'extracted')
            .textSearch('search_vector', search, { config: 'simple', type: 'websearch' })
            .order('created_at', { ascending: false }).limit(12);
        if (error) throw error;
        return (data || []).map(document => ({
            fileName: document.file_name,
            documentKind: document.document_kind,
            summary: document.summary,
            excerpt: String(document.search_text || '').slice(0, 6000),
            uploadedAt: document.created_at,
        }));
    }

    throw new Error('Fuente de lectura no soportada.');
}

export async function researchCommunityQuestion(question: string, profile: AgentProfile) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('El motor de investigacion no esta configurado.');
    const system = `Eres un analista operacional de condominios. Responde la pregunta usando exclusivamente las herramientas de lectura disponibles y los datos que devuelvan. Cuando la respuesta pueda estar en actas, contratos, reglamentos, nominas u otros archivos administrativos, busca tambien en los documentos privados cargados. Puede consultar residentes, unidades, finanzas, tickets, reservas, comunicados, amenities, visitas, encomiendas, marketplace, votaciones, bitacora operativa y casos CoCo segun haga falta.
Reglas: consulta al menos una fuente; puedes cruzar varias; nunca inventes datos; distingue cero resultados de fuente no disponible; no propongas ni ejecutes escrituras; responde en español claro con cifras y fechas; cita los nombres de los archivos utilizados; no expongas IDs internos ni cadena de pensamiento.`;
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];
    const trace: ResearchTrace[] = [];
    const estimatedPromptTokens = estimateTokensFromText(`${system}\n${question}`);
    await enforceAiBudget({
        communityId: profile.community_id, userId: profile.id, role: profile.role,
        module: 'agent-center.research', provider: 'anthropic', model: MODEL, actionType: 'other',
        estimatedPromptTokens, estimatedCompletionTokens: 1800,
    });
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const startedAt = Date.now();
    let totalInput = 0;
    let totalOutput = 0;

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const response = await anthropic.messages.create({ model: MODEL, max_tokens: 1600, temperature: 0, system, messages, tools: READ_TOOLS });
        totalInput += response.usage?.input_tokens || 0;
        totalOutput += response.usage?.output_tokens || 0;
        const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
        if (!toolUses.length) {
            const answer = response.content.filter((block): block is Anthropic.TextBlock => block.type === 'text').map(block => block.text).join('\n').trim();
            await recordAiUsage({
                communityId: profile.community_id, userId: profile.id, role: profile.role,
                module: 'agent-center.research', provider: 'anthropic', model: MODEL, actionType: 'other',
                promptTokens: totalInput || estimatedPromptTokens,
                completionTokens: totalOutput || estimateTokensFromMessages(response.content),
                totalTokens: (totalInput || estimatedPromptTokens) + (totalOutput || estimateTokensFromMessages(response.content)),
                estimatedCostCents: estimateAiCostCents({ provider: 'anthropic', model: MODEL, promptTokens: totalInput, completionTokens: totalOutput }),
                status: 'success', metadata: { latencyMs: Date.now() - startedAt, rounds: round + 1, sources: trace.map(item => item.source) },
            });
            return { answer: answer || 'No pude formular una respuesta con los datos disponibles.', trace };
        }

        messages.push({ role: 'assistant', content: response.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUses) {
            try {
                const data = await runReadTool(toolUse.name, toolUse.input, profile);
                const records = Array.isArray(data) ? data.length : 1;
                trace.push({ source: toolUse.name, args: asRecord(toolUse.input), records });
                results.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(data).slice(0, 40_000) });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'No se pudo consultar la fuente.';
                trace.push({ source: toolUse.name, args: asRecord(toolUse.input), records: 0 });
                results.push({ type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: message });
            }
        }
        messages.push({ role: 'user', content: results });
    }

    throw new Error('La investigacion alcanzo el limite seguro de pasos. Reformula la pregunta con mas precision.');
}
