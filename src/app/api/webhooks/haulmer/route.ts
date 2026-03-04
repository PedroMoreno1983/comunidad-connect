import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log("🔔 Haulmer Webhook Received:", body);

        // Seguridad: Idealmente aquí validaríamos la firma del webhook con un secret
        // Pero para el propósito de MVP/Mock validamos el tipo de evento:
        if (body.event === 'payment.success' || body.status === 'paid') {
            const data = body.data || body;
            const external_id = data.external_id || data.payment_id;

            if (!external_id) {
                return NextResponse.json({ error: 'Missing external_id reference' }, { status: 400 });
            }

            console.log(`✅ Procesando pago exitoso para Ref: ${external_id}`);

            // Parse external_id
            // En nuestra app, external_id lo armaremos como: "TYPE_ID" (ej: "MARKET_123", "FEE_456")
            const [type, recordId] = external_id.split('_');

            if (type === 'FEE') {
                // Actualizar Gasto Común en base de datos
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
                // Actualizar Marketplace Order
                const { error } = await supabaseAdmin
                    .from('marketplace')
                    .update({
                        status: 'sold',
                    })
                    .eq('id', recordId);

                // TODO: Notificar al vendedor aquí
                if (error) throw error;
            } else {
                console.log("Tipo de pago no reconocido/no requiere update:", type);
            }

            return NextResponse.json({ received: true, status: 'processed' });
        }

        return NextResponse.json({ received: true, status: 'ignored' });

    } catch (error) {
        console.error("Haulmer Webhook Error:", error);
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
}
