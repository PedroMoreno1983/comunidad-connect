import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { googleAuthUrl, googleRedirectUri } from '@/lib/coco/googleOAuth';
import { PUBLIC_SITE_URL } from '@/lib/config';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { isSecretBoxConfigured } from '@/lib/security/secretBox';

export const dynamic = 'force-dynamic';

export async function GET() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile || profile.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
    if (!clientId || !process.env.GOOGLE_CLIENT_SECRET?.trim()) {
        return NextResponse.json({ error: 'Google no está configurado.' }, { status: 503 });
    }
    if (!isSecretBoxConfigured()) {
        return NextResponse.json({ error: 'Falta la clave para cifrar la conexión.' }, { status: 503 });
    }
    const state = randomBytes(24).toString('base64url');
    const url = googleAuthUrl({
        clientId,
        redirectUri: googleRedirectUri(PUBLIC_SITE_URL),
        state,
    });
    const response = NextResponse.redirect(url);
    response.cookies.set('cc_google_oauth', state, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/api/admin/google',
        maxAge: 600,
    });
    return response;
}
