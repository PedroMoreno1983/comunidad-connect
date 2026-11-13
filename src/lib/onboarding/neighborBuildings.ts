import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordOperationEvent, recordPlatformOperationEvent } from '@/lib/operations/audit';
import { findOrCreateCommunityUnit } from '@/lib/units/resolveCommunityUnit';
import type { NeighborBuildingRow, NeighborModeSummary, PendingResident, ProviderNetworkActor } from '@/lib/types';

/**
 * Fases 3 y 4 de la entrada por residente (docs/comercial/entrada-por-residente.md):
 * el contador de vecinos, la lista de edificios por conquistar, la entrega del
 * edificio a su administración y la validación de los vecinos que ya estaban.
 */

export class NeighborBuildingError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

/** Vecinos para avisar al equipo comercial. */
export const SALES_ALERT_RESIDENTS = 5;
/** Vecinos desde los que la invitación a la administración se destaca. */
export const HIGHLIGHT_INVITE_RESIDENTS = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vecinos registrados de la comunidad. No hay registro de actividad por persona
 * para filtrar por los últimos 30 días; en esta etapa casi todos los registros
 * son recientes. Ver docs/comercial/entrada-por-residente.md.
 */
export async function countResidents(communityId: string) {
    const { count } = await getSupabaseAdmin().from('profiles').select('id', { count: 'exact', head: true })
        .eq('community_id', communityId).eq('role', 'resident');
    return count ?? 0;
}

export async function neighborModeSummary(communityId: string): Promise<NeighborModeSummary | null> {
    const { data: community } = await getSupabaseAdmin().from('communities').select('id, name, managed').eq('id', communityId).maybeSingle();
    if (!community || community.managed !== false) return null;
    const residents = await countResidents(communityId);
    return { buildingName: String(community.name), residents, highlightInvite: residents >= HIGHLIGHT_INVITE_RESIDENTS };
}

/** Avisa (bitácora global) cuando un edificio sin administrar cruza un umbral de vecinos. */
export async function noteResidentThreshold(communityId: string, buildingName: string) {
    const residents = await countResidents(communityId);
    const admin = getSupabaseAdmin();
    // Por cruce (>=) y no por igualdad: si dos vecinos se registran a la vez el
    // conteo puede saltarse el 5 o el 10. Cada umbral se anota una sola vez.
    for (const threshold of [SALES_ALERT_RESIDENTS, HIGHLIGHT_INVITE_RESIDENTS]) {
        if (residents < threshold) continue;
        const action = `neighbor_mode.residents_threshold_${threshold}`;
        const { count } = await admin.from('platform_operation_events').select('id', { count: 'exact', head: true })
            .eq('action', action).eq('entity_id', communityId);
        if (count) continue;
        await recordPlatformOperationEvent({
            action, entityType: 'community', entityId: communityId,
            summary: `${buildingName} llegó a ${threshold} vecinos sin administración: ${threshold === SALES_ALERT_RESIDENTS ? 'listo para contactar' : 'invitación destacada'}`,
            metadata: { residents, threshold },
        });
    }
}

/** Edificios sin administrar, los con más vecinos primero: la lista de prospectos. */
export async function listUnmanagedBuildings(): Promise<NeighborBuildingRow[]> {
    const admin = getSupabaseAdmin();
    const { data: communities, error } = await admin.from('communities')
        .select('id, name, address, created_at').eq('managed', false).order('created_at', { ascending: false }).limit(500);
    if (error) throw new NeighborBuildingError('No se pudieron cargar los edificios.', 500);
    const rows = await Promise.all((communities || []).map(async community => ({
        id: String(community.id),
        name: String(community.name),
        address: community.address ? String(community.address) : '',
        createdAt: String(community.created_at),
        residents: await countResidents(String(community.id)),
    })));
    return rows
        .map(row => ({ ...row, readyForSales: row.residents >= SALES_ALERT_RESIDENTS }))
        .sort((a, b) => b.residents - a.residents);
}

/**
 * Convive entrega el edificio a su administración: pasa a administrado y se
 * devuelve el código de administración para que se registre. Los vecinos que
 * ya estaban siguen, pendientes de validación.
 */
export async function activateBuilding(communityId: string, actor: ProviderNetworkActor) {
    if (!UUID.test(communityId)) throw new NeighborBuildingError('Comunidad no válida.', 400);
    const admin = getSupabaseAdmin();
    const { data: community, error } = await admin.from('communities')
        .update({ managed: true, claimed_at: new Date().toISOString() })
        .eq('id', communityId).eq('managed', false)
        .select('id, name, admin_code').maybeSingle();
    if (error) throw new NeighborBuildingError('No se pudo activar el edificio.', 500);
    if (!community) throw new NeighborBuildingError('Ese edificio ya está administrado o no existe.', 409);
    // Lo que sigue ya no deshace la activación: si algo falla se informa como
    // aviso (y queda en el log) en vez de un error que no se podría reintentar.
    const warnings: string[] = [];
    // Hasta que la administración los valide, los vecinos que entraron sin
    // código no quedan ligados a una unidad: quien dijo "504" sin vivir ahí no
    // ve los gastos de la 504.
    const unlinked = await unlinkUnverifiedUnits(communityId);
    if (!unlinked) warnings.push('No se pudieron desvincular las unidades de los vecinos por validar: revisa Unidades.');
    // Sin la fila demo vuelve al presupuesto de IA por defecto de un edificio que paga.
    const { error: budgetError } = await admin.from('ai_budgets').delete().eq('community_id', communityId).eq('plan', 'demo');
    if (budgetError) warnings.push('No se pudo quitar el presupuesto de IA de prueba: CoCo sigue con límites bajos en este edificio.');
    const residents = await countResidents(communityId);
    const audit = await recordPlatformOperationEvent({
        actorId: actor.id, actorEmail: actor.email, action: 'neighbor_mode.building_activated', entityType: 'community', entityId: communityId,
        summary: `Edificio entregado a su administración: ${community.name} (${residents} vecinos por validar)`,
        metadata: { residents, warnings },
    });
    if (!audit.ok) warnings.push('La entrega no quedó en la bitácora global.');
    if (warnings.length) console.error('[neighbor buildings] activación con avisos', { communityId, warnings });
    return { name: String(community.name), adminCode: String(community.admin_code || ''), residents, warnings };
}

/** Quita el vínculo entre los vecinos sin validar y sus unidades. */
async function unlinkUnverifiedUnits(communityId: string) {
    const admin = getSupabaseAdmin();
    const { data: pending, error } = await admin.from('profiles').select('id')
        .eq('community_id', communityId).eq('residence_verified', false);
    if (error) return false;
    const ids = (pending || []).map(row => String(row.id));
    if (!ids.length) return true;
    const results = await Promise.all([
        admin.from('units').update({ owner_id: null }).eq('community_id', communityId).in('owner_id', ids),
        admin.from('units').update({ resident_profile_id: null }).eq('community_id', communityId).in('resident_profile_id', ids),
        admin.from('profiles').update({ unit_id: null }).eq('community_id', communityId).in('id', ids),
    ]);
    return results.every(result => !result.error);
}

/** Vecinos que entraron sin código: la administración los valida. */
export async function listPendingResidents(communityId: string): Promise<PendingResident[]> {
    const { data, error } = await getSupabaseAdmin().from('profiles')
        .select('id, name, email, department_number, created_at')
        .eq('community_id', communityId).eq('residence_verified', false).order('created_at').limit(500);
    // Un error no es "no hay pendientes": la administración tiene que saberlo.
    if (error) throw new NeighborBuildingError('No se pudieron cargar los vecinos por validar.', 500);
    return (data || []).map(row => ({
        id: String(row.id),
        name: String(row.name || 'Vecino'),
        email: String(row.email || ''),
        departmentNumber: row.department_number ? String(row.department_number) : '',
        createdAt: String(row.created_at),
    }));
}

/**
 * Validar (vive en el edificio) o quitar (no vive aquí: pierde el acceso a la
 * comunidad, la cuenta queda sin comunidad). Solo en un edificio administrado.
 */
export async function decidePendingResident(communityId: string, adminId: string, profileId: string, approve: boolean) {
    if (!UUID.test(profileId)) throw new NeighborBuildingError('Vecino no válido.', 400);
    const admin = getSupabaseAdmin();
    const { data: community } = await admin.from('communities').select('managed').eq('id', communityId).maybeSingle();
    if (community?.managed !== true) throw new NeighborBuildingError('Primero el edificio tiene que estar administrado.', 409);
    const update = approve ? { residence_verified: true } : { community_id: null, unit_id: null };
    const { data, error } = await admin.from('profiles').update(update)
        .eq('id', profileId).eq('community_id', communityId).eq('residence_verified', false)
        .select('id, name, department_number').maybeSingle();
    if (error) throw new NeighborBuildingError('No se pudo guardar.', 500);
    if (!data) throw new NeighborBuildingError('Ese vecino ya fue revisado o no es de tu edificio.', 409);
    if (approve) {
        // Validado: recién ahora queda ligado a su unidad.
        if (data.department_number) {
            const unitId = await findOrCreateCommunityUnit(admin, communityId, String(data.department_number));
            await admin.from('profiles').update({ unit_id: unitId }).eq('id', profileId);
            await admin.from('units').update({ resident_profile_id: profileId }).eq('id', unitId).is('resident_profile_id', null);
            await admin.from('units').update({ owner_id: profileId }).eq('id', unitId).is('owner_id', null);
        }
    } else {
        // Quitado: suelta cualquier unidad que tuviera tomada, para que el
        // vecino real pueda ligarse a ella.
        await admin.from('units').update({ owner_id: null }).eq('community_id', communityId).eq('owner_id', profileId);
        await admin.from('units').update({ resident_profile_id: null }).eq('community_id', communityId).eq('resident_profile_id', profileId);
    }
    await recordOperationEvent({
        communityId, actorId: adminId, actorRole: 'admin',
        action: approve ? 'resident.residence_verified' : 'resident.removed_unverified',
        entityType: 'profile', entityId: profileId, severity: approve ? 'success' : 'warning', status: 'success',
        summary: approve ? `Vecino validado: ${data.name}` : `Vecino quitado (no vive en el edificio): ${data.name}`,
    });
}
