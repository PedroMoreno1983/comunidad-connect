import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/observability/logger';
import { requireCommunityMember } from '@/lib/finance/httpAuth';
import { listAgreementsForUnits } from '@/lib/finance/agreementService';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export const runtime = 'nodejs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireCommunityMember();
    if (auth.error) return auth.error;

    const admin = getSupabaseAdmin();
    const filters = [`owner_id.eq.${auth.profile.id}`];
    if (auth.profile.unit_id && UUID_PATTERN.test(auth.profile.unit_id)) {
      filters.push(`id.eq.${auth.profile.unit_id}`);
    }
    const { data, error } = await admin
      .from('units')
      .select('id')
      .eq('community_id', auth.communityId)
      .or(filters.join(','));
    if (error) throw error;

    const unitIds = [...new Set((data || []).map(unit => String(unit.id)))];
    const agreements = await listAgreementsForUnits(auth.communityId, unitIds);
    return NextResponse.json({ agreements });
  } catch (error) {
    return apiErrorResponse(req, '/api/resident/agreements', error, {
      publicMessage: 'No se pudieron cargar los convenios.',
    });
  }
}
