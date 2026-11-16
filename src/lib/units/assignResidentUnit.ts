import type { SupabaseClient } from '@supabase/supabase-js';
import { findOrCreateCommunityUnit } from '@/lib/units/resolveCommunityUnit';

/**
 * La administración asigna la unidad (departamento) de un residente de su
 * comunidad. Lo usan la pantalla de usuarios (/api/admin/users/assign-unit) y
 * CoCo (assign_resident_unit), así que las dos vías validan igual.
 *
 * Si la unidad no tiene dueño todavía, el residente queda como dueño.
 */

export class AssignUnitError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
    }
}

export async function assignResidentUnit(admin: SupabaseClient, communityId: string, profileId: string, rawUnitNumber: string) {
    const unitNumber = rawUnitNumber.trim().slice(0, 40);
    if (!profileId) throw new AssignUnitError('Falta el usuario.', 400);
    if (!unitNumber) throw new AssignUnitError('Ingresa el numero de unidad o departamento.', 400);

    const { data: target, error: targetError } = await admin
        .from('profiles')
        .select('id, name, role, community_id')
        .eq('id', profileId)
        .maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new AssignUnitError('Usuario no encontrado.', 404);
    if (target.community_id !== communityId) throw new AssignUnitError('El usuario no pertenece a tu comunidad.', 403);
    if (target.role !== 'resident') throw new AssignUnitError('Solo se asigna unidad a residentes.', 400);

    const unitId = await findOrCreateCommunityUnit(admin, communityId, unitNumber);
    const { error: updateError } = await admin
        .from('profiles')
        .update({ unit_id: unitId, department_number: unitNumber })
        .eq('id', profileId);
    if (updateError) throw updateError;

    const { data: unitRow } = await admin.from('units').select('owner_id').eq('id', unitId).maybeSingle();
    if (unitRow && !unitRow.owner_id) {
        await admin.from('units').update({ owner_id: profileId }).eq('id', unitId);
    }

    return { unitId, unitNumber, name: String(target.name || 'Residente') };
}
