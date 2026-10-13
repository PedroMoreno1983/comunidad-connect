import { NextRequest } from 'next/server';
import { dateParam, withApiKey } from '@/lib/security/publicApi';
import { listPayments } from '@/lib/operations/publicApiData';
import { todayInChile } from '@/lib/finance/chileDates';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    return withApiKey(req, 'finance', '/api/v1/payments', communityId => {
        const today = todayInChile();
        return listPayments(communityId, dateParam(req, 'from', `${today.slice(0, 7)}-01`), dateParam(req, 'to', today));
    });
}
