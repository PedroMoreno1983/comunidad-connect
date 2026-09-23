import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { requireCommunityAdmin } from '@/lib/finance/httpAuth';
import { cancelAgreement, createAgreement, listAgreements, payInstallment } from '@/lib/finance/agreementService';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function listUnits(communityId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('units')
    .select('id, number, tower')
    .eq('community_id', communityId)
    .order('number');
  if (error) throw error;
  return (data || []).map(unit => ({
    id: String(unit.id),
    number: String(unit.number ?? ''),
    tower: unit.tower ? String(unit.tower) : null,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireCommunityAdmin();
    if (auth.error) return auth.error;
    const [agreements, units] = await Promise.all([
      listAgreements(auth.communityId),
      listUnits(auth.communityId),
    ]);
    return NextResponse.json({ agreements, units });
  } catch (error) {
    return apiErrorResponse(req, '/api/admin/agreements', error, {
      publicMessage: 'No se pudieron cargar los convenios.',
    });
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforceDistributedRateLimit(req, 'admin.agreements.write', { limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const auth = await requireCommunityAdmin();
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = cleanText(body.action, 20);

    if (action === 'pay') {
      const result = await payInstallment(auth.communityId, auth.profile.id, {
        installmentId: cleanText(body.installmentId, 60),
        paidAt: cleanText(body.paidAt, 10),
        method: cleanText(body.method, 20) || 'transfer',
        reference: cleanText(body.reference, 120),
      });
      return NextResponse.json(result);
    }

    if (action === 'cancel') {
      const result = await cancelAgreement(auth.communityId, cleanText(body.agreementId, 60));
      return NextResponse.json(result);
    }

    const agreement = await createAgreement(auth.communityId, auth.profile.id, {
      unitId: cleanText(body.unitId, 60),
      title: cleanText(body.title, 140),
      totalAmount: Number(body.totalAmount),
      installmentCount: Number(body.installmentCount),
      startDate: cleanText(body.startDate, 10),
      notes: cleanText(body.notes, 500),
    });
    return NextResponse.json({ agreement }, { status: 201 });
  } catch (error) {
    if (error instanceof BillingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return apiErrorResponse(req, '/api/admin/agreements', error, {
      publicMessage: 'No se pudo guardar el convenio.',
    });
  }
}
