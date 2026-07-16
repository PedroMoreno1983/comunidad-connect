import { NextRequest, NextResponse } from 'next/server';
import { publishDueMarketingReels } from '@/lib/marketing/reelWorkflow';
import { enforceRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const limited = enforceRateLimit(req, 'marketing.reels.cron', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;

    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return NextResponse.json({ error: 'Cron no configurado.' }, { status: 503 });

    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : req.nextUrl.searchParams.get('token');
    if (token !== secret) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    try {
        const result = await publishDueMarketingReels();
        return NextResponse.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo procesar la agenda de reels.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
