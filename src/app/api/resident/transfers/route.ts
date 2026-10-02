import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { BillingError } from '@/lib/finance/billingService';
import { listTransferReports, submitTransferReport } from '@/lib/finance/transferReportService';

export const runtime = 'nodejs';

async function requireResident() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 401 }) };
    if (profile.role !== 'resident' || !profile.community_id || !profile.unit_id || !profile.id) {
        return { error: NextResponse.json({ error: 'Debes ingresar como residente de una unidad.' }, { status: 403 }) };
    }
    return { profile: { community_id: profile.community_id, unit_id: profile.unit_id, id: profile.id } };
}

export async function GET() {
    const auth = await requireResident();
    if (auth.error) return auth.error;
    try {
        const reports = await listTransferReports(auth.profile.community_id, auth.profile.unit_id);
        return NextResponse.json({ reports });
    } catch {
        return NextResponse.json({ error: 'No se pudieron cargar las transferencias informadas.' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'resident.transfers.submit', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const auth = await requireResident();
    if (auth.error) return auth.error;
    try {
        const body = await req.json() as Record<string, unknown>;
        const report = await submitTransferReport(auth.profile.community_id, auth.profile.unit_id, auth.profile.id, {
            expenseId: String(body.expenseId || ''), amount: Number(body.amount),
            paidAt: String(body.paidAt || ''), reference: String(body.reference || ''),
        });
        return NextResponse.json({ report }, { status: 201 });
    } catch (error) {
        if (error instanceof BillingError) return NextResponse.json({ error: error.message }, { status: error.status });
        return NextResponse.json({ error: 'No se pudo informar la transferencia.' }, { status: 500 });
    }
}
