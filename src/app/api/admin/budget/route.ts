import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { getBudgetComparison, setBudgetLine } from '@/lib/finance/reportingService';

export const runtime = 'nodejs';

async function requireAdmin() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (profile.role !== 'admin') {
        return { error: NextResponse.json({ error: 'Solo la administración puede gestionar el presupuesto.' }, { status: 403 }) };
    }
    if (!profile.community_id) {
        return { error: NextResponse.json({ error: 'Tu cuenta no está asociada a una comunidad.' }, { status: 400 }) };
    }
    return { profile, communityId: profile.community_id };
}

export async function GET(req: NextRequest) {
    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;

        const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear();
        return NextResponse.json(await getBudgetComparison(auth.communityId, year));
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/budget', error, {
            publicMessage: 'No se pudo cargar el presupuesto.',
        });
    }
}

export async function POST(req: NextRequest) {
    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const line = await setBudgetLine(auth.communityId, auth.profile.id, {
            year: Number(body.year),
            category: typeof body.category === 'string' ? body.category : '',
            annualAmount: Number(body.annualAmount),
        });
        return NextResponse.json({ line });
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/budget', error, {
            publicMessage: 'No se pudo guardar el presupuesto.',
        });
    }
}
