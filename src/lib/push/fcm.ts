/**
 * Envío de notificaciones push por Firebase Cloud Messaging (API HTTP v1).
 * Solo servidor. Credencial: FIREBASE_SERVICE_ACCOUNT, el JSON de la cuenta de
 * servicio de Firebase (Configuración del proyecto → Cuentas de servicio) en una
 * sola línea. Sin esa variable no se envía nada y el aviso queda solo en la app.
 */
import { createSign } from 'node:crypto';
import type { PushMessage, PushSendResult } from '@/lib/types';

interface ServiceAccount {
    project_id: string;
    client_email: string;
    private_key: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

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

async function accessToken(account: ServiceAccount): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({
        iss: account.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
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
    const account = readServiceAccount();
    if (!account) return { sent: 0, failed: 0, invalidTokens: [], skipped: 'sin FIREBASE_SERVICE_ACCOUNT' };
    if (!tokens.length) return { sent: 0, failed: 0, invalidTokens: [] };

    const bearer = await accessToken(account);
    const url = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;
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
