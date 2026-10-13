import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { requireCommunityAdmin } from '@/lib/finance/httpAuth';
import { createOversightLink, listOversightLinks, OversightError, revokeOversightLink } from '@/lib/operations/oversightService';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireCommunityAdmin();
        if (auth.error) return auth.error;
        return NextResponse.json({ links: await listOversightLinks(auth.communityId) });
    } catch (error) {
        return apiErrorResponse(req, '/api/admin/oversight-links', error, { publicMessage: 'No se pudieron cargar los accesos.' });
    }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.oversight_links', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const auth = await requireCommunityAdmin();
        if (auth.error) return auth.error;
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        if (body.action === 'revoke' && typeof body.id === 'string') {
            await revokeOversightLink(auth.communityId, body.id.slice(0, 60));
            return NextResponse.json({ revoked: true });
        }
        const result = await createOversightLink(auth.communityId, auth.profile.id, {
            label: typeof body.label === 'string' ? body.label : '',
            days: Number(body.days),
        });
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        if (error instanceof OversightError) return NextResponse.json({ error: error.message }, { status: error.status });
        return apiErrorResponse(req, '/api/admin/oversight-links', error, { publicMessage: 'No se pudo crear el acceso.' });
    }
}
