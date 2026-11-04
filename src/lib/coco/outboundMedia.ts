/**
 * Archivo que Twilio puede bajar una sola vez, con una firma que caduca.
 * El secreto no viaja en la URL: solo un HMAC corto.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { CANONICAL_SITE_URL } from '@/lib/config';

export const MEDIA_TTL_MS = 15 * 60 * 1000;

export function mediaSigningSecret(): string {
    return (process.env.WHATSAPP_WEBHOOK_SECRET || process.env.CRON_SECRET || '').trim();
}

export function signMediaAccess(id: string, expiresAtMs: number, secret = mediaSigningSecret()): string {
    return createHmac('sha256', secret).update(`${id}.${expiresAtMs}`).digest('base64url');
}

export function verifyMediaAccess(id: string, expiresAtMs: number, signature: string, now = Date.now(), secret = mediaSigningSecret()): boolean {
    if (!secret || !signature || !Number.isFinite(expiresAtMs) || expiresAtMs < now) return false;
    const expected = signMediaAccess(id, expiresAtMs, secret);
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
}

export function mediaPublicUrl(id: string, expiresAtMs: number, secret = mediaSigningSecret()): string {
    const signature = signMediaAccess(id, expiresAtMs, secret);
    const url = new URL(`/api/coco/media/${id}`, CANONICAL_SITE_URL);
    url.searchParams.set('e', String(expiresAtMs));
    url.searchParams.set('s', signature);
    return url.toString();
}
