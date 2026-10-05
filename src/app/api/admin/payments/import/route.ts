import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { requireCommunityAdmin } from '@/lib/finance/httpAuth';
import { importPayments } from '@/lib/finance/paymentImport';

export const runtime = 'nodejs';

/** Carga masiva de pagos. `commit=false` devuelve el plan; `commit=true` registra. */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.payments.import', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const auth = await requireCommunityAdmin();
        if (auth.error) return auth.error;

        const form = await req.formData().catch(() => null);
        const file = form?.get('file');
        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'Adjunta la planilla de pagos.' }, { status: 400 });
        }
        const commit = form?.get('commit') === 'true';
        return NextResponse.json(await importPayments(auth.communityId, auth.profile.id, file, commit));
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/payments/import', error, {
            publicMessage: 'No se pudo procesar la planilla de pagos.',
        });
    }
}
