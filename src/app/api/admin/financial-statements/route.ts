import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError, MONTH_PATTERN } from '@/lib/finance/billingService';
import { requireCommunityAdmin } from '@/lib/finance/httpAuth';
import { closeFinancialPeriod, statementsForMonth } from '@/lib/finance/periodClosureService';
import { currentMonthInChile } from '@/lib/finance/chileDates';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function GET(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.financial_statements', { limit: 40, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const auth = await requireCommunityAdmin();
        if (auth.error) return auth.error;

        const cutoffMonth = cleanText(req.nextUrl.searchParams.get('cutoffMonth'), 7) || currentMonthInChile();
        if (!MONTH_PATTERN.test(cutoffMonth)) {
            return NextResponse.json({ error: 'Indica el mes de corte en formato AAAA-MM.' }, { status: 400 });
        }
        const yearParam = Number(req.nextUrl.searchParams.get('year') || cutoffMonth.slice(0, 4));
        const openingCash = Number(req.nextUrl.searchParams.get('openingCash') || 0);
        if (!Number.isFinite(openingCash) || openingCash < 0 || openingCash > 10_000_000_000) {
            return NextResponse.json({ error: 'El saldo inicial de caja no es válido.' }, { status: 400 });
        }

        if (yearParam !== Number(cutoffMonth.slice(0, 4))) return NextResponse.json({ error: 'El año no corresponde al mes de corte.' }, { status: 400 });
        return NextResponse.json(await statementsForMonth(auth.communityId, cutoffMonth, Math.round(openingCash)));
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/financial-statements', error, {
            publicMessage: 'No se pudieron armar los estados financieros.',
        });
    }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.financial_statements.close', { limit: 5, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const auth = await requireCommunityAdmin();
        if (auth.error) return auth.error;
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const month = cleanText(body.month, 7);
        const openingCash = Number(body.openingCash);
        return NextResponse.json(await closeFinancialPeriod(auth.communityId, auth.profile.id, month, openingCash), { status: 201 });
    } catch (error) {
        if (error instanceof BillingError) return NextResponse.json({ error: error.message }, { status: error.status });
        return apiErrorResponse(req, '/api/admin/financial-statements', error, { publicMessage: 'No se pudo guardar el corte.' });
    }
}
