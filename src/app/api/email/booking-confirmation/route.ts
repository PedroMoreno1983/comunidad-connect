import { NextRequest, NextResponse } from 'next/server';
import { sendBookingConfirmation } from '@/lib/email';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { apiErrorResponse } from '@/lib/observability/logger';

function clean(value: unknown, max = 200) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'email.booking_confirmation', { limit: 8, windowMs: 60_000 });
    if (limited) return limited;

    try {
        if (!process.env.RESEND_API_KEY) {
            return NextResponse.json({ ok: true, skipped: true, reason: 'RESEND_API_KEY missing' });
        }

        const profile = await getAuthenticatedAgentProfile();
        if (!profile?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await req.json() as Record<string, unknown>;
        const bookingId = clean(body.bookingId, 80);
        if (!bookingId) return NextResponse.json({ error: 'Falta bookingId' }, { status: 400 });

        const { data: booking } = await getSupabaseAdmin()
            .from('bookings')
            .select('date,start_time,end_time,amenities(name)')
            .eq('id', bookingId)
            .eq('user_id', profile.id)
            .maybeSingle();

        if (!booking) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

        const amenityRelation = booking.amenities as { name?: string } | Array<{ name?: string }> | null;
        const amenity = Array.isArray(amenityRelation) ? amenityRelation[0] : amenityRelation;
        const to = profile.email;
        const residentName = clean(profile.name, 120) || 'Residente';
        const amenityName = clean(amenity?.name, 120) || 'Instalación';
        const date = clean(booking.date, 30);
        const startTime = clean(booking.start_time, 20);
        const endTime = clean(booking.end_time, 20);

        if (!to || !date || !startTime || !endTime) {
            return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
        }

        const { error } = await sendBookingConfirmation({
            to,
            residentName,
            amenityName,
            date,
            startTime,
            endTime,
        });

        if (error) {
            return apiErrorResponse(req, '/api/email/booking-confirmation', error, {
                status: 502,
                publicMessage: 'No se pudo enviar la confirmación de reserva.',
            });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        return apiErrorResponse(req, '/api/email/booking-confirmation', error, {
            publicMessage: 'No se pudo enviar la confirmación de reserva.',
        });
    }
}
