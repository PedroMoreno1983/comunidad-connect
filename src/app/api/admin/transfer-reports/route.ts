import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { BillingError } from '@/lib/finance/billingService';
import { listTransferReports, reviewTransferReport } from '@/lib/finance/transferReportService';

export const runtime = 'nodejs';

async function requireAdmin() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 401 }) };
    if (profile.role !== 'admin' || !profile.community_id || !profile.id) {
        return { error: NextResponse.json({ error: 'Solo la administración puede revisar transferencias.' }, { status: 403 }) };
    }
    return { profile: { community_id: profile.community_id, id: profile.id } };
}

export async function GET() {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    try {
        return NextResponse.json({ reports: await listTransferReports(auth.profile.community_id, undefined, undefined, true) });
    } catch {
        return NextResponse.json({ error: 'No se pudo cargar la revisión de transferencias.' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.transfers.review', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    try {
        const body = await req.json() as Record<string, unknown>;
        const action = body.action === 'confirm' ? 'confirm' : body.action === 'reject' ? 'reject' : null;
        if (!action) return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
        if (action === 'confirm' && body.verifiedInBank !== true) {
            return NextResponse.json({ error: 'Confirma que comprobaste el abono en la cuenta bancaria.' }, { status: 400 });
        }
        const report = await reviewTransferReport(auth.profile.community_id, auth.profile.id,
            String(body.reportId || ''), action, String(body.note || ''));
        return NextResponse.json({ report });
    } catch (error) {
        if (error instanceof BillingError) return NextResponse.json({ error: error.message }, { status: error.status });
        return NextResponse.json({ error: 'No se pudo revisar la transferencia.' }, { status: 500 });
    }
}
