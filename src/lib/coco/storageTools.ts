import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Bodegas para CoCo. CoCo corre con la service role, así que no sirven las
 * funciones que leen auth.uid(): aquí se acota a mano a la comunidad del
 * residente verificado, y para arrendar se usa coco_rent_storage_unit, que
 * revalida todo en la base (comunidad, dueño, meses mínimos, superposición).
 */

type Row = Record<string, unknown>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
}

/** Dos rangos [inicio, fin) se cruzan si cada uno empieza antes de que termine el otro. */
export function storageRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function validStoragePeriod(startsOn: unknown, months: unknown): { startsOn: string; months: number } | { error: string } {
  const start = String(startsOn ?? '').trim();
  const count = Math.round(Number(months));
  if (!ISO_DATE.test(start)) return { error: 'La fecha de inicio debe venir como AAAA-MM-DD.' };
  if (!Number.isFinite(count) || count < 1 || count > 24) return { error: 'El arriendo va de 1 a 24 meses.' };
  return { startsOn: start, months: count };
}

export async function searchStorageForResident(
  admin: SupabaseClient,
  communityId: string,
  userId: string,
  startsOn: string,
  months: number,
) {
  const endsOn = addMonths(startsOn, months);
  const { data: units, error } = await admin
    .from('storage_units')
    .select('id,label,description,floor_level,area_m2,monthly_rate,min_months,owner_id')
    .eq('community_id', communityId)
    .eq('status', 'published')
    .neq('owner_id', userId)
    .lte('min_months', months)
    .order('monthly_rate');
  if (error) return { error: 'No pude buscar bodegas ahora.' };
  const ids = ((units || []) as Row[]).map(unit => String(unit.id));
  if (ids.length === 0) return { bodegas: [], periodo: { desde: startsOn, hasta: endsOn, meses: months } };

  const { data: rentals } = await admin
    .from('storage_rentals')
    .select('storage_id,starts_on,ends_on')
    .in('storage_id', ids)
    .eq('status', 'active');
  const busy = new Set(((rentals || []) as Row[])
    .filter(rental => storageRangesOverlap(String(rental.starts_on), String(rental.ends_on), startsOn, endsOn))
    .map(rental => String(rental.storage_id)));

  return {
    periodo: { desde: startsOn, hasta: endsOn, meses: months },
    bodegas: ((units || []) as Row[])
      .filter(unit => !busy.has(String(unit.id)))
      .map(unit => ({
        storage_id: String(unit.id),
        nombre: String(unit.label),
        ubicacion: String(unit.floor_level || ''),
        m2: unit.area_m2 === null ? null : Number(unit.area_m2),
        precio_mensual: Number(unit.monthly_rate),
        total_periodo: Number(unit.monthly_rate) * months,
        meses_minimos: Number(unit.min_months),
        descripcion: String(unit.description || ''),
      })),
  };
}

export async function rentStorageForResident(
  admin: SupabaseClient,
  communityId: string,
  userId: string,
  storageId: string,
  startsOn: string,
  months: number,
) {
  // Revalidado en la base, pero comprobarlo aquí evita revelar bodegas de otros condominios.
  const { data: unit } = await admin
    .from('storage_units')
    .select('label,community_id,monthly_rate')
    .eq('id', storageId)
    .maybeSingle();
  if (!unit || unit.community_id !== communityId) return { error: 'Esa bodega no existe en tu comunidad.' };

  const { data: rentalId, error } = await admin.rpc('coco_rent_storage_unit', {
    p_user_id: userId,
    p_storage_id: storageId,
    p_starts_on: startsOn,
    p_months: months,
  });
  // Los mensajes de la función están escritos para el residente: van tal cual.
  if (error) return { error: error.message || 'No se pudo arrendar la bodega.' };

  return {
    success: true,
    rental_id: String(rentalId),
    bodega: unit.label,
    desde: startsOn,
    hasta: addMonths(startsOn, months),
    meses: months,
    cobro_mensual: unit.monthly_rate,
    total: Number(unit.monthly_rate) * months,
    nota: 'Cada mes queda un cargo en los gastos comunes de tu unidad. Se cancela desde Estacionamientos > Bodegas.',
  };
}

export async function myStorageForResident(admin: SupabaseClient, communityId: string, userId: string) {
  const [{ data: rentals }, { data: units }] = await Promise.all([
    admin
      .from('storage_rentals')
      .select('id,starts_on,ends_on,months,monthly_rate,status,tenant_id,owner_id,storage_units(label)')
      .eq('community_id', communityId)
      .or(`tenant_id.eq.${userId},owner_id.eq.${userId}`)
      .order('starts_on', { ascending: false })
      .limit(20),
    admin
      .from('storage_units')
      .select('label,status,monthly_rate')
      .eq('community_id', communityId)
      .eq('owner_id', userId),
  ]);
  const label = (row: Row) => (row.storage_units as { label?: string } | null)?.label || 'Bodega';
  return {
    arriendos: ((rentals || []) as Row[]).filter(row => row.tenant_id === userId).map(row => ({
      bodega: label(row), desde: row.starts_on, hasta: row.ends_on, meses: row.months,
      cobro_mensual: row.monthly_rate, estado: row.status,
    })),
    mis_bodegas: ((units || []) as Row[]).map(row => ({
      bodega: row.label, estado: row.status, precio_mensual: row.monthly_rate,
    })),
    arrendadas_a_vecinos: ((rentals || []) as Row[]).filter(row => row.owner_id === userId).map(row => ({
      bodega: label(row), desde: row.starts_on, hasta: row.ends_on, estado: row.status,
    })),
  };
}
