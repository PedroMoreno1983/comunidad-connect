import { normalizeIntentText } from '@/lib/agent-center/intentSafety';
import type { AgentProfile } from '@/lib/agent-center/domain';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

function cleanQuery(value: unknown, max = 100) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function getResidentExpenseSummary(profile: AgentProfile, rawResidentQuery: unknown, rawUnitNumber?: unknown) {
    if (profile.role !== 'admin') {
        throw new Error('Solo administracion puede consultar la deuda de otro residente.');
    }
    if (!profile.community_id) {
        throw new Error('El administrador no tiene una comunidad asignada.');
    }

    const residentQuery = cleanQuery(rawResidentQuery);
    const requestedUnitNumber = cleanQuery(rawUnitNumber, 30);
    const normalizedQuery = normalizeIntentText(residentQuery);
    const queryTokens = normalizedQuery.split(' ').filter(token => token.length > 1);
    if (queryTokens.length === 0 && !requestedUnitNumber) {
        throw new Error('Indica el nombre del residente o el numero de departamento que deseas consultar.');
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
    const normalizedUnitNumber = normalizeIntentText(requestedUnitNumber);
    const matches = residents.filter(resident => requestedUnitNumber
        ? normalizeIntentText(String(resident.department_number || '')) === normalizedUnitNumber
        : (() => {
            const candidate = normalizeIntentText(String(resident.full_name || resident.name || resident.email || ''));
            return candidate === normalizedQuery || queryTokens.every(token => candidate.includes(token));
        })());

    if (matches.length === 0 && !requestedUnitNumber) {
        throw new Error(`No encontre un residente llamado "${residentQuery}" en esta comunidad.`);
    }
    if (matches.length > 1 && !requestedUnitNumber) {
        const labels = matches.slice(0, 4).map(resident => {
            const name = String(resident.full_name || resident.name || resident.email || 'Residente');
            const unit = resident.department_number ? ` Depto ${resident.department_number}` : '';
            return `${name}${unit}`;
        });
        throw new Error(`Encontre mas de un residente. Precisa uno: ${labels.join(', ')}.`);
    }

    const resident = matches[0] || {};
    let unitId = typeof resident.unit_id === 'string' ? resident.unit_id : '';
    let unitNumber = requestedUnitNumber || (typeof resident.department_number === 'string' ? resident.department_number : '');

    if (requestedUnitNumber && !unitId) {
        const { data: units, error: unitsError } = await admin
            .from('units')
            .select('id, number, unit_number')
            .eq('community_id', profile.community_id)
            .limit(500);
        if (unitsError) throw unitsError;
        const unitMatches = (units || []).filter(unit => {
            const candidate = String(unit.number || unit.unit_number || '');
            return normalizeIntentText(candidate) === normalizedUnitNumber;
        });
        if (unitMatches.length === 0) {
            throw new Error(`No encontre el departamento "${requestedUnitNumber}" en esta comunidad.`);
        }
        if (unitMatches.length > 1) {
            throw new Error(`Encontre mas de una unidad con el numero "${requestedUnitNumber}". Revisa la configuracion de unidades.`);
        }
        unitId = String(unitMatches[0].id || '');
        unitNumber = String(unitMatches[0].number || unitMatches[0].unit_number || requestedUnitNumber);
    }

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

    const residentName = String(resident.full_name || resident.name || resident.email || '');
    if (!unitId) {
        throw new Error(residentName
            ? `El perfil de ${residentName} no tiene una unidad asociada.`
            : `El departamento ${unitNumber} no tiene una unidad asociada.`);
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
    const subjectLabel = residentName ? `${residentName}${unitNumber ? ` (Depto ${unitNumber})` : ''}` : `Depto ${unitNumber}`;
    const message = rows.length === 0
        ? `${subjectLabel} no mantiene gastos comunes pendientes.`
        : `${subjectLabel} mantiene ${rows.length} gasto(s) pendiente(s) por $${amount.toLocaleString('es-CL')}.`;

    return {
        entityType: 'resident_expenses',
        entityId: String(resident.id || unitId),
        title: requestedUnitNumber ? 'Deuda de departamento revisada' : 'Deuda de residente revisada',
        message,
        data: {
            residentId: resident.id ? String(resident.id) : null,
            residentName,
            unitId,
            unitNumber,
            pendingCount: rows.length,
            pendingAmount: amount,
            expenses: rows,
        },
    };
}
