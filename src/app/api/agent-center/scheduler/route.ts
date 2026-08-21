import { NextRequest, NextResponse } from 'next/server';
import { evaluateDueAgentTriggers } from '@/lib/agent-center/proactiveEngine';
import { denyUnlessSharedSecret } from '@/lib/security/sharedSecret';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const denied = denyUnlessSharedSecret(req, process.env.CRON_SECRET, {
        notConfiguredMessage: 'Scheduler no configurado.',
    });
    if (denied) return denied;

    try {
        return NextResponse.json(await evaluateDueAgentTriggers());
    } catch (error) {
        console.error('[agent-center scheduler] evaluation failed', error);
        return NextResponse.json({ error: 'No se pudieron evaluar las reglas proactivas.' }, { status: 500 });
    }
}
