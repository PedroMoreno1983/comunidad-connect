import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import crypto from 'crypto';

function verifyHaulmerSignature(body: string, signature: string | null, secret: string): boolean {
    if (!signature) return false;
    const expected = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(req: Request) {
    const rawBody = await req.text();
    const signature = req.headers.get('x-haulmer-signature') ?? req.headers.get('x-webhook-signature');
    const secret = process.env.HAULMER_WEBHOOK_SECRET;

    if (!secret) {
        console.error('[Haulmer] HAULMER_WEBHOOK_SECRET env var not set');
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    if (!verifyHaulmerSignature(rawBody, signature, secret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    try {
        const body = JSON.parse(rawBody);

        if (body.event === 'payment.success' || body.status === 'paid') {
            const data = body.data || body;
            const external_id = data.external_id || data.payment_id;

            if (!external_id) {
                return NextResponse.json({ error: 'Missing external_id reference' }, { status: 400 });
            }

            const [type, recordId] = external_id.split('_');

            if (type === 'FEE') {
                const { error } = await supabaseAdmin
                    .from('condo_fees')
                    .update({
                        status: 'paid',
                        paid_at: new Date().toISOString(),
                        payment_method: 'haulmer'
                    })
                    .eq('id', recordId);

                if (error) throw error;
            } else if (type === 'MARKET') {
                const { error } = await supabaseAdmin
                    .from('marketplace')
                    .update({ status: 'sold' })
                    .eq('id', recordId);

                if (error) throw error;
            }

            return NextResponse.json({ received: true, status: 'processed' });
        }

        return NextResponse.json({ received: true, status: 'ignored' });

    } catch (error) {
        console.error('[Haulmer] Webhook processing failed:', error);
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
}
