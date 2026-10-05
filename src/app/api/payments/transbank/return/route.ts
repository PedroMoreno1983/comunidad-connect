import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { PUBLIC_SITE_URL } from '@/lib/config';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { todayInChile } from '@/lib/finance/chileDates';
import { recordOnlineExpensePayment } from '@/lib/payments/recordOnlineExpensePayment';
import { commitTransbankTransaction, isTransbankAuthorized, parseTransbankSession } from '@/lib/payments/transbank';

export const runtime = 'nodejs';

function redirectTo(url: string, params: Record<string, string>) {
    const target = new URL(url);
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
    return NextResponse.redirect(target);
}

function fallbackUrl() {
    return `${PUBLIC_SITE_URL}/expenses`;
}

async function handleReturn(token: string | null, aborted: boolean) {
    if (aborted || !token) {
        return redirectTo(fallbackUrl(), { payment: 'cancelled' });
    }

    const commit = await commitTransbankTransaction(token);
    const session = parseTransbankSession(commit.sessionId);
    if (!session) {
        return redirectTo(fallbackUrl(), { payment: 'failed' });
    }

    if (session.type === 'expense') {
        const { data: expense, error } = await supabaseAdmin
            .from('expenses')
            .select('id, status, amount, unit_id, community_id, payment_metadata')
            .eq('id', session.recordId)
            .maybeSingle();
        if (error) throw error;
        if (!expense) return redirectTo(fallbackUrl(), { payment: 'failed' });

        const metadata = expense.payment_metadata && typeof expense.payment_metadata === 'object'
            ? expense.payment_metadata as Record<string, unknown>
            : {};
        const appReturn = typeof metadata.app_return_url === 'string' && metadata.app_return_url
            ? metadata.app_return_url
            : fallbackUrl();
        const expected = Math.round(Number(metadata.amount || expense.amount || 0));
        const authorized = isTransbankAuthorized(commit) && expected > 0 && Math.abs(commit.amount - expected) <= 1;

        if (!authorized) {
            return redirectTo(appReturn, { payment: 'failed', expenseId: expense.id });
        }

        if (expense.status !== 'paid') {
            const { error: updateError } = await supabaseAdmin
                .from('expenses')
                .update({
                    status: 'paid',
                    paid_at: new Date().toISOString(),
                    payment_metadata: {
                        ...metadata,
                        processor: 'transbank_webpay',
                        status: 'completed',
                        authorization_code: commit.authorizationCode,
                        buy_order: commit.buyOrder,
                        committed_at: new Date().toISOString(),
                    },
                })
                .eq('id', expense.id);
            if (updateError) throw updateError;
        }

        await recordOnlineExpensePayment({
            communityId: String(expense.community_id),
            unitId: String(expense.unit_id),
            expenseId: expense.id,
            amount: Math.round(Number(expense.amount || 0)),
            reference: `transbank:${commit.buyOrder || token}`,
            paidAt: todayInChile(),
            processor: 'transbank_webpay',
        });

        return redirectTo(appReturn, { payment: 'return', expenseId: expense.id });
    }

    const { data: item, error } = await supabaseAdmin
        .from('marketplace_items')
        .select('id, status, payment_status, price, community_id')
        .eq('id', session.recordId)
        .maybeSingle();
    if (error) throw error;
    if (!item) return redirectTo(`${PUBLIC_SITE_URL}/marketplace`, { payment: 'failed' });

    const expected = Math.round(Number(item.price || 0));
    const authorized = isTransbankAuthorized(commit) && expected > 0 && Math.abs(commit.amount - expected) <= 1;
    const marketReturn = `${PUBLIC_SITE_URL}/marketplace`;
    if (!authorized) {
        return redirectTo(marketReturn, { payment: 'failed', itemId: item.id });
    }
    if (item.payment_status !== 'completed') {
        const { error: updateError } = await supabaseAdmin
            .from('marketplace_items')
            .update({ status: 'sold', payment_status: 'completed' })
            .eq('id', item.id);
        if (updateError) throw updateError;
    }
    return redirectTo(marketReturn, { payment: 'return', itemId: item.id });
}

export async function GET(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'payments.transbank.return', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const token = req.nextUrl.searchParams.get('token_ws');
    const aborted = Boolean(req.nextUrl.searchParams.get('TBK_TOKEN'));
    try {
        return await handleReturn(token, aborted);
    } catch (error) {
        console.error('[payments/transbank/return]', error);
        return redirectTo(fallbackUrl(), { payment: 'failed' });
    }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'payments.transbank.return', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const form = await req.formData().catch(() => null);
    const token = typeof form?.get('token_ws') === 'string' ? String(form.get('token_ws')) : req.nextUrl.searchParams.get('token_ws');
    const aborted = Boolean(form?.get('TBK_TOKEN') || req.nextUrl.searchParams.get('TBK_TOKEN'));
    try {
        return await handleReturn(token, aborted);
    } catch (error) {
        console.error('[payments/transbank/return]', error);
        return redirectTo(fallbackUrl(), { payment: 'failed' });
    }
}
