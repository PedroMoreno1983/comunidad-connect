import crypto from 'node:crypto';
import { PUBLIC_SITE_URL } from '@/lib/config';

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const INSTAGRAM_GRAPH_BASE_URL = `https://graph.instagram.com/${GRAPH_VERSION}`;
const INSTAGRAM_DIALOG_URL = 'https://www.instagram.com/oauth/authorize';
const INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const INSTAGRAM_LONG_TOKEN_URL = 'https://graph.instagram.com/access_token';
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

type InstagramOAuthState = {
    profileId: string;
    communityId: string;
    nonce: string;
    issuedAt: number;
};

export type InstagramPageCandidate = {
    pageId: string;
    pageName: string;
    pageAccessToken: string;
    instagramUserId: string;
    instagramUsername: string;
};

function getMetaAppId() {
    return process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || '';
}

function getMetaAppSecret() {
    return process.env.META_APP_SECRET || '';
}

function getStateSecret() {
    return process.env.META_OAUTH_STATE_SECRET || getMetaAppSecret();
}

function base64UrlEncode(value: string | Buffer) {
    return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value: string) {
    return Buffer.from(value, 'base64url').toString('utf8');
}

function signStatePayload(payload: string) {
    const secret = getStateSecret();
    if (!secret) throw new Error('Falta configurar META_APP_SECRET o META_OAUTH_STATE_SECRET.');
    return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function getTokenKey() {
    const seed = process.env.META_TOKEN_ENCRYPTION_KEY || getMetaAppSecret();
    if (!seed) throw new Error('Falta configurar META_APP_SECRET o META_TOKEN_ENCRYPTION_KEY.');
    return crypto.createHash('sha256').update(seed).digest();
}

export function isInstagramOAuthConfigured() {
    return Boolean(getMetaAppId() && getMetaAppSecret());
}

export function getInstagramRedirectUri() {
    const configured = process.env.META_REDIRECT_URI?.trim();
    if (configured) return configured;
    return `${PUBLIC_SITE_URL}/api/marketing/instagram/callback`;
}

export function createInstagramOAuthState(profileId: string, communityId: string) {
    const state: InstagramOAuthState = {
        profileId,
        communityId,
        nonce: crypto.randomBytes(16).toString('hex'),
        issuedAt: Date.now(),
    };
    const payload = base64UrlEncode(JSON.stringify(state));
    return `${payload}.${signStatePayload(payload)}`;
}

export function verifyInstagramOAuthState(rawState: string) {
    const [payload, signature] = rawState.split('.');
    if (!payload || !signature) throw new Error('Estado OAuth invalido.');

    const expected = signStatePayload(payload);
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
        throw new Error('Estado OAuth no coincide.');
    }

    const state = JSON.parse(base64UrlDecode(payload)) as InstagramOAuthState;
    if (!state.profileId || !state.communityId || !state.issuedAt) throw new Error('Estado OAuth incompleto.');
    if (Date.now() - state.issuedAt > STATE_MAX_AGE_MS) throw new Error('Estado OAuth vencido. Intenta conectar Instagram nuevamente.');
    return state;
}

export function buildInstagramConnectUrl(state: string) {
    const appId = getMetaAppId();
    if (!appId || !getMetaAppSecret()) {
        throw new Error('Falta configurar META_APP_ID y META_APP_SECRET en Vercel.');
    }

    const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: getInstagramRedirectUri(),
        state,
        response_type: 'code',
        enable_fb_login: '0',
        force_authentication: '1',
        scope: [
            'instagram_business_basic',
            'instagram_business_content_publish',
        ].join(','),
    });

    return `${INSTAGRAM_DIALOG_URL}?${params.toString()}`;
}

async function getGraphJson<T>(url: string) {
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || 'Meta rechazo la solicitud.');
    return data;
}

export async function exchangeInstagramCodeForLongLivedToken(code: string) {
    const appId = getMetaAppId();
    const appSecret = getMetaAppSecret();
    if (!appId || !appSecret) throw new Error('Falta configurar META_APP_ID y META_APP_SECRET en Vercel.');

    const body = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: getInstagramRedirectUri(),
        code,
    });
    const response = await fetch(INSTAGRAM_TOKEN_URL, {
        method: 'POST',
        body,
        cache: 'no-store',
    });
    const shortToken = await response.json().catch(() => ({})) as { access_token?: string; user_id?: string; error_message?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(shortToken.error?.message || shortToken.error_message || 'Instagram rechazo el codigo de autorizacion.');
    if (!shortToken.access_token) throw new Error('Meta no devolvio access_token.');

    const longTokenUrl = new URL(INSTAGRAM_LONG_TOKEN_URL);
    longTokenUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longTokenUrl.searchParams.set('client_secret', appSecret);
    longTokenUrl.searchParams.set('access_token', shortToken.access_token);
    const longToken = await getGraphJson<{ access_token?: string; expires_in?: number }>(longTokenUrl.toString());

    return {
        accessToken: longToken.access_token || shortToken.access_token,
        expiresIn: longToken.expires_in || null,
        instagramUserId: shortToken.user_id ? String(shortToken.user_id) : '',
    };
}

type AccountsResponse = {
    data?: Array<{
        id?: string;
        name?: string;
        access_token?: string;
        instagram_business_account?: {
            id?: string;
            username?: string;
            name?: string;
        };
        connected_instagram_account?: {
            id?: string;
            username?: string;
            name?: string;
        };
    }>;
};

export async function findInstagramPageCandidate(userAccessToken: string): Promise<InstagramPageCandidate> {
    const instagramUrl = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/me`);
    instagramUrl.searchParams.set('fields', 'user_id,username');
    instagramUrl.searchParams.set('access_token', userAccessToken);

    const instagramProfile = await getGraphJson<{ id?: string; user_id?: string; username?: string }>(instagramUrl.toString());
    const instagramUserId = instagramProfile.user_id || instagramProfile.id;
    if (instagramUserId) {
        return {
            pageId: 'instagram_login',
            pageName: 'Instagram Login',
            pageAccessToken: userAccessToken,
            instagramUserId: String(instagramUserId),
            instagramUsername: instagramProfile.username || 'instagram',
        };
    }

    const accountsUrl = new URL(`${GRAPH_BASE_URL}/me/accounts`);
    accountsUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username,name},connected_instagram_account{id,username,name}');
    accountsUrl.searchParams.set('access_token', userAccessToken);

    const accounts = await getGraphJson<AccountsResponse>(accountsUrl.toString());
    const candidate = (accounts.data || []).find(page => page.access_token && (page.instagram_business_account?.id || page.connected_instagram_account?.id));
    if (!candidate?.id || !candidate.access_token) {
        throw new Error('No encontre una Pagina de Facebook conectada a una cuenta profesional de Instagram.');
    }

    const pageInstagram = candidate.instagram_business_account || candidate.connected_instagram_account;
    if (!pageInstagram?.id) throw new Error('La Pagina no tiene una cuenta profesional de Instagram conectada.');

    return {
        pageId: candidate.id,
        pageName: candidate.name || 'Pagina Meta',
        pageAccessToken: candidate.access_token,
        instagramUserId: pageInstagram.id,
        instagramUsername: pageInstagram.username || pageInstagram.name || 'instagram',
    };
}

export function encryptMetaToken(token: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getTokenKey(), iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${base64UrlEncode(Buffer.concat([iv, tag, encrypted]))}`;
}

export function decryptMetaToken(value: string) {
    if (!value) return '';
    if (!value.startsWith('enc:')) return value.startsWith('plain:') ? value.slice(6) : value;

    const payload = Buffer.from(value.slice(4), 'base64url');
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getTokenKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function tokenExpiryDate(expiresIn: number | null) {
    if (!expiresIn) return null;
    return new Date(Date.now() + expiresIn * 1000).toISOString();
}
