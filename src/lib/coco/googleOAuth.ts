/**
 * OAuth de Google para un administrador: Gmail y Calendar, con los scopes mínimos.
 * No guarda tokens. El cifrado y la base viven en googleConnection.
 */

export const GOOGLE_SCOPES = [
    'openid',
    'email',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
] as const;

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export function googleRedirectUri(siteUrl: string) {
    return `${siteUrl.replace(/\/$/, '')}/api/admin/google/callback`;
}

export function googleAuthUrl(input: { clientId: string; redirectUri: string; state: string }) {
    const params = new URLSearchParams({
        client_id: input.clientId,
        redirect_uri: input.redirectUri,
        response_type: 'code',
        scope: GOOGLE_SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'false',
        state: input.state,
    });
    return `${AUTH_URL}?${params.toString()}`;
}

export type GoogleTokenSet = {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: string;
    email: string;
    scopes: string[];
};

export function parseGoogleTokenResponse(payload: unknown, now = Date.now()): Omit<GoogleTokenSet, 'email'> | null {
    if (!payload || typeof payload !== 'object') return null;
    const body = payload as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown };
    if (typeof body.access_token !== 'string' || !body.access_token) return null;
    const expiresIn = Number(body.expires_in);
    const seconds = Number.isFinite(expiresIn) && expiresIn > 30 ? expiresIn : 3600;
    const scopes = typeof body.scope === 'string'
        ? body.scope.split(/\s+/).filter(scope => (GOOGLE_SCOPES as readonly string[]).includes(scope) || scope === 'openid' || scope === 'email')
        : [];
    return {
        accessToken: body.access_token,
        refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
        expiresAt: new Date(now + seconds * 1000).toISOString(),
        scopes,
    };
}

export function gmailRawMessage(input: { to: string; subject: string; body: string }) {
    const subject = `=?UTF-8?B?${Buffer.from(input.subject, 'utf8').toString('base64')}?=`;
    const raw = [
        `To: ${input.to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        input.body,
    ].join('\r\n');
    return Buffer.from(raw, 'utf8').toString('base64url');
}

export function singleEmail(value: string): string | null {
    const email = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return null;
    return email;
}
