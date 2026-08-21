import { NextRequest, NextResponse } from 'next/server';
import { publishDueMarketingReels } from '@/lib/marketing/reelWorkflow';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { denyUnlessSharedSecret } from '@/lib/security/sharedSecret';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const limited = enforceRateLimit(req, 'marketing.reels.cron', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;

    // Vercel Cron manda el secreto como `Authorization: Bearer $CRON_SECRET`.
    // Sin variante por query string: acabaría en los logs de acceso.
    const denied = denyUnlessSharedSecret(req, process.env.CRON_SECRET, {
        notConfiguredMessage: 'Cron no configurado.',
    });
    if (denied) return denied;

    try {
        const result = await publishDueMarketingReels();
        return NextResponse.json(result);
    } catch (error) {
        console.error('[marketing reels cron] processing failed', error);
        return NextResponse.json({ error: 'No se pudo procesar la agenda de reels.' }, { status: 500 });
    }
}
