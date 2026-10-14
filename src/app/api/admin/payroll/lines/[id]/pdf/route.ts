import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { requireCommunityAdmin } from '@/lib/finance/httpAuth';
import { getPayslipDocument } from '@/lib/finance/payrollService';
import { renderPayslipPdf } from '@/lib/finance/payslipPdf';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceDistributedRateLimit(req, 'admin.payroll.pdf', { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const auth = await requireCommunityAdmin();
    if (auth.error) return auth.error;
    const { id } = await params;
    const doc = await getPayslipDocument(auth.communityId, id.slice(0, 60));
    const bytes = await renderPayslipPdf(doc);
    const slug = doc.employee.fullName.normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="liquidacion-${slug}-${doc.month}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof BillingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return apiErrorResponse(req, '/api/admin/payroll/lines/[id]/pdf', error, {
      publicMessage: 'No se pudo generar la liquidación.',
    });
  }
}
