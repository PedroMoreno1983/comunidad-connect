import { NextRequest } from 'next/server';
import { withApiKey } from '@/lib/security/publicApi';
import { listUnits } from '@/lib/operations/publicApiData';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    return withApiKey(req, 'units', '/api/v1/units', communityId => listUnits(communityId));
}
