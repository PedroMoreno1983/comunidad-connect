import { normalizeIntentText } from '@/lib/agent-center/intentSafety';
import type { AgentProfile } from '@/lib/agent-center/domain';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

function cleanQuery(value: unknown, max = 100) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function getResidentExpenseSummary(profile: AgentProfile, rawResidentQuery: unknown) {
    if (profile.role !== 'admin') {
        throw new Error('Solo administracion puede consultar la deuda de otro residente.');
    }
    if (!profile.community_id) {
        throw new Error('El administrador no tiene una comunidad asignada.');
    }

    const residentQuery = cleanQuery(rawResidentQuery);
    const normalizedQuery = normalizeIntentText(residentQuery);
    const queryTokens = normalizedQuery.split(' ').filter(token => token.length > 1);
    if (queryTokens.length === 0) {
        throw new Error('Indica el nombre del residente que deseas consultar.');
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('profiles')
        .select('id, name, full_name, email, unit_id, department_number, community_id')
        .eq('community_id', profile.community_id)
        .eq('role', 'resident')
        .limit(500);
    if (error) throw error;

    const residents = (data || []) as Array<Record<string, unknown>>;
    const matches = residents.filter(resident => {
        const candidate = normalizeIntentText(String(resident.full_name || resident.name || resident.email || ''));
        return candidate === normalizedQuery || queryTokens.every(token => candidate.includes(token));
    });

    if (matches.length === 0) {
        throw new Error(`No encontre un residente llamado "${residentQuery}" en esta comunidad.`);
    }
    if (matches.length > 1) {
        const labels = matches.slice(0, 4).map(resident => {
            const name = String(resident.full_name || resident.name || resident.email || 'Residente');
            const unit = resident.department_number ? ` Depto ${resident.department_number}` : '';
            return `${name}${unit}`;
        });
        throw new Error(`Encontre mas de un residente. Precisa uno: ${labels.join(', ')}.`);
    }

    const resident = matches[0];
    let unitId = typeof resident.unit_id === 'string' ? resident.unit_id : '';
    let unitNumber = typeof resident.department_number === 'string' ? resident.department_number : '';

    if (!unitId) {
        const { data: unit, error: unitError } = await admin
            .from('units')
            .select('id, number, unit_number')
            .eq('community_id', profile.community_id)
            .or(`resident_profile_id.eq.${resident.id},owner_id.eq.${resident.id}`)
            .limit(1)
            .maybeSingle();
        if (unitError) throw unitError;
        unitId = typeof unit?.id === 'string' ? unit.id : '';
        unitNumber = String(unit?.number || unit?.unit_number || unitNumber || '');
    } else if (!unitNumber) {
        const { data: unit, error: unitError } = await admin
            .from('units')
            .select('number, unit_number')
            .eq('id', unitId)
            .eq('community_id', profile.community_id)
            .maybeSingle();
        if (unitError) throw unitError;
        unitNumber = String(unit?.number || unit?.unit_number || '');
    }

    const residentName = String(resident.full_name || resident.name || resident.email || 'Residente');
    if (!unitId) {
        throw new Error(`El perfil de ${residentName} no tiene una unidad asociada.`);
    }

    const { data: expenses, error: expensesError } = await admin
        .from('expenses')
        .select('id, month, amount, status, due_date')
        .eq('unit_id', unitId)
        .eq('community_id', profile.community_id)
        .in('status', ['pending', 'overdue'])
        .order('due_date', { ascending: false });
    if (expensesError) throw expensesError;

    const rows = (expenses || []) as Array<Record<string, unknown>>;
    const amount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const unitLabel = unitNumber ? ` (Depto ${unitNumber})` : '';
    const message = rows.length === 0
        ? `${residentName}${unitLabel} no mantiene gastos comunes pendientes.`
        : `${residentName}${unitLabel} mantiene ${rows.length} gasto(s) pendiente(s) por $${amount.toLocaleString('es-CL')}.`;

    return {
        entityType: 'resident_expenses',
        entityId: String(resident.id),
        title: 'Deuda de residente revisada',
        message,
        data: {
            residentId: String(resident.id),
            residentName,
            unitId,
            unitNumber,
            pendingCount: rows.length,
            pendingAmount: amount,
            expenses: rows,
        },
    };
}
