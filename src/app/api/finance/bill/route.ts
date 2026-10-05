import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { getBillNotices } from '@/lib/finance/billNotice';
import { renderBillNoticesPdf } from '@/lib/finance/billPdf';
import { todayInChile } from '@/lib/finance/chileDates';
import { PUBLIC_SITE_URL } from '@/lib/config';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Aviso de cobro en PDF.
 *  - Admin sin unitId -> todas las unidades del mes en un solo documento.
 *  - Admin con unitId -> el aviso de esa unidad.
 *  - Residente        -> el aviso de SU unidad, ignorando cualquier unitId.
 */
export async function GET(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'finance.bill.pdf', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (!profile.community_id) {
            return NextResponse.json({ error: 'Tu cuenta no está asociada a una comunidad.' }, { status: 400 });
        }

        const month = cleanText(req.nextUrl.searchParams.get('month'), 7) || todayInChile().slice(0, 7);
        const isAdmin = profile.role === 'admin';
        let unitId = cleanText(req.nextUrl.searchParams.get('unitId'), 60) || undefined;
        if (!isAdmin) {
            if (!profile.unit_id) {
                return NextResponse.json({ error: 'Tu perfil todavía no tiene una unidad asignada.' }, { status: 400 });
            }
            unitId = profile.unit_id;
        }

        const rawCash = isAdmin ? cleanText(req.nextUrl.searchParams.get('cashBalance'), 20) : '';
        const cashBalance = rawCash && /^-?\d+$/.test(rawCash) ? Number(rawCash) : null;

        const notices = await getBillNotices(profile.community_id, month, { unitId, cashBalance });
        if (notices.length === 0) {
            return NextResponse.json({ error: `No hay cobros ni deudas para emitir avisos de ${month}.` }, { status: 404 });
        }

        const bytes = await renderBillNoticesPdf(notices, { siteUrl: PUBLIC_SITE_URL, generatedAt: todayInChile() });
        const fileName = notices.length === 1
            ? `aviso-cobro-${notices[0].unit.label.replace(/[^a-zA-Z0-9-]+/g, '')}-${month}.pdf`
            : `avisos-cobro-${month}.pdf`;
        return new NextResponse(Buffer.from(bytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/finance/bill', error, {
            publicMessage: 'No se pudo generar el aviso de cobro.',
        });
    }
}
