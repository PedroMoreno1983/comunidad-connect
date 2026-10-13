import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/observability/logger';
import { requireCommunityAdmin } from '@/lib/finance/httpAuth';
import { getTaxDocumentPdf, InvoicingError } from '@/lib/finance/taxDocumentService';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await requireCommunityAdmin();
        if (auth.error) return auth.error;
        const { id } = await params;
        const pdf = await getTaxDocumentPdf(auth.communityId, id.slice(0, 60));
        return new NextResponse(Buffer.from(pdf.bytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${pdf.fileName}"`,
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (error) {
        if (error instanceof InvoicingError) return NextResponse.json({ error: error.message }, { status: error.status });
        return apiErrorResponse(req, '/api/admin/invoicing/[id]/pdf', error, { publicMessage: 'No se pudo descargar el PDF.' });
    }
}
