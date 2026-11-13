import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BuildingAddressInput, ResidentBuildingMatch } from '@/lib/types';

/**
 * Entrada por residente (docs/comercial/entrada-por-residente.md): encontrar el
 * edificio por su dirección o crear su comunidad "sin administrar".
 *
 * Un mismo edificio puede llegar con distinto place_id según el geocodificador
 * (Mapbox, Nominatim) o la entrada elegida; por eso también se busca por
 * cercanía.
 */

/** Distancia bajo la cual dos direcciones se tratan como el mismo edificio. */
export const SAME_BUILDING_METERS = 40;

/**
 * Presupuesto de IA de una comunidad sin administrar: nadie paga, así que el
 * techo es bajo (un edificio Pro tiene 10 M tokens al mes y 100 k diarios por
 * residente).
 */
export const UNMANAGED_AI_BUDGET = {
    plan: 'demo',
    is_enabled: true,
    monthly_token_limit: 1_000_000,
    monthly_image_limit: 0,
    monthly_cost_limit_cents: 1_500,
    resident_daily_token_limit: 20_000,
    staff_daily_token_limit: 20_000,
    heavy_action_daily_limit: 5,
} as const;

export function distanceMeters(latA: number, lonA: number, latB: number, lonB: number) {
    const rad = Math.PI / 180;
    const dLat = (latB - latA) * rad;
    const dLon = (lonB - lonA) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLon / 2) ** 2;
    return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Valida la dirección que llega del formulario (sugerencia de /api/geocode/address). */
export function parseBuildingAddress(value: unknown): BuildingAddressInput | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    const label = typeof row.label === 'string' ? row.label.trim().slice(0, 240) : '';
    const placeId = typeof row.placeId === 'string' ? row.placeId.trim().slice(0, 180) : '';
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    const source = row.source === 'mapbox' || row.source === 'nominatim' ? row.source : null;
    if (label.length < 5 || !placeId || !source) return null;
    // Chile continental e insular (con margen): una coordenada fuera es un error.
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -56 || latitude > -17 || longitude < -110 || longitude > -66) return null;
    return { label, placeId, latitude, longitude, source };
}

type CommunityRow = { id: string; name: string; managed: boolean | null; resident_code: string; address_latitude: number | null; address_longitude: number | null };

const COLUMNS = 'id, name, managed, resident_code, address_latitude, address_longitude';

function toMatch(row: CommunityRow): ResidentBuildingMatch {
    return { id: String(row.id), name: String(row.name), managed: row.managed !== false, residentCode: String(row.resident_code) };
}

/** El edificio de esa dirección, administrado o no. Primero por place_id, luego por cercanía. */
export async function findBuildingForAddress(admin: SupabaseClient, address: BuildingAddressInput): Promise<ResidentBuildingMatch | null> {
    const { data: byPlace } = await admin.from('communities').select(COLUMNS)
        .eq('address_place_id', address.placeId).order('managed', { ascending: false }).limit(1);
    if (byPlace?.[0]) return toMatch(byPlace[0] as CommunityRow);

    // ~0,0005° ≈ 55 m: caja para no traer toda la tabla; la distancia exacta va abajo.
    const delta = 0.0005;
    const { data: nearby } = await admin.from('communities').select(COLUMNS)
        .gte('address_latitude', address.latitude - delta).lte('address_latitude', address.latitude + delta)
        .gte('address_longitude', address.longitude - delta).lte('address_longitude', address.longitude + delta)
        .limit(20);
    const close = ((nearby || []) as CommunityRow[])
        .filter(row => row.address_latitude !== null && row.address_longitude !== null)
        .map(row => ({ row, meters: distanceMeters(address.latitude, address.longitude, Number(row.address_latitude), Number(row.address_longitude)) }))
        .filter(item => item.meters <= SAME_BUILDING_METERS)
        // Si hay una administrada cerca, manda esa: el edificio ya contrató.
        .sort((a, b) => Number(b.row.managed !== false) - Number(a.row.managed !== false) || a.meters - b.meters);
    return close[0] ? toMatch(close[0].row) : null;
}

/** Crea la comunidad sin administrar (o devuelve la que otro vecino creó al mismo tiempo). */
export async function createUnmanagedCommunity(admin: SupabaseClient, buildingName: string, address: BuildingAddressInput): Promise<ResidentBuildingMatch> {
    const { data, error } = await admin.from('communities').insert({
        name: buildingName,
        address: address.label,
        address_latitude: address.latitude,
        address_longitude: address.longitude,
        address_place_id: address.placeId,
        address_geocoding_source: address.source,
        managed: false,
        subscription_status: null,
    }).select(COLUMNS).single();
    if (error || !data) {
        // Índice único por place_id: otro vecino la creó recién.
        const existing = await findBuildingForAddress(admin, address);
        if (existing) return existing;
        throw error || new Error('No se pudo crear la comunidad.');
    }
    const { error: budgetError } = await admin.from('ai_budgets').insert({ community_id: data.id, ...UNMANAGED_AI_BUDGET });
    if (budgetError) console.error('[resident building] no se pudo crear el presupuesto de IA', budgetError.message);
    return toMatch(data as CommunityRow);
}
