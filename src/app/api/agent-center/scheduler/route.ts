import { NextRequest, NextResponse } from 'next/server';
import { evaluateDueAgentTriggers } from '@/lib/agent-center/proactiveEngine';
import { claimSchedulerTick, releaseSchedulerTick, runProactiveProposals } from '@/lib/agent-center/proactiveProposals';
import { authorizeScheduler, parseSchedulerMode, schedulerBucket, schedulerSecrets } from '@/lib/agent-center/schedulerAuth';
import { runDueRoutines } from '@/lib/coco/routineRunner';

export const dynamic = 'force-dynamic';

async function handle(req: NextRequest) {
    const secrets = schedulerSecrets([process.env.SCHEDULER_SECRET, process.env.CRON_SECRET]);
    const access = authorizeScheduler(req.headers.get('authorization'), secrets);
    if (access === 'missing') return NextResponse.json({ error: 'Scheduler no configurado.' }, { status: 503 });
    if (access === 'rejected') return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const mode = parseSchedulerMode(req.nextUrl.searchParams.get('mode'));
    if (mode === 'invalid') {
        return NextResponse.json({ error: 'Modo no reconocido. Usa triggers, proposals o all.' }, { status: 400 });
    }

    const bucket = schedulerBucket(new Date());
    let claimed = false;
    try {
        claimed = await claimSchedulerTick(mode, bucket);
    } catch (error) {
        console.error('[agent-center scheduler] no se pudo reservar la ventana', error);
        return NextResponse.json({ error: 'No se pudieron evaluar las reglas proactivas.' }, { status: 500 });
    }
    if (!claimed) return NextResponse.json({ ok: true, idempotent: true, mode, bucket });

    try {
        const triggers = mode === 'proposals' ? null : await evaluateDueAgentTriggers();
        const proposals = mode === 'triggers' ? null : await runProactiveProposals();
        const routines = mode === 'proposals' ? null : await runDueRoutines().catch(error => {
            console.error('[agent-center scheduler] routines failed', error);
            return { ran: [], error: true };
        });
        return NextResponse.json({ ok: true, mode, bucket, triggers, proposals, routines });
    } catch (error) {
        await releaseSchedulerTick(mode, bucket);
        console.error('[agent-center scheduler] evaluation failed', error);
        return NextResponse.json({ error: 'No se pudieron evaluar las reglas proactivas.' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    return handle(req);
}

export async function POST(req: NextRequest) {
    return handle(req);
}
