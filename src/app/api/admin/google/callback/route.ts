import { NextRequest, NextResponse } from 'next/server';
import { saveGoogleConnection } from '@/lib/coco/googleConnection';
import { googleRedirectUri, parseGoogleTokenResponse } from '@/lib/coco/googleOAuth';
import { PUBLIC_SITE_URL } from '@/lib/config';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';

export const dynamic = 'force-dynamic';

function back(error?: string) {
    const url = new URL('/admin/coco-google', PUBLIC_SITE_URL);
    if (error) url.searchParams.set('error', error);
    else url.searchParams.set('connected', '1');
    const response = NextResponse.redirect(url);
    response.cookies.set('cc_google_oauth', '', { path: '/api/admin/google', maxAge: 0 });
    return response;
}

export async function GET(req: NextRequest) {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile || profile.role !== 'admin' || !profile.community_id) return back('sesion');
    const expected = req.cookies.get('cc_google_oauth')?.value || '';
    const state = req.nextUrl.searchParams.get('state') || '';
    const code = req.nextUrl.searchParams.get('code') || '';
    if (!expected || state !== expected || !code) return back('estado');

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
    if (!clientId || !clientSecret) return back('config');

    try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: googleRedirectUri(PUBLIC_SITE_URL),
                grant_type: 'authorization_code',
            }),
            signal: AbortSignal.timeout(10_000),
        });
        if (!tokenResponse.ok) return back('token');
        const parsed = parseGoogleTokenResponse(await tokenResponse.json());
        if (!parsed) return back('token');
        const infoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
            headers: { Authorization: `Bearer ${parsed.accessToken}` },
            signal: AbortSignal.timeout(8_000),
        });
        if (!infoResponse.ok) return back('perfil');
        const info = await infoResponse.json() as { email?: unknown };
        const email = typeof info.email === 'string' ? info.email.trim().toLowerCase() : '';
        if (!email) return back('perfil');
        await saveGoogleConnection({
            userId: profile.id,
            communityId: profile.community_id,
            tokens: { ...parsed, email },
        });
        return back();
    } catch (error) {
        console.error('[coco google] callback failed', error instanceof Error ? error.message : 'error');
        return back('guardar');
    }
}
