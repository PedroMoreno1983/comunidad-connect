import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { chileTodayISO } from '@/lib/agent-center/chileDate';

/**
 * Deshacer lo que CoCo hace por el residente: cancelar una reserva de espacio
 * común, de estacionamiento o un arriendo de bodega, y cambiar el estado de
 * una publicación del Marketplace.
 *
 * Antes CoCo reservaba y publicaba, pero para deshacer el residente tenía que
 * buscar la pantalla, y en el caso de los espacios comunes ni siquiera había
 * pantalla: solo la administración podía cancelar.
 *
 * Cada función recibe el perfil autenticado (nunca un id que mande el modelo
 * como "dueño") y comprueba que lo que cancela sea suyo y de su comunidad.
 * Estacionamiento y bodega delegan en las mismas funciones de base que la
 * pantalla (parking_cancel_as / storage_cancel_as), que deciden el dinero.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MARKETPLACE_STATUSES = ['sold', 'reserved', 'available', 'hidden'] as const;
type MarketplaceStatus = typeof MARKETPLACE_STATUSES[number];

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
/** Para ilike: el texto del residente no debe actuar como comodín. */
const likeSafe = (value: string) => value.replace(/[%_\\]/g, ' ').trim();

type Row = Record<string, unknown>;

export async function cancelReservationForUser(
    admin: SupabaseClient,
    communityId: string,
    userId: string,
    input: Record<string, unknown>,
) {
    const spaceName = likeSafe(text(input.space_name, 80));
    const date = text(input.date, 10);
    const startTime = text(input.start_time, 5);
    if (!spaceName) return { error: 'Dime qué espacio era (quincho, piscina, sala…).' };
    if (!ISO_DATE.test(date)) return { error: 'La fecha debe venir como AAAA-MM-DD.' };
    if (date < chileTodayISO()) return { error: 'Esa reserva ya pasó; solo se cancelan reservas de hoy en adelante.' };
    if (startTime && !TIME.test(startTime)) return { error: 'La hora debe venir como HH:MM.' };

    const { data: amenities, error: amenityError } = await admin
        .from('amenities')
        .select('id, name')
        .eq('community_id', communityId)
        .ilike('name', `%${spaceName}%`)
        .limit(5);
    if (amenityError) return { error: 'No pude consultar los espacios comunes.' };
    const amenityRows = (amenities ?? []) as Row[];
    if (!amenityRows.length) return { error: `No encontré el espacio "${spaceName}" en tu comunidad.` };

    let query = admin
        .from('bookings')
        .select('id, amenity_id, date, start_time, end_time, status')
        .eq('community_id', communityId)
        .eq('user_id', userId)
        .eq('date', date)
        .in('amenity_id', amenityRows.map(row => String(row.id)))
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true });
    if (startTime) query = query.gte('start_time', `${startTime}:00`).lte('start_time', `${startTime}:59`);
    const { data: bookings, error: bookingError } = await query;
    if (bookingError) return { error: 'No pude consultar tus reservas.' };
    const rows = (bookings ?? []) as Row[];
    const nameOf = (amenityId: unknown) => String(amenityRows.find(row => row.id === amenityId)?.name ?? spaceName);
    const hhmm = (value: unknown) => String(value ?? '').slice(0, 5);

    if (!rows.length) return { error: `No tienes una reserva de ${spaceName} el ${date}${startTime ? ` a las ${startTime}` : ''}.` };
    if (rows.length > 1) {
        return {
            error: 'Tienes más de una reserva ese día. Pregúntale cuál cancelar y vuelve a llamar con start_time.',
            reservas: rows.map(row => ({ espacio: nameOf(row.amenity_id), desde: hhmm(row.start_time), hasta: hhmm(row.end_time) })),
        };
    }

    const booking = rows[0];
    const { data: updated, error } = await admin
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', String(booking.id))
        .eq('user_id', userId)
        .neq('status', 'cancelled')
        .select('id')
        .maybeSingle();
    if (error) return { error: 'No se pudo cancelar la reserva.' };
    if (!updated) return { error: 'Esa reserva ya estaba cancelada.' };
    return {
        success: true,
        message: `Reserva de ${nameOf(booking.amenity_id)} del ${date} de ${hhmm(booking.start_time)} a ${hhmm(booking.end_time)} cancelada. El horario quedó libre.`,
    };
}

/**
 * Hasta cuándo se cancela gratis y si cancelar AHORA cobra, con la misma regla
 * que parking_charge_on_cancel: sin costo si se cancela al menos N horas antes
 * del inicio. Lo calcula el servidor para que CoCo no suponga el plazo.
 */
export function parkingCancellationWindow(startsAt: string, freeHours: number, now = new Date()) {
    const start = new Date(startsAt);
    if (!Number.isFinite(start.getTime())) return {};
    const deadline = new Date(start.getTime() - freeHours * 3_600_000);
    return {
        cancelar_gratis_hasta: deadline.toISOString(),
        cancelar_ahora: now <= deadline ? 'sin costo' : 'se mantiene el cobro',
    };
}

export async function cancelParkingBookingForUser(
    admin: SupabaseClient,
    communityId: string,
    userId: string,
    input: Record<string, unknown>,
) {
    const bookingId = text(input.booking_id, 36);
    if (!UUID.test(bookingId)) return { error: 'Necesito el reserva_id que devuelve get_my_parking.' };

    // La función de base revalida quién puede cancelar; comprobar la comunidad
    // aquí evita confirmar la existencia de reservas de otros condominios.
    const { data: booking } = await admin
        .from('parking_bookings')
        .select('id, community_id, starts_at, ends_at')
        .eq('id', bookingId)
        .maybeSingle();
    if (!booking || booking.community_id !== communityId) return { error: 'Esa reserva no existe en tu comunidad.' };

    const { error } = await admin.rpc('coco_cancel_parking_booking', {
        p_user_id: userId,
        p_booking_id: bookingId,
        p_reason: text(input.reason, 300) || null,
    });
    // Los mensajes de la función están escritos para el residente.
    if (error) return { error: error.message || 'No se pudo cancelar la reserva.' };

    return { success: true, message: 'Reserva de estacionamiento cancelada.', cobro: await parkingCancellationOutcome(admin, bookingId), donde_verla: '/estacionamientos' };
}

/**
 * Qué pasó con el dinero al cancelar. No se deduce del estado del cobro: una
 * cancelación a tiempo sobre un cobro ya pagado deja el cobro en 'paid' y pide
 * reembolso. Lo dice el último evento que el trigger de cancelación dejó en la
 * bitácora (parking_charge_on_cancel / parking_charge_void).
 */
async function parkingCancellationOutcome(admin: SupabaseClient, bookingId: string) {
    const { data: charge } = await admin
        .from('parking_charges')
        .select('id, amount, status')
        .eq('booking_id', bookingId)
        .maybeSingle();
    if (!charge) return undefined;
    const monto = `$${Number(charge.amount || 0).toLocaleString('es-CL')}`;

    const { data: events } = await admin
        .from('parking_charge_events')
        .select('event_type')
        .eq('charge_id', String(charge.id))
        .in('event_type', ['voided', 'late_cancellation_retained', 'refund_required', 'void_blocked'])
        .order('seq', { ascending: false })
        .limit(1);
    const outcome = ((events ?? []) as Row[])[0]?.event_type;

    if (outcome === 'refund_required') {
        return `Cancelada a tiempo, sin costo. Como el cobro de ${monto} ya estaba pagado, la administración tiene que devolvértelo; quedó marcado para revisión.`;
    }
    if (outcome === 'void_blocked') {
        return `Cancelada a tiempo, sin costo, pero el cargo de ${monto} no se pudo revertir solo; quedó marcado para que la administración lo anule.`;
    }
    if (outcome === 'late_cancellation_retained') {
        return `Se canceló dentro del plazo en que ya no es gratis: el cobro de ${monto} se mantiene.`;
    }
    if (outcome === 'voided' || charge.status === 'voided') return 'Cancelada a tiempo: no tiene costo.';
    return `Cancelada. El cobro de ${monto} quedó en estado "${charge.status}"; revisa el detalle en /estacionamientos.`;
}

export async function cancelStorageRentalForUser(
    admin: SupabaseClient,
    communityId: string,
    userId: string,
    input: Record<string, unknown>,
) {
    const rentalId = text(input.rental_id, 36);
    if (!UUID.test(rentalId)) return { error: 'Necesito el arriendo_id que devuelve get_my_storage.' };

    const { data: rental } = await admin
        .from('storage_rentals')
        .select('id, community_id, tenant_id')
        .eq('id', rentalId)
        .maybeSingle();
    if (!rental || rental.community_id !== communityId || rental.tenant_id !== userId) {
        return { error: 'No encontré ese arriendo entre los tuyos.' };
    }

    const { data: cancelledCharges, error } = await admin.rpc('coco_cancel_storage_rental', {
        p_user_id: userId,
        p_rental_id: rentalId,
        p_reason: text(input.reason, 300),
    });
    if (error) return { error: error.message || 'No se pudo terminar el arriendo.' };
    const anulados = Number(cancelledCharges) || 0;
    return {
        success: true,
        message: anulados
            ? `Arriendo terminado. Se anularon ${anulados} ${anulados === 1 ? 'cobro futuro' : 'cobros futuros'}; el mes en curso y lo ya pagado se mantienen.`
            : 'Arriendo terminado. No quedaban cobros futuros pendientes que anular.',
        donde_verla: '/estacionamientos',
    };
}

export async function updateMarketplaceItemForUser(
    admin: SupabaseClient,
    communityId: string,
    userId: string,
    input: Record<string, unknown>,
) {
    const status = text(input.status, 12) as MarketplaceStatus;
    if (!MARKETPLACE_STATUSES.includes(status)) return { error: 'El estado debe ser sold, reserved, available o hidden.' };
    const itemId = text(input.item_id, 36);
    const title = likeSafe(text(input.title, 120));
    if (!UUID.test(itemId) && !title) return { error: 'Dime cuál de tus publicaciones (el título basta).' };

    let query = admin
        .from('marketplace_items')
        .select('id, title, status')
        .eq('community_id', communityId)
        .eq('seller_id', userId)
        .limit(6);
    query = UUID.test(itemId) ? query.eq('id', itemId) : query.ilike('title', `%${title}%`);
    const { data, error: findError } = await query;
    if (findError) return { error: 'No pude consultar tus publicaciones.' };
    const items = (data ?? []) as Row[];
    if (!items.length) return { error: `No encontré una publicación tuya que diga "${title || itemId}".` };
    if (items.length > 1) {
        return {
            error: 'Tienes varias publicaciones parecidas. Pregúntale cuál y vuelve a llamar con su item_id.',
            publicaciones: items.map(item => ({ item_id: item.id, titulo: item.title, estado: item.status })),
        };
    }

    const item = items[0];
    if (item.status === status) return { success: true, message: `"${item.title}" ya estaba en ese estado.` };
    const { error } = await admin
        .from('marketplace_items')
        .update({ status })
        .eq('id', String(item.id))
        .eq('seller_id', userId);
    if (error) return { error: 'No se pudo actualizar la publicación.' };
    const done: Record<MarketplaceStatus, string> = {
        sold: 'quedó como vendida', reserved: 'quedó como reservada',
        available: 'está disponible otra vez', hidden: 'se retiró del Marketplace',
    };
    return { success: true, message: `"${item.title}" ${done[status]}.`, donde_verla: '/marketplace' };
}
