import { NextRequest, NextResponse } from 'next/server';
import { evaluateDueAgentTriggers } from '@/lib/agent-center/proactiveEngine';
import { drainDelegatedTasks } from '@/lib/coco/delegatedTasks';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return NextResponse.json({ error: 'Scheduler no configurado.' }, { status: 503 });
    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    try {
        // Una vez al día (12:00 UTC). También entrega recordatorios de CoCo ya vencidos.
        const triggers = await evaluateDueAgentTriggers();
        const delegated = await drainDelegatedTasks().catch(error => {
            console.error('[agent-center scheduler] background tasks failed', error);
            return { finished: [], error: true };
        });
        return NextResponse.json({ ...triggers, delegated });
    } catch (error) {
        console.error('[agent-center scheduler] evaluation failed', error);
        return NextResponse.json({ error: 'No se pudieron evaluar las reglas proactivas.' }, { status: 500 });
    }
}
