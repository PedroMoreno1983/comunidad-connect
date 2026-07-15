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
        const message = error instanceof Error ? error.message : 'No se pudieron evaluar las reglas proactivas.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
