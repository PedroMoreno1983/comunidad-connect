import { NextRequest, NextResponse } from 'next/server';
import { cronAccess } from '@/lib/cronAuth';
import { apiErrorResponse } from '@/lib/observability/logger';
import { generateCommitteeDigestsForAllCommunities } from '@/lib/committeeDigest/service';
import { isCommitteeDigestCronHour } from '@/lib/committeeDigest/week';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron semanal del resumen para el comité. Vercel agenda en UTC, así que hay
 * dos disparos los lunes (11:00 y 12:00 UTC) y solo genera el que cae a las
 * 8:00 de Chile (horario de verano u horario de invierno). Es idempotente: un
 * resumen por comunidad y semana.
 */
export async function GET(req: NextRequest) {
    const access = cronAccess(process.env.CRON_SECRET, req.headers.get('authorization'), req.headers.get('x-cron-secret'));
    if (access === 'missing') return NextResponse.json({ error: 'Scheduler no configurado.' }, { status: 503 });
    if (access === 'rejected') return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    const now = new Date();
    if (!isCommitteeDigestCronHour(now) && req.nextUrl.searchParams.get('force') !== '1') {
        return NextResponse.json({ skipped: true, reason: 'Fuera del lunes 8:00 de Chile.' });
    }
    try {
        return NextResponse.json(await generateCommitteeDigestsForAllCommunities(now));
    } catch (error) {
        return apiErrorResponse(req, '/api/agent-center/committee-digest/cron', error, { publicMessage: 'No se pudieron generar los resúmenes semanales.' });
    }
}
