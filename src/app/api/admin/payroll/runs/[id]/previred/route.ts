import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { requireCommunityAdmin } from '@/lib/finance/httpAuth';
import { getPreviredFile } from '@/lib/finance/payrollService';

export const runtime = 'nodejs';

/** Nómina del mes en el formato de 105 campos, lista para "Cargar archivo" en Previred. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceDistributedRateLimit(req, 'admin.payroll.previred', { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const auth = await requireCommunityAdmin();
    if (auth.error) return auth.error;
    const { id } = await params;
    const file = await getPreviredFile(auth.communityId, id.slice(0, 60));
    // Previred lee los archivos en Windows-1252: la Ñ debe ir en un byte.
    return new NextResponse(Buffer.from(file.text, 'latin1'), {
      headers: {
        'Content-Type': 'text/plain; charset=windows-1252',
        'Content-Disposition': `attachment; filename="previred-${file.month}.txt"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof BillingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return apiErrorResponse(req, '/api/admin/payroll/runs/[id]/previred', error, {
      publicMessage: 'No se pudo generar el archivo Previred.',
    });
  }
}
