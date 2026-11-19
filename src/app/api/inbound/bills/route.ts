import { NextRequest, NextResponse } from 'next/server';
import { handleInboundEmail, verifySvixSignature } from '@/lib/finance/billsInbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Webhook de Resend (email.received): una boleta llegó a la dirección de una
 * comunidad. Se verifica la firma con RESEND_INBOUND_WEBHOOK_SECRET; sin
 * firma válida no se procesa nada.
 */
export async function POST(req: NextRequest) {
    const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET || '';
    if (!secret) return NextResponse.json({ error: 'Recepción de boletas no configurada.' }, { status: 503 });
    const body = await req.text();
    const valid = verifySvixSignature({
        secret, body,
        id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature'),
    });
    if (!valid) return NextResponse.json({ error: 'Firma inválida.' }, { status: 401 });
    try {
        const event = JSON.parse(body) as Parameters<typeof handleInboundEmail>[0];
        return NextResponse.json(await handleInboundEmail(event));
    } catch (error) {
        console.error('[inbound bills]', error);
        // 500: Resend reintenta; cada adjunto se procesa una sola vez.
        return NextResponse.json({ error: 'No se pudo procesar el correo.' }, { status: 500 });
    }
}
