import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { NeighborBuildingError, decidePendingResident, listPendingResidents } from '@/lib/onboarding/neighborBuildings';
import { AssignUnitError, assignResidentUnit } from '@/lib/units/assignResidentUnit';

/**
 * Administración de residentes por CoCo: ver quién espera validación,
 * validarlo o quitarlo, y asignarle su unidad. Antes solo se hacía en
 * /admin/users, y los residentes que entran por el link de registro quedan
 * esperando a que la administración los valide.
 *
 * Usa las mismas funciones que las rutas de la pantalla. El administrador
 * viene del perfil autenticado; el modelo solo elige a quién.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const likeSafe = (value: string) => value.replace(/[%_\\]/g, ' ').trim();

export async function listPendingResidentsForAdmin(communityId: string) {
    try {
        const pending = await listPendingResidents(communityId);
        return {
            total: pending.length,
            // Sin correo: para decidir basta nombre y departamento, y el correo
            // no tiene por qué pasar por la conversación.
            pendientes: pending.map(resident => ({
                residente_id: resident.id,
                nombre: resident.name,
                departamento: resident.departmentNumber || 'sin indicar',
                registrado: resident.createdAt.slice(0, 10),
            })),
            nota: pending.length ? undefined : 'No hay vecinos esperando validación.',
        };
    } catch (error) {
        return { error: error instanceof NeighborBuildingError ? error.message : 'No pude cargar los vecinos por validar.' };
    }
}

export async function decidePendingResidentForAdmin(communityId: string, adminId: string, input: Record<string, unknown>) {
    const residentId = text(input.resident_id, 36);
    if (!UUID.test(residentId)) return { error: 'Necesito el residente_id que devuelve list_pending_residents.' };
    if (typeof input.approve !== 'boolean') return { error: 'Indica si se valida (approve: true) o se quita (approve: false).' };
    try {
        await decidePendingResident(communityId, adminId, residentId, input.approve);
        return {
            success: true,
            message: input.approve
                ? 'Vecino validado: ya tiene acceso completo y quedó ligado a su departamento.'
                : 'Vecino quitado: no vive en el edificio, perdió el acceso a la comunidad y su departamento quedó libre.',
        };
    } catch (error) {
        return { error: error instanceof NeighborBuildingError ? error.message : 'No se pudo guardar.' };
    }
}

export async function assignResidentUnitForAdmin(admin: SupabaseClient, communityId: string, input: Record<string, unknown>) {
    const unitNumber = text(input.unit_number, 40);
    if (!unitNumber) return { error: 'Dime el número de departamento o unidad.' };

    let residentId = text(input.resident_id, 36);
    if (!UUID.test(residentId)) {
        const name = likeSafe(text(input.resident_name, 80));
        if (!name) return { error: 'Dime a qué residente (nombre) le asigno la unidad.' };
        const { data, error } = await admin
            .from('profiles')
            .select('id, name, department_number')
            .eq('community_id', communityId)
            .eq('role', 'resident')
            .ilike('name', `%${name}%`)
            .limit(6);
        if (error) return { error: 'No pude buscar al residente.' };
        const matches = (data ?? []) as Array<{ id: string; name: string | null; department_number: string | null }>;
        if (!matches.length) return { error: `No encontré un residente "${name}" en tu comunidad.` };
        if (matches.length > 1) {
            return {
                error: 'Hay varios residentes con ese nombre. Pregunta cuál y vuelve a llamar con su resident_id.',
                residentes: matches.map(row => ({ resident_id: row.id, nombre: row.name, departamento_actual: row.department_number || 'sin unidad' })),
            };
        }
        residentId = matches[0].id;
    }

    try {
        const result = await assignResidentUnit(admin, communityId, residentId, unitNumber);
        return { success: true, message: `${result.name} quedó asignado al departamento ${result.unitNumber}.` };
    } catch (error) {
        if (error instanceof AssignUnitError) return { error: error.message };
        return { error: 'No se pudo asignar la unidad.' };
    }
}
