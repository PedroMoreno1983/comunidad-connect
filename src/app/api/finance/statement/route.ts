import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { getUnitStatement, getCommunityBalances } from '@/lib/finance/collectionService';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Estado de cuenta.
 *  - Admin sin unitId  -> saldos de toda la comunidad (vista de cobranza).
 *  - Admin con unitId  -> cartola de esa unidad.
 *  - Residente         -> cartola de SU unidad, ignorando cualquier unitId
 *                         recibido, para que no pueda leer la de un vecino.
 */
export async function GET(req: NextRequest) {
    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (!profile.community_id) {
            return NextResponse.json({ error: 'Tu cuenta no está asociada a una comunidad.' }, { status: 400 });
        }

        const isStaff = profile.role === 'admin';
        const requestedUnitId = cleanText(req.nextUrl.searchParams.get('unitId'), 60);

        if (!isStaff) {
            if (!profile.unit_id) {
                return NextResponse.json(
                    { error: 'Tu perfil todavía no tiene una unidad asignada. Contacta a administración.' },
                    { status: 400 },
                );
            }
            const statement = await getUnitStatement(profile.community_id, profile.unit_id);
            return NextResponse.json({ scope: 'unit', ...statement });
        }

        if (requestedUnitId) {
            const statement = await getUnitStatement(profile.community_id, requestedUnitId);
            return NextResponse.json({ scope: 'unit', ...statement });
        }

        const balances = await getCommunityBalances(profile.community_id);
        return NextResponse.json({ scope: 'community', ...balances });
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/finance/statement', error, {
            publicMessage: 'No se pudo cargar el estado de cuenta.',
        });
    }
}
