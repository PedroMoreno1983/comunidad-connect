import { NextRequest, NextResponse } from 'next/server';
import { cronAccess } from '@/lib/cronAuth';
import { apiErrorResponse } from '@/lib/observability/logger';
import { runActivityReport } from '@/lib/platform/activityReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Reporte de actividad de la plataforma: 08:00 y 18:00 de Chile, por correo a
 * la superadministración. Idempotente: un envío por turno (mañana / tarde).
 */
export async function GET(req: NextRequest) {
    const access = cronAccess(process.env.CRON_SECRET, req.headers.get('authorization'), req.headers.get('x-cron-secret'));
    if (access === 'missing') return NextResponse.json({ error: 'Scheduler no configurado.' }, { status: 503 });
    if (access === 'rejected') return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    try {
        const result = await runActivityReport(new Date());
        return NextResponse.json({ status: result.status, key: result.key, totals: result.totals });
    } catch (error) {
        return apiErrorResponse(req, '/api/platform/activity-report/cron', error, { publicMessage: 'No se pudo armar el reporte de actividad.' });
    }
}
