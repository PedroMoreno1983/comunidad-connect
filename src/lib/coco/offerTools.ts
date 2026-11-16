import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * El residente ofrece lo suyo a los vecinos: su estacionamiento (por horas,
 * días o meses) o su bodega (por meses). Antes CoCo solo sabía arrendar lo de
 * otros; publicar lo propio exigía ir a /estacionamientos.
 *
 * Todo queda en 'pending_approval': la administración aprueba antes de que
 * aparezca, igual que cuando se publica desde la pantalla. Quien publica
 * nunca se autoaprueba. El dueño es el perfil autenticado, no un id del modelo.
 */

const FLOOR_LEVELS = ['S1', 'S2', 'S3', 'PB', 'EXT'] as const;
const VEHICLE_SIZES = ['moto', 'auto', 'suv', 'camioneta'] as const;

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const pesos = (value: unknown) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n > 0 ? n : null;
};
const yes = (value: unknown) => value === true || value === 'true';

function duplicateLabel(error: { code?: string; message?: string } | null) {
    return error?.code === '23505' || /unique|duplicate/i.test(error?.message ?? '');
}

export async function publishParkingSpotForUser(admin: SupabaseClient, communityId: string, userId: string, input: Record<string, unknown>) {
    const label = text(input.label, 40);
    if (!label) return { error: 'Dime cómo se identifica el estacionamiento (ej. "E-23" o "Subterráneo 1, n° 14").' };
    const hourly = pesos(input.hourly_rate);
    const daily = pesos(input.daily_rate);
    const monthly = pesos(input.monthly_rate);
    if (!hourly && !daily && !monthly) return { error: 'Necesito al menos un precio: por hora, por día o por mes.' };
    const floor = FLOOR_LEVELS.includes(text(input.floor_level, 4).toUpperCase() as typeof FLOOR_LEVELS[number])
        ? text(input.floor_level, 4).toUpperCase() : 'S1';
    const size = VEHICLE_SIZES.includes(text(input.vehicle_size, 12) as typeof VEHICLE_SIZES[number])
        ? text(input.vehicle_size, 12) : 'auto';
    const minHours = Math.min(24, Math.max(1, Math.round(Number(input.min_hours) || 1)));

    const { data, error } = await admin
        .from('parking_spots')
        .insert({
            owner_id: userId,
            // El trigger enforce_parking_spot_rules fija la comunidad real del dueño.
            community_id: communityId,
            label,
            description: text(input.description, 500),
            vehicle_size: size,
            floor_level: floor,
            is_covered: yes(input.is_covered),
            has_ev_charger: yes(input.has_ev_charger),
            hourly_rate: hourly ?? 0,
            daily_rate: daily,
            monthly_rate: monthly,
            min_hours: minHours,
            allows_external: false,
            status: 'pending_approval',
        })
        .select('id, label')
        .single();
    if (duplicateLabel(error)) return { error: `Ya hay un estacionamiento "${label}" en tu comunidad. Usa otro nombre o revisa /estacionamientos.` };
    if (error || !data) return { error: error?.message || 'No se pudo publicar el estacionamiento.' };
    return {
        success: true,
        message: `Publiqué el estacionamiento "${data.label}". Queda pendiente hasta que la administración lo apruebe; después los vecinos lo pueden reservar. Las instrucciones de acceso y la disponibilidad se ajustan en /estacionamientos.`,
        donde_verla: '/estacionamientos',
    };
}

export async function publishStorageUnitForUser(admin: SupabaseClient, communityId: string, userId: string, input: Record<string, unknown>) {
    const label = text(input.label, 40);
    if (!label) return { error: 'Dime cómo se identifica la bodega (ej. "Bodega 12, piso -1").' };
    const monthly = pesos(input.monthly_rate);
    if (!monthly || monthly > 2_000_000) return { error: 'Necesito el precio mensual en pesos (hasta $2.000.000).' };
    const area = Number(input.area_m2);
    const minMonths = Math.min(24, Math.max(1, Math.round(Number(input.min_months) || 1)));

    const { data, error } = await admin
        .from('storage_units')
        .insert({
            owner_id: userId,
            community_id: communityId,
            label,
            description: text(input.description, 500),
            floor_level: text(input.floor_level, 20),
            area_m2: Number.isFinite(area) && area > 0 && area <= 200 ? area : null,
            monthly_rate: monthly,
            min_months: minMonths,
            status: 'pending_approval',
        })
        .select('id, label')
        .single();
    if (duplicateLabel(error)) return { error: `Ya hay una bodega "${label}" en tu comunidad. Usa otro nombre.` };
    if (error || !data) return { error: error?.message || 'No se pudo publicar la bodega.' };
    return {
        success: true,
        message: `Publiqué la bodega "${data.label}" a $${monthly.toLocaleString('es-CL')} al mes. Queda pendiente hasta que la administración la apruebe; después los vecinos la pueden arrendar y cada mes se cobra en los gastos comunes.`,
        donde_verla: '/estacionamientos',
    };
}
