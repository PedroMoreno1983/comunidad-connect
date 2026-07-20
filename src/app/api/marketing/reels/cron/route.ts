import { NextRequest, NextResponse } from 'next/server';
import { publishDueMarketingReels } from '@/lib/marketing/reelWorkflow';
import { enforceRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const limited = enforceRateLimit(req, 'marketing.reels.cron', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;

    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return NextResponse.json({ error: 'Cron no configurado.' }, { status: 503 });

    // Vercel Cron sends the secret as `Authorization: Bearer $CRON_SECRET` --
    // no query-string fallback, since query strings end up in access logs.
    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    try {
        const result = await publishDueMarketingReels();
        return NextResponse.json(result);
    } catch (error) {
        console.error('[marketing reels cron] processing failed', error);
        return NextResponse.json({ error: 'No se pudo procesar la agenda de reels.' }, { status: 500 });
    }
}
