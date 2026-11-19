import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { CommunityBoat, CommunityBoatInput } from '@/lib/types';
import { extraModulesOf } from './modules';

/**
 * Embarcaciones de una comunidad junto al lago (módulo 'lake'). Cada persona
 * registra las suyas; la administración ve todas las de su comunidad.
 */

export const BOAT_KINDS = ['lancha', 'velero', 'kayak', 'moto_agua', 'bote', 'otro'] as const;
const COLUMNS = 'id, owner_id, unit_id, kind, name, registration, length_m, notes, created_at, profiles:owner_id(name), units:unit_id(number)';

export class BoatError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

type Row = {
    id: string; owner_id: string; unit_id: string | null; kind: string; name: string; registration: string;
    length_m: number | string | null; notes: string; created_at: string;
    profiles?: { name: string | null } | { name: string | null }[] | null;
    units?: { number: string | null } | { number: string | null }[] | null;
};

const one = <T,>(value: T | T[] | null | undefined) => Array.isArray(value) ? value[0] : value ?? undefined;

function mapRow(row: Row): CommunityBoat {
    return {
        id: row.id,
        ownerId: row.owner_id,
        ownerName: one(row.profiles)?.name || '',
        unitNumber: one(row.units)?.number || '',
        kind: (BOAT_KINDS as readonly string[]).includes(row.kind) ? row.kind as CommunityBoat['kind'] : 'otro',
        name: row.name,
        registration: row.registration,
        lengthM: row.length_m === null ? null : Number(row.length_m),
        notes: row.notes,
        createdAt: row.created_at,
    };
}

export async function assertLakeCommunity(communityId: string) {
    const { data, error } = await getSupabaseAdmin().from('communities').select('extra_modules').eq('id', communityId).maybeSingle();
    if (error) throw error;
    if (!extraModulesOf(data?.extra_modules).includes('lake')) {
        throw new BoatError('El registro de embarcaciones no está activo en esta comunidad.', 403);
    }
}

export function validateBoatInput(input: Partial<CommunityBoatInput>) {
    const kind = String(input.kind || '');
    if (!(BOAT_KINDS as readonly string[]).includes(kind)) throw new BoatError('Elige el tipo de embarcación.');
    const length = input.lengthM === null || input.lengthM === undefined || input.lengthM === ('' as unknown) ? null : Number(input.lengthM);
    if (length !== null && (!Number.isFinite(length) || length <= 0 || length >= 100)) throw new BoatError('El largo va en metros, entre 0 y 100.');
    return {
        kind,
        name: String(input.name || '').trim().slice(0, 60),
        registration: String(input.registration || '').trim().toUpperCase().slice(0, 40),
        length_m: length,
        notes: String(input.notes || '').trim().slice(0, 300),
    };
}

export async function listBoats(user: { id: string; role: string; communityId: string }) {
    await assertLakeCommunity(user.communityId);
    let query = getSupabaseAdmin().from('community_boats').select(COLUMNS).eq('community_id', user.communityId).order('created_at', { ascending: false });
    // Residentes y conserjería: solo las propias. La administración: todas.
    if (user.role !== 'admin') query = query.eq('owner_id', user.id);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as unknown as Row[]).map(mapRow);
}

export async function createBoat(user: { id: string; communityId: string; unitId: string | null }, input: Partial<CommunityBoatInput>) {
    await assertLakeCommunity(user.communityId);
    const values = validateBoatInput(input);
    const admin = getSupabaseAdmin();
    const { count } = await admin.from('community_boats').select('id', { count: 'exact', head: true }).eq('owner_id', user.id);
    if ((count ?? 0) >= 10) throw new BoatError('Puedes registrar hasta 10 embarcaciones.');
    const { data, error } = await admin.from('community_boats')
        .insert({ ...values, community_id: user.communityId, owner_id: user.id, unit_id: user.unitId })
        .select(COLUMNS).single();
    if (error) throw error;
    return mapRow(data as unknown as Row);
}

export async function deleteBoat(user: { id: string; role: string; communityId: string }, id: string) {
    let query = getSupabaseAdmin().from('community_boats').delete().eq('id', id).eq('community_id', user.communityId);
    // La administración puede quitar una de su comunidad (vendida, dada de baja); el resto, solo las propias.
    if (user.role !== 'admin') query = query.eq('owner_id', user.id);
    const { data, error } = await query.select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new BoatError('No encontramos esa embarcación.', 404);
}
