import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { signHaulmerParams } from '@/lib/services/haulmer';
import crypto from 'crypto';

type CallbackParams = Record<string, string>;

function parseCallbackBody(rawBody: string, contentType: string | null): CallbackParams {
    if (contentType?.includes('application/json')) {
        const parsed = JSON.parse(rawBody) as Record<string, unknown>;
        return Object.fromEntries(
            Object.entries(parsed).map(([key, value]) => [key, typeof value === 'string' ? value : String(value ?? '')])
        );
    }

    const params = new URLSearchParams(rawBody);
    return Object.fromEntries(params.entries());
}

function verifyCallbackSignature(params: CallbackParams, secretKey: string): boolean {
    const providedSignature = params.x_signature;
    if (!providedSignature) return false;

    const expectedSignature = signHaulmerParams(params, secretKey);
    const provided = Buffer.from(providedSignature, 'utf8');
    const expected = Buffer.from(expectedSignature, 'utf8');

    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function buildPaymentMetadata(params: CallbackParams) {
    return {
        processor: 'haulmer_tuu',
        payment_reference: params.x_reference,
        account_id: params.x_account_id,
        amount: Number(params.x_amount || 0),
        currency: params.x_currency || 'CLP',
        result: params.x_result,
        message: params.x_message || null,
        gateway_reference: params.x_gateway_reference || null,
        timestamp: params.x_timestamp || null,
        callback_received_at: new Date().toISOString(),
    };
}

async function processExpensePayment(recordId: string, params: CallbackParams, completed: boolean) {
    const { data: expense, error: readError } = await supabaseAdmin
        .from('expenses')
        .select('id,status')
        .eq('id', recordId)
        .maybeSingle();

    if (readError) throw readError;
    if (!expense) return { status: 'unknown_reference' };
    if (expense.status === 'paid') return { status: 'idempotent' };

    const metadata = buildPaymentMetadata(params);
    const update = completed
        ? { status: 'paid', paid_at: new Date().toISOString(), payment_metadata: metadata }
        : { payment_metadata: metadata };

    const { error } = await supabaseAdmin
        .from('expenses')
        .update(update)
        .eq('id', recordId);

    if (error) throw error;
    return { status: completed ? 'processed' : 'recorded' };
}

async function processMarketplacePayment(recordId: string, params: CallbackParams, completed: boolean) {
    const { data: item, error: readError } = await supabaseAdmin
        .from('marketplace_items')
        .select('id,status,payment_status')
        .eq('id', recordId)
        .maybeSingle();

    if (readError) throw readError;
    if (!item) return { status: 'unknown_reference' };
    if (item.payment_status === 'completed') return { status: 'idempotent' };

    const update = completed
        ? { status: 'sold', payment_status: 'completed' }
        : { payment_status: params.x_result === 'pending' ? 'pending' : 'none' };

    const { error } = await supabaseAdmin
        .from('marketplace_items')
        .update(update)
        .eq('id', recordId);

    if (error) throw error;
    return { status: completed ? 'processed' : 'recorded' };
}

export async function POST(req: Request) {
    const limited = enforceRateLimit(req, 'webhooks.haulmer', { limit: 180, windowMs: 60_000 });
    if (limited) return limited;

    const secretKey = process.env.HAULMER_SECRET_KEY?.trim() || process.env.HAULMER_WEBHOOK_SECRET?.trim();
    if (!secretKey) {
        console.error('[Haulmer] HAULMER_SECRET_KEY env var not set');
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    try {
        const rawBody = await req.text();
        const params = parseCallbackBody(rawBody, req.headers.get('content-type'));

        if (!verifyCallbackSignature(params, secretKey)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const configuredAccountId = process.env.HAULMER_ACCOUNT_ID?.trim();
        if (configuredAccountId && params.x_account_id !== configuredAccountId) {
            return NextResponse.json({ error: 'Invalid account id' }, { status: 401 });
        }

        const reference = params.x_reference;
        if (!reference) {
            return NextResponse.json({ error: 'Missing x_reference' }, { status: 400 });
        }

        const [type, ...rest] = reference.split('_');
        const recordId = rest.join('_');
        const completed = params.x_result === 'completed';

        let result: { status: string };
        if ((type === 'EXP' || type === 'FEE') && recordId) {
            result = await processExpensePayment(recordId, params, completed);
        } else if (type === 'MARKET' && recordId) {
            result = await processMarketplacePayment(recordId, params, completed);
        } else {
            result = { status: 'ignored' };
        }

        return NextResponse.json({ received: true, status: result.status });
    } catch (error) {
        console.error('[Haulmer] Webhook processing failed:', error);
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
}
