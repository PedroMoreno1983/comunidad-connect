import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { requireCommunityAdmin } from '@/lib/finance/httpAuth';
import { ApiKeyError, createApiKey, listApiKeys, revokeApiKey } from '@/lib/security/apiKeys';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireCommunityAdmin();
        if (auth.error) return auth.error;
        return NextResponse.json({ keys: await listApiKeys(auth.communityId) });
    } catch (error) {
        return apiErrorResponse(req, '/api/admin/api-keys', error, { publicMessage: 'No se pudieron cargar las claves.' });
    }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.api_keys', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const auth = await requireCommunityAdmin();
        if (auth.error) return auth.error;
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        if (body.action === 'revoke' && typeof body.id === 'string') {
            await revokeApiKey(auth.communityId, body.id.slice(0, 60));
            return NextResponse.json({ revoked: true });
        }
        const result = await createApiKey(auth.communityId, auth.profile.id, {
            name: typeof body.name === 'string' ? body.name : '',
            scopes: Array.isArray(body.scopes) ? body.scopes.filter((scope): scope is string => typeof scope === 'string') : [],
        });
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        if (error instanceof ApiKeyError) return NextResponse.json({ error: error.message }, { status: error.status });
        return apiErrorResponse(req, '/api/admin/api-keys', error, { publicMessage: 'No se pudo guardar la clave.' });
    }
}
