import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { InboxError, discardInboundBill, listInbox, registerInboundBill } from '@/lib/finance/billsInbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Bandeja de boletas recibidas por correo. Solo la administración de la comunidad. */
async function adminCommunity() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 401 }) };
    if (profile.role !== 'admin' || !profile.community_id) {
        return { error: NextResponse.json({ error: 'Solo la administración ve la bandeja de boletas.' }, { status: 403 }) };
    }
    return { communityId: profile.community_id, userId: profile.id };
}

function failure(error: unknown) {
    if (error instanceof InboxError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[bills-inbox]', error);
    return NextResponse.json({ error: 'No se pudo completar. Intenta de nuevo.' }, { status: 500 });
}

export async function GET() {
    const access = await adminCommunity();
    if ('error' in access) return access.error;
    try {
        return NextResponse.json(await listInbox(access.communityId), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return failure(error);
    }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.bills_inbox', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const access = await adminCommunity();
    if ('error' in access) return access.error;
    try {
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const id = typeof body.id === 'string' ? body.id : '';
        if (!id) throw new InboxError('Falta la boleta.');
        if (body.action === 'discard') {
            await discardInboundBill(access.communityId, access.userId, id);
            return NextResponse.json({ ok: true });
        }
        if (body.action !== 'register') throw new InboxError('Acción no reconocida.');
        const expense = await registerInboundBill(access.communityId, access.userId, id, {
            month: String(body.month || ''), label: String(body.label || ''), amount: Number(body.amount),
            category: String(body.category || 'other'), provider: String(body.provider || ''),
            prorateMethod: body.prorateMethod === 'equal' ? 'equal' : 'share',
        });
        return NextResponse.json({ expense }, { status: 201 });
    } catch (error) {
        return failure(error);
    }
}
