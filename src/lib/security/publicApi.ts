import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/security/apiKeys';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import type { ApiKeyScope } from '@/lib/types';

export const API_VERSION = '2026-10-13';

/**
 * Envoltorio de todos los endpoints /api/v1: clave obligatoria, permiso por
 * recurso, límite de uso y respuesta con la forma { data } o { error }.
 */
export async function withApiKey(
    req: NextRequest,
    scope: ApiKeyScope,
    route: string,
    handler: (communityId: string) => Promise<unknown>,
) {
    const limited = await enforceDistributedRateLimit(req, `public_api.${scope}`, { limit: 120, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const auth = await authenticateApiKey(req.headers.get('authorization'), scope);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const data = await handler(auth.communityId);
        return NextResponse.json({ data }, {
            headers: { 'Cache-Control': 'private, no-store', 'X-CoCo-Api-Version': API_VERSION },
        });
    } catch (error) {
        if (error instanceof BillingError) return NextResponse.json({ error: error.message }, { status: error.status });
        return apiErrorResponse(req, route, error, { publicMessage: 'Error interno de la API.' });
    }
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function monthParam(req: NextRequest) {
    const month = req.nextUrl.searchParams.get('month') || '';
    if (!MONTH.test(month)) throw new BillingError('bad_month', 'Parámetro month obligatorio, en formato AAAA-MM.');
    return month;
}

export function dateParam(req: NextRequest, name: string, fallback: string) {
    const value = req.nextUrl.searchParams.get(name) || fallback;
    if (!DATE.test(value)) throw new BillingError('bad_date', `Parámetro ${name} en formato AAAA-MM-DD.`);
    return value;
}
