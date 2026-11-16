import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { reportTransferForUnit } from '@/lib/finance/transferReport';

export const runtime = 'nodejs';

/**
 * El residente informa una transferencia y el mes al que corresponde.
 * No registra el pago: el saldo cambia solo cuando administración verifica el comprobante.
 * La lógica vive en reportTransferForUnit, compartida con CoCo (report_transfer).
 */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'finance.transfer_report', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (profile.role === 'admin') {
            return NextResponse.json({ error: 'El registro del pago se hace en cobranza.' }, { status: 403 });
        }
        if (!profile.community_id || !profile.unit_id) {
            return NextResponse.json({ error: 'Tu perfil todavía no tiene una unidad asignada.' }, { status: 400 });
        }

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const result = await reportTransferForUnit(getSupabaseAdmin(), {
            communityId: profile.community_id,
            unitId: profile.unit_id,
            amount: body.amount,
            paidAt: body.paidAt,
            reference: body.reference,
            expenseId: body.expenseId,
        });
        if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json({ reported: true, notified: result.notified }, { status: 201 });
    } catch (error) {
        return apiErrorResponse(req, '/api/finance/transfer-report', error, {
            publicMessage: 'No se pudo informar la transferencia.',
        });
    }
}
