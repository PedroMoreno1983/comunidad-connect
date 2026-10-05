import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError, previewBilling, issueBilling, cancelBilling } from '@/lib/finance/billingService';

export const runtime = 'nodejs';
export const maxDuration = 60;

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function requireAdmin() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (profile.role !== 'admin') {
        return { error: NextResponse.json({ error: 'Solo la administración puede emitir gastos comunes.' }, { status: 403 }) };
    }
    if (!profile.community_id) {
        return { error: NextResponse.json({ error: 'Tu cuenta no está asociada a una comunidad.' }, { status: 400 }) };
    }
    return { profile, communityId: profile.community_id };
}

/** Previsualización: qué se cobraría a cada unidad si se emitiera este mes. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;

        const month = cleanText(req.nextUrl.searchParams.get('month'), 7);
        const quotaAmount = Number(req.nextUrl.searchParams.get('quotaAmount') || 0);
        const quotaMethod = cleanText(req.nextUrl.searchParams.get('quotaMethod'), 10) === 'equal' ? 'equal' as const : 'share' as const;
        const preview = await previewBilling(auth.communityId, month, {
            quota: Number.isFinite(quotaAmount) && quotaAmount > 0 ? { amount: quotaAmount, method: quotaMethod } : null,
        });
        return NextResponse.json(preview);
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/billing', error, {
            publicMessage: 'No se pudo calcular el prorrateo.',
        });
    }
}

/** Emisión: crea el cobro de cada unidad con su desglose. */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.billing.issue', {
        limit: 5,
        windowMs: 60_000,
    });
    if (limited) return limited;

    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const month = cleanText(body.month, 7);
        const dueDate = cleanText(body.dueDate, 10);
        const quotaAmount = Number(body.quotaAmount || 0);
        const declaredCash = body.declaredCashBalance === null || body.declaredCashBalance === undefined || body.declaredCashBalance === ''
            ? null
            : Number(body.declaredCashBalance);
        const notifyByEmail = body.notifyByEmail !== false;

        const result = await issueBilling(auth.communityId, auth.profile.id, month, dueDate, {
            quota: Number.isFinite(quotaAmount) && quotaAmount > 0
                ? { amount: quotaAmount, method: cleanText(body.quotaMethod, 10) === 'equal' ? 'equal' : 'share' }
                : null,
            declaredCashBalance: declaredCash !== null && Number.isFinite(declaredCash) ? Math.round(declaredCash) : null,
            notifyByEmail,
        });
        return NextResponse.json({ ok: true, ...result }, { status: 201 });
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/billing', error, {
            publicMessage: 'No se pudo emitir el gasto común.',
        });
    }
}

/** Anulación: borra los cobros generados por una emisión, salvo los ya pagados. */
export async function DELETE(req: NextRequest) {
    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;

        const runId = cleanText(req.nextUrl.searchParams.get('runId'), 60);
        if (!runId) return NextResponse.json({ error: 'Falta la emisión a anular.' }, { status: 400 });

        const result = await cancelBilling(auth.communityId, runId);
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/billing', error, {
            publicMessage: 'No se pudo anular la emisión.',
        });
    }
}
