import { NextRequest, NextResponse } from 'next/server';
import { sendBookingConfirmation } from '@/lib/email';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { apiErrorResponse } from '@/lib/observability/logger';
import { insertCommunityNotification } from '@/lib/server/data/notifications';

function clean(value: unknown, max = 200) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'email.booking_confirmation', { limit: 8, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await req.json() as Record<string, unknown>;
        const bookingId = clean(body.bookingId, 80);
        if (!bookingId) return NextResponse.json({ error: 'Falta bookingId' }, { status: 400 });

        const supabaseAdmin = getSupabaseAdmin();
        const { data: booking } = await supabaseAdmin
            .from('bookings')
            .select('date,start_time,end_time,amenities(name)')
            .eq('id', bookingId)
            .eq('user_id', profile.id)
            .maybeSingle();

        if (!booking) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

        const amenityRelation = booking.amenities as { name?: string } | Array<{ name?: string }> | null;
        const amenity = Array.isArray(amenityRelation) ? amenityRelation[0] : amenityRelation;
        const to = profile.email || '';
        const residentName = clean(profile.name, 120) || 'Residente';
        const amenityName = clean(amenity?.name, 120) || 'Instalación';
        const date = clean(booking.date, 30);
        const startTime = clean(booking.start_time, 20);
        const endTime = clean(booking.end_time, 20);

        if (!date || !startTime || !endTime) {
            return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
        }

        const notificationLink = `/amenities?booking=${encodeURIComponent(bookingId)}`;
        const { data: existingNotifications, error: notificationLookupError } = await supabaseAdmin
            .from('notifications')
            .select('id')
            .eq('user_id', profile.id)
            .eq('category', 'amenity_booking')
            .eq('link', notificationLink)
            .limit(1);

        if (notificationLookupError) {
            return apiErrorResponse(req, '/api/email/booking-confirmation', notificationLookupError, {
                publicMessage: 'No se pudo crear el comprobante de reserva.',
            });
        }

        if (!existingNotifications?.length) {
            const { error: notificationError } = await insertCommunityNotification(supabaseAdmin, {
                userId: profile.id,
                type: 'success',
                category: 'amenity_booking',
                title: 'Reserva confirmada',
                body: `${amenityName}: ${date}, de ${startTime} a ${endTime}. Comprobante ${bookingId.slice(0, 8).toUpperCase()}.`,
                link: notificationLink,
                communityId: profile.community_id,
            });

            if (notificationError) {
                return apiErrorResponse(req, '/api/email/booking-confirmation', notificationError, {
                    publicMessage: 'No se pudo crear el comprobante de reserva.',
                });
            }
        }

        if (!process.env.RESEND_API_KEY || !to) {
            return NextResponse.json({ ok: true, notificationCreated: true, emailSkipped: true });
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
