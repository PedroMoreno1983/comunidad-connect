import { NextResponse } from 'next/server';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { processParkingCharge, type ParkingChargesDb } from '@/lib/payments/parkingCharges';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resuelve el cobro de una reserva recién creada: link de Haulmer si la
 * comunidad lo eligió y el servidor lo tiene habilitado, o cargo a gastos
 * comunes como respaldo.
 *
 * Solo recibe el id de la reserva. Cualquier monto que mande el cliente se
 * ignora: el monto vive en parking_charges y lo calculó la base.
 */
export async function POST(req: Request) {
    const limited = await enforceDistributedRateLimit(req, 'parking.charges.process', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    const supabaseUser = await getSupabaseUserClient();
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    let bookingId = '';
    try {
        const body = await req.json() as { bookingId?: unknown };
        bookingId = typeof body.bookingId === 'string' ? body.bookingId.trim() : '';
    } catch {
        bookingId = '';
    }
    if (!UUID_PATTERN.test(bookingId)) {
        return NextResponse.json({ error: 'Indica una reserva válida.' }, { status: 400 });
    }

    // Solo el conductor de la reserva o la administración de su comunidad.
    const { data: booking } = await supabaseAdmin
        .from('parking_bookings')
        .select('id, community_id, driver_id, parking_drivers(user_id)')
        .eq('id', bookingId)
        .maybeSingle();
    if (!booking) return NextResponse.json({ error: 'La reserva no existe.' }, { status: 404 });

    const driver = Array.isArray(booking.parking_drivers) ? booking.parking_drivers[0] : booking.parking_drivers;
    let allowed = (driver as { user_id?: string } | null)?.user_id === user.id;
    if (!allowed) {
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('role, community_id')
            .eq('id', user.id)
            .maybeSingle();
        allowed = profile?.role === 'admin' && profile.community_id === booking.community_id;
    }
    if (!allowed) return NextResponse.json({ error: 'No puedes gestionar el cobro de esta reserva.' }, { status: 403 });

    try {
        const result = await processParkingCharge(supabaseAdmin as unknown as ParkingChargesDb, bookingId);
        return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[parking/charges/process]', error);
        return NextResponse.json({ error: 'No se pudo procesar el cobro de la reserva.' }, { status: 500 });
    }
}
