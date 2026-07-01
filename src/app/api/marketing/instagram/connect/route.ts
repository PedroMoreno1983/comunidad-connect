import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { isPlatformCreatorEmail } from '@/lib/platformAccess';
import {
    buildInstagramConnectUrl,
    createInstagramOAuthState,
} from '@/lib/marketing/instagramOAuth';

const DEFAULT_COMMUNITY_ID = '00000000-0000-0000-0000-000000000000';

export async function GET(req: NextRequest) {
    const limited = enforceRateLimit(req, 'marketing.instagram.connect', { limit: 12, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.redirect(new URL('/login?next=/marketing/reels', req.url));
        if (!isPlatformCreatorEmail(profile.email)) {
            return NextResponse.redirect(new URL('/marketing/reels?instagram=forbidden', req.url));
        }

        const state = createInstagramOAuthState(profile.id, profile.community_id || DEFAULT_COMMUNITY_ID);
        return NextResponse.redirect(buildInstagramConnectUrl(state));
    } catch (error) {
        const message = encodeURIComponent(error instanceof Error ? error.message : 'No se pudo conectar Instagram.');
        return NextResponse.redirect(new URL(`/marketing/reels?instagram=error&detail=${message}`, req.url));
    }
}
