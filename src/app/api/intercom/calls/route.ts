import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { requireCommunityMember } from '@/lib/finance/httpAuth';
import { createIntercomCall, IntercomError, listIntercomCalls } from '@/lib/operations/intercomService';

export const runtime = 'nodejs';

const STAFF = new Set(['concierge', 'admin']);

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Conserjería ve las llamadas de las últimas 12 horas; el residente, las que suenan en su unidad. */
export async function GET(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'intercom.list', { limit: 120, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const auth = await requireCommunityMember();
        if (auth.error) return auth.error;
        const calls = await listIntercomCalls(auth.communityId, {
            role: auth.profile.role,
            unitId: auth.profile.unit_id ?? null,
            id: auth.profile.id,
        });
        return NextResponse.json({ calls });
    } catch (error) {
        return apiErrorResponse(req, '/api/intercom/calls', error, { publicMessage: 'No se pudieron cargar las llamadas.' });
    }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'intercom.call', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const auth = await requireCommunityMember();
        if (auth.error) return auth.error;
        if (!STAFF.has(auth.profile.role)) {
            return NextResponse.json({ error: 'Solo conserjería o administración.' }, { status: 403 });
        }
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const result = await createIntercomCall(auth.communityId, auth.profile.id, {
            unitId: cleanText(body.unitId, 60),
            visitorName: cleanText(body.visitorName, 120),
            visitKind: cleanText(body.visitKind, 20),
            note: cleanText(body.note, 200),
        });
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        if (error instanceof IntercomError) return NextResponse.json({ error: error.message }, { status: error.status });
        return apiErrorResponse(req, '/api/intercom/calls', error, { publicMessage: 'No se pudo llamar a la unidad.' });
    }
}
