import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { addUnitCharge, cancelUnitCharge } from '@/lib/finance/collectionService';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function requireAdmin() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (profile.role !== 'admin') {
        return { error: NextResponse.json({ error: 'Solo la administración puede registrar cargos.' }, { status: 403 }) };
    }
    if (!profile.community_id) {
        return { error: NextResponse.json({ error: 'Tu cuenta no está asociada a una comunidad.' }, { status: 400 }) };
    }
    return { profile, communityId: profile.community_id };
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.charges.create', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const charge = await addUnitCharge(auth.communityId, auth.profile.id, {
            unitId: cleanText(body.unitId, 60),
            month: cleanText(body.month, 7),
            kind: cleanText(body.kind, 20) || 'other',
            label: cleanText(body.label, 160),
            amount: Number(body.amount),
            dueDate: cleanText(body.dueDate, 10) || null,
            notes: cleanText(body.notes, 500) || null,
        });
        return NextResponse.json({ charge }, { status: 201 });
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/charges', error, {
            publicMessage: 'No se pudo registrar el cargo.',
        });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;

        const id = cleanText(req.nextUrl.searchParams.get('id'), 60);
        if (!id) return NextResponse.json({ error: 'Falta el cargo a anular.' }, { status: 400 });

        return NextResponse.json(await cancelUnitCharge(auth.communityId, id));
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/charges', error, {
            publicMessage: 'No se pudo anular el cargo.',
        });
    }
}
