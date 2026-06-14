import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordOperationEvent } from '@/lib/operations/audit';
import {
    encryptMetaToken,
    exchangeInstagramCodeForLongLivedToken,
    findInstagramPageCandidate,
    tokenExpiryDate,
    verifyInstagramOAuthState,
} from '@/lib/marketing/instagramOAuth';

function redirectToReels(req: NextRequest, params: Record<string, string>) {
    const url = new URL('/marketing/reels', req.url);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
    const limited = enforceRateLimit(req, 'marketing.instagram.callback', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const url = new URL(req.url);
    const code = url.searchParams.get('code') || '';
    const rawState = url.searchParams.get('state') || '';
    const metaError = url.searchParams.get('error_description') || url.searchParams.get('error_message') || '';

    try {
        if (metaError) throw new Error(metaError);
        if (!code || !rawState) throw new Error('Meta no devolvio codigo de autorizacion.');

        const state = verifyInstagramOAuthState(rawState);
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return redirectToReels(req, { instagram: 'login_required' });
        if (profile.role !== 'admin') return redirectToReels(req, { instagram: 'forbidden' });
        if (profile.id !== state.profileId || (profile.community_id || state.communityId) !== state.communityId) {
            throw new Error('La sesion no coincide con la autorizacion de Instagram.');
        }

        const token = await exchangeInstagramCodeForLongLivedToken(code);
        const candidate = await findInstagramPageCandidate(token.accessToken);
        const encryptedPageToken = encryptMetaToken(candidate.pageAccessToken);
        const admin = getSupabaseAdmin();

        const { error } = await admin
            .from('instagram_connections')
            .upsert({
                community_id: state.communityId,
                connected_by: profile.id,
                instagram_user_id: candidate.instagramUserId,
                username: candidate.instagramUsername,
                page_id: candidate.pageId,
                encrypted_access_token: encryptedPageToken,
                token_expires_at: tokenExpiryDate(token.expiresIn),
                status: 'connected',
                last_error: null,
                connected_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'community_id' });

        if (error) throw error;

        await recordOperationEvent({
            communityId: state.communityId,
            actorId: profile.id,
            actorRole: profile.role,
            action: 'marketing.instagram.connected',
            entityType: 'instagram_connection',
            entityId: candidate.instagramUserId,
            severity: 'info',
            status: 'success',
            summary: `Instagram conectado: @${candidate.instagramUsername}`,
            metadata: {
                pageId: candidate.pageId,
                pageName: candidate.pageName,
                instagramUserId: candidate.instagramUserId,
                username: candidate.instagramUsername,
            },
        });

        return redirectToReels(req, { instagram: 'connected' });
    } catch (error) {
        const detail = error instanceof Error ? error.message : 'No se pudo conectar Instagram.';
        return redirectToReels(req, { instagram: 'error', detail });
    }
}
