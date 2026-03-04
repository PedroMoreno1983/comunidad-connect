import { NextResponse } from 'next/server';
import { HaulmerService } from '@/lib/services/haulmer';

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // Payload validation
        if (!body.amount || !body.description || !body.reference || !body.client) {
            return NextResponse.json({ error: 'Missing required payment fields' }, { status: 400 });
        }

        // Llamar a nuestro encapsulador de Haulmer
        const response = await HaulmerService.createPaymentLink({
            amount: body.amount,
            description: body.description,
            reference: body.reference,
            client: body.client,
            returnUrl: body.returnUrl || `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/home`
        });

        // Retornar la URL de Checkout generada por Haulmer
        return NextResponse.json({ url: response.url });

    } catch (error: any) {
        console.error("Haulmer Gateway Error:", error);
        return NextResponse.json({ error: error.message || 'Error generating Haulmer link' }, { status: 500 });
    }
}
