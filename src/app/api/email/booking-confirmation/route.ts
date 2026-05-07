import { NextRequest, NextResponse } from 'next/server';
import { sendBookingConfirmation } from '@/lib/email';

function clean(value: unknown, max = 200) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(req: NextRequest) {
    try {
        if (!process.env.RESEND_API_KEY) {
            return NextResponse.json({ ok: true, skipped: true, reason: 'RESEND_API_KEY missing' });
        }

        const body = await req.json();
        const to = clean(body.to, 320);
        const residentName = clean(body.residentName, 120) || 'Residente';
        const amenityName = clean(body.amenityName, 120) || 'Instalacion';
        const date = clean(body.date, 30);
        const startTime = clean(body.startTime, 20);
        const endTime = clean(body.endTime, 20);

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
            return NextResponse.json({ error: error.message }, { status: 502 });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
