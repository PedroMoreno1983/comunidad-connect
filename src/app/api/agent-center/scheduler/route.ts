import { NextRequest, NextResponse } from 'next/server';
import { evaluateDueAgentTriggers } from '@/lib/agent-center/proactiveEngine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return NextResponse.json({ error: 'Scheduler no configurado.' }, { status: 503 });
    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    try {
        return NextResponse.json(await evaluateDueAgentTriggers());
    } catch (error) {
        console.error('[agent-center scheduler] evaluation failed', error);
        return NextResponse.json({ error: 'No se pudieron evaluar las reglas proactivas.' }, { status: 500 });
    }
}
