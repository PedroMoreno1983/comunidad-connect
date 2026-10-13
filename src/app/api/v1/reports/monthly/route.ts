import { NextRequest } from 'next/server';
import { monthParam, withApiKey } from '@/lib/security/publicApi';
import { getMonthlyReport } from '@/lib/finance/reportingService';

export const runtime = 'nodejs';

/** Rendición del mes: egresos, cobrado, recaudado y fondo de reserva. */
export async function GET(req: NextRequest) {
    return withApiKey(req, 'finance', '/api/v1/reports/monthly', communityId => getMonthlyReport(communityId, monthParam(req)));
}
