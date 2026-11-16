/**
 * Envío de notificaciones push por Firebase Cloud Messaging (API HTTP v1).
 * Solo servidor. Dos formas de identificarse ante Google:
 *
 * 1. Sin clave (la que se usa en producción): Vercel firma un token OIDC por
 *    despliegue y Google lo cambia por acceso a la cuenta de servicio de
 *    Firebase (Workload Identity Federation). La organización de Google prohíbe
 *    crear claves de cuentas de servicio, así que esta es la vía. Variables:
 *    FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT_EMAIL y
 *    FIREBASE_WORKLOAD_IDENTITY_PROVIDER (projects/<n>/locations/global/
 *    workloadIdentityPools/<pool>/providers/<provider>).
 * 2. Con clave: FIREBASE_SERVICE_ACCOUNT, el JSON de la cuenta de servicio en
 *    una sola línea. Sirve fuera de Vercel.
 *
 * Sin ninguna de las dos no se envía nada y el aviso queda solo en la app.
 */
import { createSign } from 'node:crypto';
import { getVercelOidcToken } from '@vercel/oidc';
import type { PushMessage, PushSendResult } from '@/lib/types';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

interface ServiceAccount {
    project_id: string;
    client_email: string;
    private_key: string;
}

interface FederatedAccount {
    projectId: string;
    serviceAccountEmail: string;
    provider: string;
}

type Credential = { kind: 'key'; account: ServiceAccount } | { kind: 'federated'; account: FederatedAccount };

let cachedToken: { value: string; expiresAt: number } | null = null;

export function readFederatedAccount(env: NodeJS.ProcessEnv = process.env): FederatedAccount | null {
    const projectId = env.FIREBASE_PROJECT_ID?.trim();
    const serviceAccountEmail = env.FIREBASE_SERVICE_ACCOUNT_EMAIL?.trim();
    const provider = env.FIREBASE_WORKLOAD_IDENTITY_PROVIDER?.trim();
    if (!projectId || !serviceAccountEmail || !provider) return null;
    if (!/^projects\/\d+\/locations\/global\/workloadIdentityPools\/[\w-]+\/providers\/[\w-]+$/.test(provider)) return null;
    return { projectId, serviceAccountEmail, provider };
}

function readCredential(): Credential | null {
    const federated = readFederatedAccount();
    if (federated) return { kind: 'federated', account: federated };
    const account = readServiceAccount();
    return account ? { kind: 'key', account } : null;
}

export function readServiceAccount(raw = process.env.FIREBASE_SERVICE_ACCOUNT): ServiceAccount | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
        if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
        return {
            project_id: parsed.project_id,
            client_email: parsed.client_email,
            // Vercel a veces guarda los saltos de línea de la llave como "\n" literal.
            private_key: parsed.private_key.replace(/\\n/g, '\n'),
        };
    } catch {
        return null;
    }
}

function base64url(input: string | Buffer): string {
    return Buffer.from(input).toString('base64url');
}

async function federatedAccessToken(account: FederatedAccount, now: number): Promise<{ value: string; expiresAt: number }> {
    // 1. Token OIDC de Vercel → token federado de Google (STS).
    const subjectToken = await getVercelOidcToken();
    const sts = await fetch('https://sts.googleapis.com/v1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
            audience: `//iam.googleapis.com/${account.provider}`,
            scope: 'https://www.googleapis.com/auth/cloud-platform',
            requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
            subjectToken,
            subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
        }),
    });
    const stsData = await sts.json().catch(() => ({})) as { access_token?: string };
    if (!sts.ok || !stsData.access_token) throw new Error(`Google STS respondió ${sts.status}`);

    // 2. Token federado → acceso de la cuenta de servicio de Firebase, solo para FCM.
    const email = encodeURIComponent(account.serviceAccountEmail);
    const iam = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${email}:generateAccessToken`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${stsData.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: [FCM_SCOPE], lifetime: '3600s' }),
    });
    const iamData = await iam.json().catch(() => ({})) as { accessToken?: string; expireTime?: string };
    if (!iam.ok || !iamData.accessToken) throw new Error(`Google IAM Credentials respondió ${iam.status}`);
    const expires = iamData.expireTime ? Math.floor(Date.parse(iamData.expireTime) / 1000) : NaN;
    return { value: iamData.accessToken, expiresAt: Number.isFinite(expires) ? expires : now + 3600 };
}

async function accessToken(credential: Credential): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

    if (credential.kind === 'federated') {
        cachedToken = await federatedAccessToken(credential.account, now);
        return cachedToken.value;
    }

    const account = credential.account;
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({
        iss: account.client_email,
        scope: FCM_SCOPE,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    }));
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    const assertion = `${header}.${claims}.${signer.sign(account.private_key).toString('base64url')}`;

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
    if (!response.ok || !data.access_token) throw new Error(`Google OAuth respondió ${response.status}`);
    cachedToken = { value: data.access_token, expiresAt: now + (data.expires_in ?? 3600) };
    return data.access_token;
}

/** Cuerpo del mensaje de FCM. Separado para poder probarlo sin red. */
export function fcmMessageBody(token: string, message: PushMessage) {
    return {
        message: {
            token,
            notification: { title: message.title, body: message.body },
            data: { link: message.link ?? '', notificationId: message.notificationId },
            android: {
                priority: 'HIGH',
                notification: { channel_id: 'avisos', icon: 'ic_stat_notify', color: '#C99572' },
            },
            apns: { payload: { aps: { sound: 'default' } } },
        },
    };
}

/** Envía a cada token. Devuelve cuáles ya no sirven (app desinstalada) para borrarlos. */
export async function sendPush(tokens: string[], message: PushMessage): Promise<PushSendResult> {
    const credential = readCredential();
    if (!credential) return { sent: 0, failed: 0, invalidTokens: [], skipped: 'sin credencial de Firebase' };
    if (!tokens.length) return { sent: 0, failed: 0, invalidTokens: [] };

    const bearer = await accessToken(credential);
    const projectId = credential.kind === 'federated' ? credential.account.projectId : credential.account.project_id;
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    let sent = 0;
    let failed = 0;
    const invalidTokens: string[] = [];

    await Promise.all(tokens.map(async token => {
        const response = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(fcmMessageBody(token, message)),
        });
        if (response.ok) {
            sent += 1;
            return;
        }
        // 404 UNREGISTERED o 400 INVALID_ARGUMENT sobre el token: el teléfono ya no lo usa.
        const text = await response.text().catch(() => '');
        if (response.status === 404 || /UNREGISTERED|registration token/i.test(text)) invalidTokens.push(token);
        else failed += 1; // 429/5xx u otro error pasajero: se puede reintentar.
    }).map(p => p.catch(() => { failed += 1; })));

    return { sent, failed, invalidTokens };
}
