import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { getDebtCertificate } from '@/lib/finance/collectionService';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Certificado de deuda de una unidad.
 *
 * El admin puede pedir el de cualquier unidad de su comunidad; un residente
 * solo el de la suya, ignorando el unitId que venga en la query, para que no
 * pueda averiguar la deuda de un vecino.
 */
export async function GET(req: NextRequest) {
    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (!profile.community_id) {
            return NextResponse.json({ error: 'Tu cuenta no está asociada a una comunidad.' }, { status: 400 });
        }

        const isAdmin = profile.role === 'admin';
        const unitId = isAdmin
            ? cleanText(req.nextUrl.searchParams.get('unitId'), 60)
            : profile.unit_id || '';

        if (!unitId) {
            return NextResponse.json(
                { error: isAdmin ? 'Indica la unidad.' : 'Tu perfil todavía no tiene una unidad asignada.' },
                { status: 400 },
            );
        }

        const certificate = await getDebtCertificate(
            profile.community_id,
            unitId,
            profile.name || profile.email || null,
        );
        return NextResponse.json(certificate);
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/debt-certificate', error, {
            publicMessage: 'No se pudo generar el certificado.',
        });
    }
}
