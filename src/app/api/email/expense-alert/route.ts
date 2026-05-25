import { NextRequest, NextResponse } from 'next/server';
import { sendExpenseAlert } from '@/lib/email';

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
        const month = clean(body.month, 30) || 'Este mes';
        const amount = Number(body.amount);
        const dueDate = clean(body.dueDate, 30);

        if (!to || isNaN(amount) || !dueDate) {
            return NextResponse.json({ error: 'Faltan datos obligatorios (to, amount, dueDate)' }, { status: 400 });
        }

        const { error } = await sendExpenseAlert({
            to,
            residentName,
            unitName,
            month,
            amount,
            dueDate,
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
