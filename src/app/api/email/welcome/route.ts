import { NextRequest, NextResponse } from 'next/server';
import { sendWelcomeEmail } from '@/lib/email';

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
        const unitName = clean(body.unitName, 50) || 'Unidad';
        const condoName = clean(body.condoName, 120) || 'Convive Connect';
        const temporaryPassword = clean(body.temporaryPassword, 100);

        if (!to) {
            return NextResponse.json({ error: 'Falta email de destino (to)' }, { status: 400 });
        }

        const { error } = await sendWelcomeEmail({
            to,
            residentName,
            unitName,
            condoName,
            temporaryPassword: temporaryPassword || undefined,
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
