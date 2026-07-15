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

    throw new Error('Fuente de lectura no soportada.');
}

export async function researchCommunityQuestion(question: string, profile: AgentProfile) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('El motor de investigacion no esta configurado.');
    const system = `Eres un analista operacional de condominios. Responde la pregunta usando exclusivamente las herramientas de lectura disponibles y los datos que devuelvan.
Reglas: consulta al menos una fuente; puedes cruzar varias; nunca inventes datos; distingue cero resultados de fuente no disponible; no propongas ni ejecutes escrituras; responde en español claro con cifras y fechas; menciona brevemente las fuentes consultadas, sin exponer IDs internos ni cadena de pensamiento.`;
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
