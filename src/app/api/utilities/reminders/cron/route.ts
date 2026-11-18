import { NextRequest, NextResponse } from 'next/server';
import { cronAccess } from '@/lib/cronAuth';
import { apiErrorResponse } from '@/lib/observability/logger';
import { sendUtilityReminders } from '@/lib/utilities/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron diario de vencimientos de luz, agua y gas: avisa a cada residente 3 días
 * antes y el mismo día, salvo que haya marcado la cuenta como pagada.
 * Idempotente: un aviso por cuenta, vencimiento y tipo.
 */
export async function GET(req: NextRequest) {
    const access = cronAccess(process.env.CRON_SECRET, req.headers.get('authorization'), req.headers.get('x-cron-secret'));
    if (access === 'missing') return NextResponse.json({ error: 'Scheduler no configurado.' }, { status: 503 });
    if (access === 'rejected') return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    try {
        return NextResponse.json(await sendUtilityReminders(new Date()));
    } catch (error) {
        return apiErrorResponse(req, '/api/utilities/reminders/cron', error, { publicMessage: 'No se pudieron enviar los avisos de vencimiento.' });
    }
}
