import 'server-only';

/**
 * Ejecutores de herramientas de CoCo: rentals. Movidos tal cual desde el switch
 * de executeTool (21-11-2026). Devuelven NOT_HANDLED si la herramienta no es de este dominio.
 */
import { listPendingListings, reviewGroupOrderForAdmin, reviewListingForAdmin } from '../../adminReviewTools';
import { nextBookingStatus } from '../../bookingDecision';
import { publishParkingSpotForUser, publishStorageUnitForUser } from '../../offerTools';
import { listMyListings, removeMyListing, setMyListingStatus, updateMyListing } from '../../ownerListingTools';
import { extendParkingBooking, listParkingAccessRequests, rateParkingBooking, reviewParkingAccess, setMySpotAvailability } from '../../parkingExtraTools';
import { myStorageForResident, rentStorageForResident, searchStorageForResident, validStoragePeriod } from '../../storageTools';
import { cancelParkingBookingForUser, cancelReservationForUser, cancelStorageRentalForUser, parkingCancellationWindow, updateMarketplaceItemForUser } from '../../undoActions';
import { describeParkingCharge } from '@/lib/parking';
import { processParkingCharge, type ParkingChargesDb } from '@/lib/payments/parkingCharges';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { NOT_HANDLED, UserContext, forbidden, isAdmin, isIsoDate, isTime, isUuid, scopedCommunity, scopedUnit } from '../shared';

export async function executeRentalsTool(name: string, input: Record<string, string>, userCtx: UserContext): Promise<unknown> {
        switch (name) {
            // ── RESERVAS ────────────────────────────────────────────────────
            case 'check_availability': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                if (!isIsoDate(input.date)) return { error: 'La fecha debe usar el formato YYYY-MM-DD.' };
                const { data: amenity, error: amenityError } = await supabaseAdmin
                    .from('amenities')
                    .select('id,name')
                    .eq('community_id', communityId)
                    .eq('is_active', true)
                    .ilike('name', `%${input.space_name}%`)
                    .limit(1)
                    .maybeSingle();
                if (amenityError) return { error: 'No se pudo consultar el espacio comun.' };
                if (!amenity) return { error: `No se encontro el espacio "${input.space_name}" en tu comunidad.` };

                const { data, error } = await supabaseAdmin
                    .from('bookings')
                    .select('start_time,end_time')
                    .eq('community_id', communityId)
                    .eq('amenity_id', amenity.id)
                    .eq('date', input.date)
                    .neq('status', 'cancelled')
                    .order('start_time', { ascending: true });
                if (error) return { error: 'No se pudo consultar la disponibilidad.' };
                return {
                    space: amenity.name,
                    date: input.date,
                    occupied_slots: data ?? [],
                    available: !data || data.length === 0,
                };
            }

            // ── ESTACIONAMIENTOS ────────────────────────────────────────────
            case 'get_my_parking': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                if (!userCtx.user_id) return forbidden('No pude identificar al residente.');

                // Como propietario: los espacios que publica.
                const { data: spots } = await supabaseAdmin
                    .from('parking_spots')
                    .select('label, unit_label, floor_level, is_covered, has_ev_charger, hourly_rate, daily_rate, monthly_rate, status')
                    .eq('community_id', communityId)
                    .eq('owner_id', userCtx.user_id)
                    .order('label', { ascending: true });

                // Como conductor: sus reservas vigentes o futuras.
                const { data: driver } = await supabaseAdmin
                    .from('parking_drivers')
                    .select('id, plate, vehicle_description')
                    .eq('user_id', userCtx.user_id)
                    .maybeSingle();

                // Plazo de cancelación sin costo de ESTA comunidad (2 h si no
                // lo configuró). CoCo tiene que decir antes de confirmar si
                // cancelar cobra; con el default supuesto se equivocaría cerca
                // del corte en comunidades que lo cambiaron.
                const { data: community } = await supabaseAdmin
                    .from('communities')
                    .select('parking_free_cancellation_hours')
                    .eq('id', communityId)
                    .maybeSingle();
                const freeHours = Number(community?.parking_free_cancellation_hours ?? 2);

                let bookings: unknown[] = [];
                if (driver?.id) {
                    const { data } = await supabaseAdmin
                        .from('parking_bookings')
                        // reserva_id: lo necesita cancel_parking_booking.
                        .select('reserva_id:id, starts_at, ends_at, status, total_amount, access_code, parking_spots(label, floor_level)')
                        .eq('community_id', communityId)
                        .eq('driver_id', driver.id)
                        .gte('ends_at', new Date().toISOString())
                        .neq('status', 'cancelled')
                        .order('starts_at', { ascending: true })
                        .limit(10);
                    bookings = ((data ?? []) as Array<Record<string, unknown>>).map(booking => ({
                        ...booking,
                        ...parkingCancellationWindow(String(booking.starts_at), freeHours),
                    }));
                }

                return {
                    espacios_que_arriendo: spots ?? [],
                    mis_reservas_vigentes: bookings,
                    plazo_cancelacion_sin_costo_horas: freeHours,
                    vehiculo_registrado: driver
                        ? { patente: driver.plate, descripcion: driver.vehicle_description }
                        : null,
                    // Sin esto CoCo no sabe distinguir "no tienes nada" de "nunca
                    // te registraste como conductor", que son cosas distintas.
                    nota: driver
                        ? undefined
                        : 'El residente aun no registra un vehiculo, asi que no puede reservar hasta hacerlo en /estacionamientos.',
                };
            }

            case 'search_parking': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');

                const desde = new Date(String(input.starts_at ?? ''));
                const hasta = new Date(String(input.ends_at ?? ''));
                if (!Number.isFinite(desde.getTime()) || !Number.isFinite(hasta.getTime())) {
                    return { error: 'Las fechas deben venir en formato ISO 8601.' };
                }
                if (hasta <= desde) return { error: 'El fin de la reserva debe ser posterior al inicio.' };

                // El input llega tipado como Record<string, string>, pero el modelo
                // puede mandar un booleano real. Se aceptan las dos formas.
                const activado = (valor: unknown) => valor === true || valor === 'true';

                let query = supabaseAdmin
                    .from('parking_spots')
                    .select('id, label, floor_level, unit_label, description, vehicle_size, is_covered, has_ev_charger, hourly_rate, daily_rate, monthly_rate, min_hours')
                    .eq('community_id', communityId)
                    // 'published' es el estado real de un cupo publicado; los
                    // valores posibles son draft, pending_approval, published,
                    // paused y rejected. No existe 'approved'.
                    .eq('status', 'published');
                if (activado(input.covered_only)) query = query.eq('is_covered', true);
                if (activado(input.needs_ev_charger)) query = query.eq('has_ev_charger', true);

                const { data: spots, error } = await query.limit(50);
                if (error) return { error: 'No se pudieron consultar los estacionamientos.' };
                if (!spots?.length) return { disponibles: [], nota: 'La comunidad todavia no tiene estacionamientos publicados.' };

                // Descartar los que ya estan tomados en ese rango: dos reservas se
                // solapan si cada una empieza antes de que termine la otra.
                const { data: ocupadas } = await supabaseAdmin
                    .from('parking_bookings')
                    .select('spot_id')
                    .eq('community_id', communityId)
                    .neq('status', 'cancelled')
                    .lt('starts_at', hasta.toISOString())
                    .gt('ends_at', desde.toISOString());

                const tomados = new Set((ocupadas ?? []).map(b => String(b.spot_id)));
                const libres = spots.filter(s => !tomados.has(String(s.id)));
                // 22-11-2026: la reserva exige que el horario caiga dentro de la
                // disponibilidad que publicó el dueño (parking_windows_cover_range).
                // Sin este filtro la búsqueda ofrecía cupos que después no se podían reservar.
                const cubre = await Promise.all(libres.map(async spot => {
                    const { data: ok } = await supabaseAdmin.rpc('parking_windows_cover_range', {
                        p_spot_id: spot.id, p_starts_at: desde.toISOString(), p_ends_at: hasta.toISOString(),
                    });
                    return ok === true;
                }));
                const disponibles = libres.filter((_, index) => cubre[index]);
                const sinHorario = libres.length - disponibles.length;

                return {
                    desde: desde.toISOString(),
                    hasta: hasta.toISOString(),
                    disponibles,
                    total_publicados: spots.length,
                    nota: disponibles.length > 0
                        ? undefined
                        : sinHorario > 0
                            ? 'Hay estacionamientos publicados, pero ninguno tiene disponibilidad publicada para ese horario. Prueba otro horario o pide al dueño que publique su disponibilidad.'
                            : 'Hay estacionamientos en la comunidad, pero todos estan reservados en ese horario.',
                };
            }

            case 'get_my_storage': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificar al residente.');
                return myStorageForResident(supabaseAdmin, communityId, userCtx.user_id);
            }

            case 'search_storage': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificar al residente.');
                const period = validStoragePeriod(input.starts_on, input.months);
                if ('error' in period) return period;
                return searchStorageForResident(supabaseAdmin, communityId, userCtx.user_id, period.startsOn, period.months);
            }

            case 'rent_storage': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificar al residente.');
                if (!isUuid(String(input.storage_id ?? ''))) return { error: 'Necesito el storage_id que devuelve search_storage.' };
                const period = validStoragePeriod(input.starts_on, input.months);
                if ('error' in period) return period;
                return rentStorageForResident(
                    supabaseAdmin, communityId, userCtx.user_id, String(input.storage_id), period.startsOn, period.months,
                );
            }

            case 'book_parking': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                if (!userCtx.user_id) return forbidden('No pude identificar al residente.');
                if (!isUuid(String(input.spot_id ?? ''))) return { error: 'Necesito el spot_id que devuelve search_parking.' };

                const desde = new Date(String(input.starts_at ?? ''));
                const hasta = new Date(String(input.ends_at ?? ''));
                if (!Number.isFinite(desde.getTime()) || !Number.isFinite(hasta.getTime())) {
                    return { error: 'Las fechas deben venir en formato ISO 8601.' };
                }

                // El cupo tiene que ser de la comunidad del residente. La funcion
                // de base lo revalida, pero comprobarlo aqui evita filtrar por
                // error la existencia de cupos de otros condominios.
                const { data: spot } = await supabaseAdmin
                    .from('parking_spots')
                    .select('label, community_id')
                    .eq('id', String(input.spot_id))
                    .maybeSingle();
                if (!spot || spot.community_id !== communityId) {
                    return { error: 'Ese estacionamiento no existe en tu comunidad.' };
                }

                const { data: bookingId, error } = await supabaseAdmin.rpc('coco_create_parking_booking', {
                    p_user_id: userCtx.user_id,
                    p_spot_id: String(input.spot_id),
                    p_starts_at: desde.toISOString(),
                    p_ends_at: hasta.toISOString(),
                });

                if (error) {
                    // Los mensajes de la funcion ya estan escritos para el
                    // residente ("Registra tu vehiculo antes de reservar",
                    // "La reserva minima es de N horas"), asi que se devuelven
                    // tal cual en vez de un error generico.
                    return { error: error.message || 'No se pudo crear la reserva.' };
                }

                const { data: creada } = await supabaseAdmin
                    .from('parking_bookings')
                    .select('starts_at, ends_at, total_amount, access_code, status')
                    .eq('id', String(bookingId))
                    .maybeSingle();

                // El cobro lo abrió la base en el mismo INSERT de la reserva (y,
                // con el método por defecto, ya lo cargó a gastos comunes). Aquí
                // solo se resuelve el caso Haulmer y se lee el estado para que
                // CoCo se lo diga al residente. Si falla, la reserva sigue en pie.
                let cobro: Record<string, unknown> | undefined;
                try {
                    const processed = await processParkingCharge(
                        supabaseAdmin as unknown as ParkingChargesDb,
                        String(bookingId),
                    );
                    if (processed.charge) {
                        cobro = {
                            monto: processed.charge.amount,
                            estado: processed.charge.status,
                            detalle: describeParkingCharge(processed.charge),
                            link_pago: processed.checkoutUrl ?? undefined,
                            cancelacion: 'Sin costo si se cancela con la anticipación que fija la comunidad (2 h por defecto); después el cobro se mantiene.',
                        };
                    }
                } catch {
                    cobro = undefined;
                }

                return {
                    reserva_id: bookingId,
                    estacionamiento: spot.label,
                    ...(creada ?? {}),
                    cobro,
                    donde_verla: '/estacionamientos',
                };
            }

            case 'extend_parking_booking':
            case 'set_my_spot_availability':
            case 'rate_parking_booking': {
                if (!userCtx.user_id) return forbidden('No pude identificar al residente.');
                const run = { extend_parking_booking: extendParkingBooking, set_my_spot_availability: setMySpotAvailability, rate_parking_booking: rateParkingBooking }[name];
                return run(supabaseAdmin, userCtx.user_id, input as Record<string, unknown>);
            }

            case 'list_parking_access_requests':
            case 'review_parking_access': {
                if (!isAdmin(userCtx)) return { error: 'Solo la administración resuelve el acceso de conductores externos.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar tu comunidad.');
                if (name === 'list_parking_access_requests') return listParkingAccessRequests(supabaseAdmin, communityId);
                return reviewParkingAccess(supabaseAdmin, userCtx.user_id, input as Record<string, unknown>);
            }

            case 'list_my_listings':
            case 'update_my_listing':
            case 'set_my_listing_status':
            case 'remove_my_listing': {
                if (!userCtx.user_id) return forbidden('No pude identificar al residente.');
                const run = { list_my_listings: listMyListings, update_my_listing: updateMyListing, set_my_listing_status: setMyListingStatus, remove_my_listing: removeMyListing }[name];
                return run(supabaseAdmin, userCtx.user_id, input as Record<string, unknown>);
            }

            case 'publish_my_parking_spot':
            case 'publish_my_storage_unit': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificar al residente.');
                const publish = name === 'publish_my_parking_spot' ? publishParkingSpotForUser : publishStorageUnitForUser;
                return publish(supabaseAdmin, communityId, userCtx.user_id, input as Record<string, unknown>);
            }

            case 'cancel_reservation':
            case 'cancel_parking_booking':
            case 'cancel_storage_rental':
            case 'update_marketplace_item': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificar al residente.');
                const run = {
                    cancel_reservation: cancelReservationForUser,
                    cancel_parking_booking: cancelParkingBookingForUser,
                    cancel_storage_rental: cancelStorageRentalForUser,
                    update_marketplace_item: updateMarketplaceItemForUser,
                }[name];
                return run(supabaseAdmin, communityId, userCtx.user_id, input as Record<string, unknown>);
            }

            case 'create_reservation': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad del residente.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad asociada a la reserva.');
                if (!userCtx.user_id) return forbidden('No se pudo identificar al usuario para crear la reserva.');
                if (!isIsoDate(input.date) || input.date < new Date().toISOString().slice(0, 10)) {
                    return { error: 'La reserva requiere una fecha valida, igual o posterior a hoy.' };
                }
                if (!isTime(input.start_time) || !isTime(input.end_time) || input.start_time >= input.end_time) {
                    return { error: 'El horario debe ser valido y la hora de termino posterior al inicio.' };
                }
                const { data: amenity, error: amenityError } = await supabaseAdmin
                    .from('amenities')
                    .select('id, name')
                    .eq('community_id', communityId)
                    .eq('is_active', true)
                    .ilike('name', `%${input.space_name}%`)
                    .limit(1)
                    .maybeSingle();
                if (amenityError) return { error: 'No se pudo consultar el espacio comun.' };
                if (!amenity) return { error: `No se encontró el espacio "${input.space_name}"` };
                const { data: conflict, error: conflictError } = await supabaseAdmin
                    .from('bookings')
                    .select('id')
                    .eq('community_id', communityId)
                    .eq('amenity_id', amenity.id)
                    .eq('date', input.date)
                    .neq('status', 'cancelled')
                    .lt('start_time', input.end_time)
                    .gt('end_time', input.start_time)
                    .limit(1);
                if (conflictError) return { error: 'No se pudo validar la disponibilidad del horario.' };
                if (conflict?.length) return { error: 'Ese horario ya esta ocupado. Elige otro bloque.' };
                const { data, error } = await supabaseAdmin.rpc('coco_create_booking', {
                    p_community_id: communityId,
                    p_amenity_id: amenity.id,
                    p_user_id: userCtx.user_id,
                    p_date: input.date,
                    p_start_time: input.start_time,
                    p_end_time: input.end_time,
                });
                if (error) return { error: 'No se pudo crear la reserva. Puede que ese horario ya esté ocupado.' };
                return { success: true, booking_id: String(data), message: `Reserva de ${amenity.name} confirmada.` };
            }

            case 'list_pending_listings':
            case 'review_listing':
            case 'review_group_order': {
                if (!isAdmin(userCtx)) return { error: 'Solo la administración aprueba publicaciones y compras comunitarias.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar tu comunidad.');
                const actor = { id: userCtx.user_id, role: userCtx.role || 'admin', communityId, name: userCtx.name || null };
                if (name === 'list_pending_listings') return listPendingListings(supabaseAdmin, communityId);
                if (name === 'review_listing') return reviewListingForAdmin(supabaseAdmin, actor, input as Record<string, unknown>);
                return reviewGroupOrderForAdmin(actor, input as Record<string, unknown>);
            }

            case 'list_pending_bookings': {
                if (!isAdmin(userCtx)) return forbidden('Solo los administradores pueden ver las reservas por decidir.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const { data, error } = await supabaseAdmin
                    .from('bookings')
                    .select('id, date, start_time, end_time, status, amenities(name)')
                    .eq('community_id', communityId)
                    .in('status', ['pending', 'confirmed'])
                    .order('date', { ascending: true })
                    .limit(30);
                if (error) return { error: 'No pude leer las reservas.' };
                return { bookings: data || [] };
            }

            case 'decide_booking': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden decidir una reserva.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const decision = input.decision === 'approve' ? 'approve' : input.decision === 'reject' ? 'reject' : null;
                if (!decision) return { error: 'La decisión tiene que ser approve o reject.' };
                const { data: current, error: readError } = await supabaseAdmin
                    .from('bookings')
                    .select('id, status')
                    .eq('id', input.booking_id || '')
                    .eq('community_id', communityId)
                    .maybeSingle();
                if (readError || !current) return { error: 'No encontré esa reserva en tu comunidad.' };
                const next = nextBookingStatus(String(current.status), decision);
                if (!next) return { error: 'Esa reserva ya no se puede cambiar de esa forma.' };
                const { data: updated, error } = await supabaseAdmin
                    .from('bookings')
                    .update({ status: next })
                    .eq('id', current.id)
                    .eq('community_id', communityId)
                    .eq('status', current.status)
                    .select('id')
                    .maybeSingle();
                if (error || !updated) return { error: 'No pude actualizar la reserva. Vuelve a mirarla.' };
                return {
                    success: true,
                    booking_id: updated.id,
                    message: next === 'confirmed' ? 'Reserva confirmada.' : 'Reserva anulada.',
                };
            }

            default:
                return NOT_HANDLED;
        }
}
