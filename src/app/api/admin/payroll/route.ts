import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { requireCommunityAdmin } from '@/lib/finance/httpAuth';
import { createPayrollRun, listPayroll, payPayrollRun, saveEmployee } from '@/lib/finance/payrollService';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireCommunityAdmin();
    if (auth.error) return auth.error;
    return NextResponse.json(await listPayroll(auth.communityId));
  } catch (error) {
    return apiErrorResponse(req, '/api/admin/payroll', error, {
      publicMessage: 'No se pudo cargar la remuneración.',
    });
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforceDistributedRateLimit(req, 'admin.payroll.write', { limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const auth = await requireCommunityAdmin();
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = cleanText(body.action, 20);

    if (action === 'run') {
      const run = await createPayrollRun(auth.communityId, auth.profile.id, cleanText(body.month, 7));
      return NextResponse.json({ run }, { status: 201 });
    }

    if (action === 'pay') {
      const result = await payPayrollRun(auth.communityId, auth.profile.id, {
        runId: cleanText(body.runId, 60),
        paidAt: cleanText(body.paidAt, 10),
        reference: cleanText(body.reference, 120),
      });
      return NextResponse.json(result);
    }

    const employee = await saveEmployee(auth.communityId, {
      id: cleanText(body.id, 60) || undefined,
      fullName: cleanText(body.fullName, 120),
      roleTitle: cleanText(body.roleTitle, 80),
      monthlyAmount: Number(body.monthlyAmount),
      active: body.active !== false,
    });
    return NextResponse.json({ employee }, { status: body.id ? 200 : 201 });
  } catch (error) {
    if (error instanceof BillingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return apiErrorResponse(req, '/api/admin/payroll', error, {
      publicMessage: 'No se pudo guardar la remuneración.',
    });
  }
}
