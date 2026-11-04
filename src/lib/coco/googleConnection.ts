/**
 * Tokens de Google de un administrador, cifrados con INTEGRATION_ENCRYPTION_KEY.
 * El cliente nunca recibe el token. Desconectar borra la fila.
 */

import { isSecretBoxConfigured, openSecret, sealSecret } from '@/lib/security/secretBox';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { GOOGLE_SCOPES, parseGoogleTokenResponse, type GoogleTokenSet } from './googleOAuth';

type StoredConnection = {
    id: string;
    user_id: string;
    community_id: string;
    google_email: string;
    access_token: string;
    refresh_token: string | null;
    scopes: string[];
    expires_at: string;
};

function rowToConnection(row: Record<string, unknown>): StoredConnection | null {
    if (typeof row.access_token !== 'string' || typeof row.google_email !== 'string') return null;
    return {
        id: String(row.id),
        user_id: String(row.user_id),
        community_id: String(row.community_id),
        google_email: row.google_email,
        access_token: row.access_token,
        refresh_token: typeof row.refresh_token === 'string' ? row.refresh_token : null,
        scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
        expires_at: String(row.expires_at),
    };
}

export async function googleConnectionStatus(userId: string) {
    const { data, error } = await getSupabaseAdmin()
        .from('coco_google_connections')
        .select('google_email, scopes, expires_at')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) throw error;
    if (!data) return { connected: false as const, encryptionReady: isSecretBoxConfigured() };
    return {
        connected: true as const,
        email: String(data.google_email),
        scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
        encryptionReady: isSecretBoxConfigured(),
    };
}

export async function saveGoogleConnection(input: {
    userId: string;
    communityId: string;
    tokens: GoogleTokenSet;
}) {
    if (!isSecretBoxConfigured()) throw new Error('Falta la clave para cifrar la conexión de Google.');
    const { error } = await getSupabaseAdmin().from('coco_google_connections').upsert({
        user_id: input.userId,
        community_id: input.communityId,
        google_email: input.tokens.email,
        access_token: sealSecret(input.tokens.accessToken),
        refresh_token: input.tokens.refreshToken ? sealSecret(input.tokens.refreshToken) : null,
        scopes: input.tokens.scopes,
        expires_at: input.tokens.expiresAt,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
}

export async function disconnectGoogle(userId: string) {
    const { error } = await getSupabaseAdmin().from('coco_google_connections').delete().eq('user_id', userId);
    if (error) throw error;
}

async function refreshAccessToken(connection: StoredConnection): Promise<string> {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
    if (!connection.refresh_token || !clientId || !clientSecret) {
        throw new Error('La conexión de Google venció. Vuelve a conectarla.');
    }
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: openSecret(connection.refresh_token),
            grant_type: 'refresh_token',
        }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('No pude renovar la conexión de Google.');
    const parsed = parseGoogleTokenResponse(await response.json());
    if (!parsed) throw new Error('Google no devolvió un token usable.');
    const accessToken = parsed.accessToken;
    await getSupabaseAdmin().from('coco_google_connections').update({
        access_token: sealSecret(accessToken),
        expires_at: parsed.expiresAt,
        scopes: parsed.scopes.length ? parsed.scopes : connection.scopes,
        updated_at: new Date().toISOString(),
    }).eq('id', connection.id);
    return accessToken;
}

export async function googleAccessForUser(userId: string): Promise<{ accessToken: string; email: string } | null> {
    const { data, error } = await getSupabaseAdmin()
        .from('coco_google_connections')
        .select('id, user_id, community_id, google_email, access_token, refresh_token, scopes, expires_at')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) throw error;
    const connection = data ? rowToConnection(data as Record<string, unknown>) : null;
    if (!connection) return null;
    const expires = new Date(connection.expires_at).getTime();
    const accessToken = expires - Date.now() < 60_000
        ? await refreshAccessToken(connection)
        : openSecret(connection.access_token);
    return { accessToken, email: connection.google_email };
}

export function requiredGoogleScopes() {
    return GOOGLE_SCOPES;
}
