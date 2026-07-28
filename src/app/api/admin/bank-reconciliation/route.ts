import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import {
    getReconciliation,
    importBankTransactions,
    matchTransaction,
    unmatchTransaction,
    setTransactionIgnored,
    autoReconcile,
    deleteBankTransaction,
    type BankTransactionInput,
} from '@/lib/finance/reconciliationService';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function requireAdmin() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (profile.role !== 'admin') {
        return { error: NextResponse.json({ error: 'Solo la administración puede conciliar la caja.' }, { status: 403 }) };
    }
    if (!profile.community_id) {
        return { error: NextResponse.json({ error: 'Tu cuenta no está asociada a una comunidad.' }, { status: 400 }) };
    }
    return { profile, communityId: profile.community_id };
}

function handle(error: unknown, req: NextRequest, publicMessage: string) {
    if (error instanceof BillingError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return apiErrorResponse(req, '/api/admin/bank-reconciliation', error, { publicMessage });
}

export async function GET(req: NextRequest) {
    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;
        return NextResponse.json(await getReconciliation(auth.communityId));
    } catch (error) {
        return handle(error, req, 'No se pudo cargar la conciliación.');
    }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.reconciliation', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const action = cleanText(body.action, 20);

        switch (action) {
            case 'import': {
                const rows = Array.isArray(body.rows) ? (body.rows as BankTransactionInput[]) : [];
                return NextResponse.json(await importBankTransactions(auth.communityId, auth.profile.id, rows));
            }
            case 'match':
                return NextResponse.json(
                    await matchTransaction(auth.communityId, cleanText(body.transactionId, 60), cleanText(body.paymentId, 60)),
                );
            case 'unmatch':
                return NextResponse.json(await unmatchTransaction(auth.communityId, cleanText(body.transactionId, 60)));
            case 'ignore':
                return NextResponse.json(await setTransactionIgnored(auth.communityId, cleanText(body.transactionId, 60), true));
            case 'unignore':
                return NextResponse.json(await setTransactionIgnored(auth.communityId, cleanText(body.transactionId, 60), false));
            case 'auto':
                return NextResponse.json(await autoReconcile(auth.communityId));
            default:
                return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
        }
    } catch (error) {
        return handle(error, req, 'No se pudo procesar la conciliación.');
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;
        const id = cleanText(req.nextUrl.searchParams.get('id'), 60);
        if (!id) return NextResponse.json({ error: 'Falta el movimiento a eliminar.' }, { status: 400 });
        return NextResponse.json(await deleteBankTransaction(auth.communityId, id));
    } catch (error) {
        return handle(error, req, 'No se pudo eliminar el movimiento.');
    }
}
