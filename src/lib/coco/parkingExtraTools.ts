import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Estacionamientos, lo que faltaba: extender una reserva (conductor), fijar
 * los horarios de disponibilidad del estacionamiento propio (dueño), y ver y
 * resolver solicitudes de conductores externos (administración).
 *
 * Extender y resolver delegan en funciones de base (coco_extend_parking_booking,
 * coco_review_parking_community_access), las mismas reglas que la pantalla.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
type Row = Record<string, unknown>;

export async function extendParkingBooking(admin: SupabaseClient, userId: string, input: Record<string, unknown>) {
    const bookingId = text(input.booking_id, 36);
    if (!UUID.test(bookingId)) return { error: 'Necesito el reserva_id que devuelve get_my_parking.' };
    const minutes = Math.round(Number(input.additional_minutes));
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 720) return { error: 'La extensión va de 1 a 720 minutos (12 horas).' };
    const { data, error } = await admin.rpc('coco_extend_parking_booking', { p_user_id: userId, p_booking_id: bookingId, p_additional_minutes: minutes });
    if (error) return { error: error.message || 'No se pudo extender la reserva.' };
    const row = (Array.isArray(data) ? data[0] : data) as Row | null;
    const extra = Number(row?.additional_amount ?? 0);
    const until = row?.new_ends_at ? new Date(String(row.new_ends_at)).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
    return {
        success: true,
        message: `Extendí tu reserva${until ? ` hasta el ${until}` : ''}. ${extra > 0 ? `Se suman $${extra.toLocaleString('es-CL')} al cobro.` : 'No tiene costo adicional (tope diario).'}`,
    };
}

export async function setMySpotAvailability(admin: SupabaseClient, userId: string, input: Record<string, unknown>) {
    const spotId = text(input.listing_id, 36);
    if (!UUID.test(spotId)) return { error: 'Necesito el listing_id del estacionamiento (list_my_listings).' };
    const { data: spot } = await admin.from('parking_spots').select('id, label, owner_id').eq('id', spotId).maybeSingle();
    if (!spot || spot.owner_id !== userId) return { error: 'No encontré ese estacionamiento entre los tuyos.' };

    const raw = Array.isArray(input.windows) ? input.windows as Row[] : [];
    const windows = raw.map(w => ({ weekday: Number(w.weekday), start: text(w.start_time, 5), end: text(w.end_time, 5) }));
    const invalid = windows.find(w => !Number.isInteger(w.weekday) || w.weekday < 0 || w.weekday > 6 || !TIME.test(w.start) || !TIME.test(w.end) || w.start >= w.end);
    if (invalid) return { error: 'Cada horario necesita día (0 = domingo … 6 = sábado), inicio y término HH:MM, con el término después del inicio.' };
    if (windows.length > 28) return { error: 'Son demasiados tramos; agrupa los horarios.' };

    // Igual que la pantalla: reemplaza todas las ventanas del estacionamiento.
    const { error: deleteError } = await admin.from('parking_spot_availability').delete().eq('spot_id', spotId);
    if (deleteError) return { error: 'No se pudieron actualizar los horarios.' };
    if (windows.length) {
        const { error } = await admin.from('parking_spot_availability').insert(
            windows.map(w => ({ spot_id: spotId, weekday: w.weekday, start_time: w.start, end_time: w.end })),
        );
        if (error) return { error: 'Se borraron los horarios anteriores pero no se pudieron guardar los nuevos; vuelve a intentarlo.' };
    }
    const summary = windows.map(w => `${DAYS[w.weekday]} ${w.start}–${w.end}`).join(', ');
    return { success: true, message: windows.length ? `Horarios de "${spot.label}": ${summary}.` : `"${spot.label}" quedó sin horarios: no recibe reservas hasta que agregues alguno.` };
}

export async function listParkingAccessRequests(admin: SupabaseClient, communityId: string) {
    const { data, error } = await admin.from('parking_community_access')
        .select('id, driver_id, message, created_at').eq('community_id', communityId).eq('status', 'pending').limit(20);
    if (error) return { error: 'No pude cargar las solicitudes de acceso.' };
    const rows = (data ?? []) as Row[];
    const driverIds = rows.map(r => String(r.driver_id));
    const { data: drivers } = driverIds.length
        ? await admin.from('parking_drivers').select('id, full_name, plate').in('id', driverIds)
        : { data: [] };
    const byId = new Map(((drivers ?? []) as Row[]).map(d => [String(d.id), d]));
    return {
        solicitudes: rows.map(r => {
            const driver = byId.get(String(r.driver_id));
            return { access_id: r.id, conductor: driver?.full_name ?? 'Conductor', patente: driver?.plate, mensaje: r.message };
        }),
        nota: rows.length ? undefined : 'No hay solicitudes de conductores externos.',
    };
}

export async function reviewParkingAccess(admin: SupabaseClient, adminId: string, input: Record<string, unknown>) {
    const accessId = text(input.access_id, 36);
    if (!UUID.test(accessId)) return { error: 'Necesito el access_id que devuelve list_parking_access_requests.' };
    if (typeof input.approve !== 'boolean') return { error: 'Indica si se aprueba (approve: true) o se rechaza (false).' };
    const { error } = await admin.rpc('coco_review_parking_community_access', {
        p_user_id: adminId, p_access_id: accessId, p_approved: input.approve, p_reason: text(input.reason, 300) || null,
    });
    if (error) return { error: error.message || 'No se pudo resolver la solicitud.' };
    return {
        success: true,
        message: input.approve
            ? 'Conductor aprobado: ya puede reservar estacionamientos de la comunidad.'
            : 'Solicitud rechazada. Si tenía reservas futuras, se cancelaron.',
    };
}
