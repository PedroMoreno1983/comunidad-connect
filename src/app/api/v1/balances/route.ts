import { NextRequest } from 'next/server';
import { withApiKey } from '@/lib/security/publicApi';
import { getCommunityBalances } from '@/lib/finance/collectionService';

export const runtime = 'nodejs';

/** Saldo y deuda vencida por unidad. */
export async function GET(req: NextRequest) {
    return withApiKey(req, 'finance', '/api/v1/balances', communityId => getCommunityBalances(communityId));
}
