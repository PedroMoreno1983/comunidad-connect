import { NextRequest } from 'next/server';
import { dateParam, withApiKey } from '@/lib/security/publicApi';
import { listVisitors } from '@/lib/operations/publicApiData';
import { todayInChile } from '@/lib/finance/chileDates';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    return withApiKey(req, 'access', '/api/v1/visitors', communityId => listVisitors(communityId, dateParam(req, 'since', todayInChile())));
}
