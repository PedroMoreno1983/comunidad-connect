import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError, MONTH_PATTERN } from '@/lib/finance/billingService';
import { requireCommunityAdmin } from '@/lib/finance/httpAuth';
import { getFinancialStatements } from '@/lib/finance/financialStatements';
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

        return NextResponse.json(await getFinancialStatements(auth.communityId, yearParam, {
            cutoffMonth,
            openingCash: Math.round(openingCash),
        }));
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/financial-statements', error, {
            publicMessage: 'No se pudieron armar los estados financieros.',
        });
    }
}
