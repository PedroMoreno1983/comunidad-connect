import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { BillingError } from '@/lib/finance/billingService';
import { parseBankStatement } from '@/lib/finance/bankStatementParser';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.bank_statement_parse', { limit: 12, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    if (profile.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Solo la administración puede revisar cartolas.' }, { status: 403 });
    }
    try {
        const form = await req.formData();
        const file = form.get('file');
        if (!(file instanceof File)) return NextResponse.json({ error: 'Selecciona una cartola.' }, { status: 400 });
        const rows = await parseBankStatement(file);
        return NextResponse.json({ rows });
    } catch (error) {
        return NextResponse.json({ error: error instanceof BillingError ? error.message : 'No se pudo leer la cartola.' }, {
            status: error instanceof BillingError ? error.status : 500,
        });
    }
}
