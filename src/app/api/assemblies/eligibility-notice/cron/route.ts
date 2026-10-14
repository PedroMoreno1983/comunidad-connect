import { NextRequest, NextResponse } from 'next/server';
import { cronAccess } from '@/lib/cronAuth';
import { apiErrorResponse } from '@/lib/observability/logger';
import { sendEligibilityNotices } from '@/lib/assemblies/eligibilityService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron diario del aviso privado de habilidad para votar: desde 7 días antes de
 * cada asamblea citada, avisa en la app solo a las unidades que hoy no estarían
 * habilitadas, sin montos ni lenguaje de deudor y con dos salidas (estado de
 * cuenta o convenio). Idempotente: un aviso por asamblea y persona.
 */
export async function GET(req: NextRequest) {
    const access = cronAccess(process.env.CRON_SECRET, req.headers.get('authorization'), req.headers.get('x-cron-secret'));
    if (access === 'missing') return NextResponse.json({ error: 'Scheduler no configurado.' }, { status: 503 });
    if (access === 'rejected') return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    try {
        return NextResponse.json(await sendEligibilityNotices(new Date()));
    } catch (error) {
        return apiErrorResponse(req, '/api/assemblies/eligibility-notice/cron', error, { publicMessage: 'No se pudieron enviar los avisos de habilidad.' });
    }
}
