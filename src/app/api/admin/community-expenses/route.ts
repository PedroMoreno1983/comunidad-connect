import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError, listCommunityExpenses, addCommunityExpense, deleteCommunityExpense } from '@/lib/finance/billingService';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function requireAdmin() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (profile.role !== 'admin') {
        return { error: NextResponse.json({ error: 'Solo la administración puede gestionar egresos.' }, { status: 403 }) };
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

        const month = cleanText(req.nextUrl.searchParams.get('month'), 7);
        const data = await listCommunityExpenses(auth.communityId, month);
        return NextResponse.json(data);
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/community-expenses', error, {
            publicMessage: 'No se pudieron cargar los egresos.',
        });
    }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.community_expenses.create', {
        limit: 60,
        windowMs: 60_000,
    });
    if (limited) return limited;

    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const expense = await addCommunityExpense(auth.communityId, auth.profile.id, {
            month: cleanText(body.month, 7),
            label: cleanText(body.label, 160),
            category: cleanText(body.category, 20),
            prorateMethod: cleanText(body.prorateMethod, 10) === 'equal' ? 'equal' : 'share',
            amount: Number(body.amount),
            provider: cleanText(body.provider, 160) || null,
            notes: cleanText(body.notes, 500) || null,
        });
        return NextResponse.json({ expense }, { status: 201 });
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/community-expenses', error, {
            publicMessage: 'No se pudo registrar el egreso.',
        });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;

        const id = cleanText(req.nextUrl.searchParams.get('id'), 60);
        if (!id) return NextResponse.json({ error: 'Falta el egreso a eliminar.' }, { status: 400 });

        const result = await deleteCommunityExpense(auth.communityId, id);
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/community-expenses', error, {
            publicMessage: 'No se pudo eliminar el egreso.',
        });
    }
}
