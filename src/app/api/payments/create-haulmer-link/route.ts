import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { HaulmerService } from '@/lib/services/haulmer';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { PUBLIC_SITE_URL } from '@/lib/config';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { calculateHaulmerServiceFee } from '@/lib/payments/haulmerFees';
import type { HaulmerFeeCalculation } from '@/lib/types';

const ALLOWED_ORIGINS = [
    PUBLIC_SITE_URL,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3011',
    'http://localhost:3018',
    'https://conviveconnect.com',
    'https://www.conviveconnect.com',
].filter(Boolean) as string[];

function isAllowedReturnUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return ALLOWED_ORIGINS.some(origin => parsed.origin === new URL(origin).origin);
    } catch {
        return false;
    }
}

function sanitize(value: unknown, maxLen: number): string {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLen);
}

async function markPaymentAttempt(
    reference: string,
    amount: number,
    token: string,
    feeCalculation?: HaulmerFeeCalculation | null,
) {
    const [type, recordId] = reference.split('_');
    const metadata = {
        processor: 'haulmer_tuu',
        payment_reference: reference,
        payment_token: token,
        amount,
        base_amount: feeCalculation?.baseAmount ?? amount,
        service_fee: feeCalculation?.totalFee ?? 0,
        service_fee_net: feeCalculation?.netFee ?? 0,
        service_fee_vat: feeCalculation?.vat ?? 0,
        service_fee_mode: feeCalculation?.feeMode ?? null,
        service_fee_range: feeCalculation?.range.label ?? null,
        status: 'pending',
        created_at: new Date().toISOString(),
    };

    if ((type === 'EXP' || type === 'FEE') && recordId) {
        const { error } = await supabaseAdmin
            .from('expenses')
            .update({ payment_metadata: metadata })
            .eq('id', recordId);

        if (error) console.warn('[payments/create-haulmer-link] Could not mark expense payment attempt:', error.message);
        return;
    }

    if (type === 'MARKET' && recordId) {
        const { error } = await supabaseAdmin
            .from('marketplace_items')
            .update({ payment_status: 'pending' })
            .eq('id', recordId);

        if (error) console.warn('[payments/create-haulmer-link] Could not mark marketplace payment attempt:', error.message);
    }
}

export async function POST(req: NextRequest) {
    const limited = enforceRateLimit(req, 'payments.create_link', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const cookieStore = await cookies();
        const supabaseUser = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
        );

        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await req.json() as Record<string, unknown>;
        const client = body.client && typeof body.client === 'object'
            ? body.client as Record<string, unknown>
            : null;

        const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount);
        const includeServiceFee = body.includeServiceFee === true;
        const description = sanitize(body.description, 200);
        const reference = sanitize(body.reference, 100);
        const returnUrl = sanitize(body.returnUrl, 300);

        if (!amount || Number.isNaN(amount) || amount <= 0 || amount > 100_000_000) {
            return NextResponse.json({ error: 'Monto invalido o fuera de rango.' }, { status: 400 });
        }
        if (!description) {
            return NextResponse.json({ error: 'Se requiere una descripcion del pago.' }, { status: 400 });
        }
        if (!reference) {
            return NextResponse.json({ error: 'Se requiere una referencia de pago.' }, { status: 400 });
        }
        if (!client || typeof client.name !== 'string' || typeof client.email !== 'string') {
            return NextResponse.json({ error: 'Datos del cliente invalidos.' }, { status: 400 });
        }

        const clientName = sanitize(client.name, 100);
        const clientEmail = sanitize(client.email, 150);
        const clientPhone = sanitize(client.phone, 30);
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        if (!emailRegex.test(clientEmail)) {
            return NextResponse.json({ error: 'Email del cliente invalido.' }, { status: 400 });
        }

        const safeReturnUrl = returnUrl && isAllowedReturnUrl(returnUrl)
            ? returnUrl
            : `${PUBLIC_SITE_URL}/home`;

        const feeCalculation = includeServiceFee ? calculateHaulmerServiceFee(amount) : null;
        const payableAmount = feeCalculation?.totalWithFee ?? Math.round(amount);

        if (payableAmount <= 0 || payableAmount > 100_000_000) {
            return NextResponse.json({ error: 'Monto final invalido o fuera de rango.' }, { status: 400 });
        }

        const response = await HaulmerService.createPaymentLink({
            amount: payableAmount,
            description,
            reference,
            client: { name: clientName, email: clientEmail, phone: clientPhone || undefined },
            returnUrl: safeReturnUrl,
        });

        await markPaymentAttempt(reference, payableAmount, response.token, feeCalculation);

        return NextResponse.json({
            url: response.url,
            reference: response.reference,
            token: response.token,
            amount: payableAmount,
            baseAmount: feeCalculation?.baseAmount ?? payableAmount,
            serviceFee: feeCalculation?.totalFee ?? 0,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error generating Haulmer link';
        console.error('[payments/create-haulmer-link] Haulmer Gateway Error:', error);

        if (message.includes('Haulmer/Tuu no esta configurado')) {
            return NextResponse.json({
                error: 'Los pagos en línea todavía no están habilitados para tu comunidad. Contacta a administración.',
                code: 'PAYMENT_NOT_CONFIGURED',
            }, { status: 503 });
        }

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
