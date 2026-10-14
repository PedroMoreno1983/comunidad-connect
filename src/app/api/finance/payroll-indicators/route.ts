import { NextRequest, NextResponse } from 'next/server';
import { cronAccess } from '@/lib/cronAuth';
import { apiErrorResponse } from '@/lib/observability/logger';
import { refreshPayrollIndicators } from '@/lib/finance/payrollService';
import { PREVIRED_INDICATORS_URL } from '@/lib/finance/previredIndicators';

export const runtime = 'nodejs';

/** Cron diario: carga los indicadores previsionales del mes apenas Previred los publica. */
export async function GET(req: NextRequest) {
  const access = cronAccess(process.env.CRON_SECRET, req.headers.get('authorization'), req.headers.get('x-cron-secret'));
  if (access === 'missing') return NextResponse.json({ error: 'Scheduler no configurado.' }, { status: 503 });
  if (access === 'rejected') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await refreshPayrollIndicators(async () => {
      const response = await fetch(PREVIRED_INDICATORS_URL, {
        headers: { 'User-Agent': 'ComunidadConnect/1.0 (+https://conviveconnect.com)' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Previred respondió ${response.status}`);
      return response.text();
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(req, '/api/finance/payroll-indicators', error, {
      publicMessage: 'No se pudieron actualizar los indicadores previsionales.',
    });
  }
}
