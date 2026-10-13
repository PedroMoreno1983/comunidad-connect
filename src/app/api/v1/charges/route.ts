import { NextRequest } from 'next/server';
import { monthParam, withApiKey } from '@/lib/security/publicApi';
import { listCharges } from '@/lib/operations/publicApiData';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    return withApiKey(req, 'finance', '/api/v1/charges', communityId => listCharges(communityId, monthParam(req)));
}
