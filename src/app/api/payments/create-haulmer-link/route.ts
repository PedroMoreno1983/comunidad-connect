import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { HaulmerService } from '@/lib/services/haulmer';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { PUBLIC_SITE_URL } from '@/lib/config';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
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

class PaymentRequestError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) {
        super(message);
    }
}

type PaymentProfile = {
    id: string;
    name?: string | null;
    email?: string | null;
    unit_id?: string | null;
    community_id?: string | null;
};

type PaymentTarget = {
    type: 'expense' | 'marketplace';
    recordId: string;
    reference: string;
    amount: number;
    description: string;
    contributionAmount: number;
    communityId: string;
    unitId?: string;
};

function parseMoney(value: unknown): number {
    const amount = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(amount) ? Math.round(amount) : 0;
}

async function resolvePaymentTarget(
    reference: string,
    requestedAmount: number,
    body: Record<string, unknown>,
    profile: PaymentProfile,
): Promise<PaymentTarget> {
    const [rawType, ...rest] = reference.split('_');
    const recordId = rest.join('_');
    const type = rawType.toUpperCase();

    if (!recordId) {
        throw new PaymentRequestError('Referencia de pago invalida.', 400, 'INVALID_REFERENCE');
    }

    if (type === 'EXP' || type === 'FEE') {
        if (!profile.unit_id || !profile.community_id) {
            throw new PaymentRequestError('Tu perfil no tiene una unidad y comunidad asociadas.', 409, 'PROFILE_WITHOUT_UNIT');
        }

        const { data: expense, error } = await supabaseAdmin
            .from('expenses')
            .select('id,unit_id,community_id,amount,status,month')
            .eq('id', recordId)
            .maybeSingle();

        if (error) throw error;
        if (!expense || expense.unit_id !== profile.unit_id || expense.community_id !== profile.community_id) {
            throw new PaymentRequestError('El cobro no pertenece a tu unidad.', 403, 'EXPENSE_NOT_OWNED');
        }
        if (expense.status === 'paid') {
            throw new PaymentRequestError('Este gasto comun ya figura pagado.', 409, 'EXPENSE_ALREADY_PAID');
        }

        const expenseAmount = Math.round(Number(expense.amount || 0));
        const contributionAmount = parseMoney(body.extraContribution);
        if (expenseAmount <= 0) {
            throw new PaymentRequestError('El cobro no tiene un monto valido.', 409, 'INVALID_EXPENSE_AMOUNT');
        }
        if (contributionAmount < 0 || contributionAmount > 50_000) {
            throw new PaymentRequestError('El aporte adicional esta fuera del rango permitido.', 400, 'INVALID_CONTRIBUTION');
        }

        const authoritativeAmount = expenseAmount + contributionAmount;
        if (Math.abs(requestedAmount - authoritativeAmount) > 1) {
            throw new PaymentRequestError('El monto del cobro cambio. Actualiza la pagina antes de pagar.', 409, 'AMOUNT_CHANGED');
        }

        return {
            type: 'expense',
            recordId: expense.id,
            reference: `EXP_${expense.id}`,
            amount: authoritativeAmount,
            description: `Gastos comunes ${expense.month || 'periodo vigente'}`,
            contributionAmount,
            communityId: expense.community_id,
            unitId: expense.unit_id,
        };
    }

    if (type === 'MARKET') {
        if (!profile.community_id) {
            throw new PaymentRequestError('Tu perfil no tiene una comunidad asociada.', 409, 'PROFILE_WITHOUT_COMMUNITY');
        }

        const { data: item, error } = await supabaseAdmin
            .from('marketplace_items')
            .select('id,title,price,status,seller_id,community_id')
            .eq('id', recordId)
            .maybeSingle();

        if (error) throw error;
        if (!item || item.community_id !== profile.community_id || item.status !== 'available') {
            throw new PaymentRequestError('El articulo ya no esta disponible en tu comunidad.', 409, 'ITEM_NOT_AVAILABLE');
        }
        if (item.seller_id === profile.id) {
            throw new PaymentRequestError('No puedes comprar tu propia publicacion.', 409, 'SELF_PURCHASE');
        }

        const price = Math.round(Number(item.price || 0));
        if (price <= 0 || Math.abs(requestedAmount - price) > 1) {
            throw new PaymentRequestError('El precio del articulo cambio. Actualiza la pagina.', 409, 'AMOUNT_CHANGED');
        }

        return {
            type: 'marketplace',
            recordId: item.id,
            reference: `MARKET_${item.id}`,
            amount: price,
            description: `Compra en Marketplace: ${sanitize(item.title, 120)}`,
            contributionAmount: 0,
            communityId: item.community_id,
        };
    }

    throw new PaymentRequestError(
        'Este flujo todavia no tiene una orden comercial trazable. No se genero ningun cobro.',
        409,
        'UNTRACKED_PAYMENT_FLOW',
    );
}

async function markPaymentAttempt(
    target: PaymentTarget,
    amount: number,
    token: string,
    feeCalculation?: HaulmerFeeCalculation | null,
) {
    const metadata = {
        processor: 'haulmer_tuu',
        payment_reference: target.reference,
        payment_token: token,
        amount,
        base_amount: target.amount,
        contribution_amount: target.contributionAmount,
        service_fee: feeCalculation?.totalFee ?? 0,
        service_fee_net: feeCalculation?.netFee ?? 0,
        service_fee_vat: feeCalculation?.vat ?? 0,
        service_fee_mode: feeCalculation?.feeMode ?? null,
        service_fee_range: feeCalculation?.range.label ?? null,
        status: 'pending',
        created_at: new Date().toISOString(),
    };

    if (target.type === 'expense') {
        const { error } = await supabaseAdmin
            .from('expenses')
            .update({ payment_metadata: metadata })
            .eq('id', target.recordId)
            .eq('unit_id', target.unitId || '')
            .eq('community_id', target.communityId)
            .neq('status', 'paid');

        if (error) console.warn('[payments/create-haulmer-link] Could not mark expense payment attempt:', error.message);
        return;
    }

    if (target.type === 'marketplace') {
        const { error } = await supabaseAdmin
            .from('marketplace_items')
            .update({ payment_status: 'pending' })
            .eq('id', target.recordId)
            .eq('community_id', target.communityId)
            .eq('status', 'available');

        if (error) console.warn('[payments/create-haulmer-link] Could not mark marketplace payment attempt:', error.message);
    }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'payments.create_link', { limit: 20, windowMs: 60_000 });
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
        const amount = parseMoney(body.amount);
        const reference = sanitize(body.reference, 100);
        const returnUrl = sanitize(body.returnUrl, 300);

        if (!amount || Number.isNaN(amount) || amount <= 0 || amount > 100_000_000) {
            return NextResponse.json({ error: 'Monto invalido o fuera de rango.' }, { status: 400 });
        }
        if (!reference) {
            return NextResponse.json({ error: 'Se requiere una referencia de pago.' }, { status: 400 });
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id,name,email,unit_id,community_id')
            .eq('id', user.id)
            .maybeSingle();
        if (profileError) throw profileError;
        if (!profile) {
            return NextResponse.json({ error: 'Perfil no encontrado.' }, { status: 403 });
        }

        const target = await resolvePaymentTarget(reference, amount, body, profile);
        const includeServiceFee = target.type === 'expense' && body.includeServiceFee === true;
        const clientName = sanitize(profile.name, 100) || 'Residente';
        const clientEmail = sanitize(profile.email || user.email, 150);
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        if (!emailRegex.test(clientEmail)) {
            return NextResponse.json({ error: 'Email del cliente invalido.' }, { status: 400 });
        }

        const rawSafeReturnUrl = returnUrl && isAllowedReturnUrl(returnUrl)
            ? returnUrl
            : `${PUBLIC_SITE_URL}/home`;
        const parsedReturnUrl = new URL(rawSafeReturnUrl);
        parsedReturnUrl.searchParams.delete('status');
        parsedReturnUrl.searchParams.delete('amount');
        parsedReturnUrl.searchParams.set('payment', 'return');
        parsedReturnUrl.searchParams.set(target.type === 'expense' ? 'expenseId' : 'itemId', target.recordId);
        const safeReturnUrl = parsedReturnUrl.toString();

        const feeCalculation = includeServiceFee ? calculateHaulmerServiceFee(target.amount) : null;
        const payableAmount = feeCalculation?.totalWithFee ?? target.amount;

        if (payableAmount <= 0 || payableAmount > 100_000_000) {
            return NextResponse.json({ error: 'Monto final invalido o fuera de rango.' }, { status: 400 });
        }

        const response = await HaulmerService.createPaymentLink({
            amount: payableAmount,
            description: target.description,
            reference: target.reference,
            client: { name: clientName, email: clientEmail },
            returnUrl: safeReturnUrl,
        });

        await markPaymentAttempt(target, payableAmount, response.token, feeCalculation);

        return NextResponse.json({
            url: response.url,
            reference: response.reference,
            amount: payableAmount,
            baseAmount: target.amount,
            serviceFee: feeCalculation?.totalFee ?? 0,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error generating Haulmer link';
        console.error('[payments/create-haulmer-link] Haulmer Gateway Error:', error);

        if (error instanceof PaymentRequestError) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
        }

        if (message.includes('Haulmer/Tuu no esta configurado')) {
            return NextResponse.json({
                error: 'Los pagos en línea todavía no están habilitados para tu comunidad. Contacta a administración.',
                code: 'PAYMENT_NOT_CONFIGURED',
            }, { status: 503 });
        }

        return NextResponse.json({
            error: 'No se pudo iniciar el pago. Inténtalo nuevamente.',
            code: 'PAYMENT_PROVIDER_ERROR',
        }, { status: 502 });
    }
}
