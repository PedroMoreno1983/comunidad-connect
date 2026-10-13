import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Credenciales de integraciones de terceros (por ejemplo, la API key de
// facturación de cada comunidad). AES-256-GCM con la clave de
// INTEGRATION_ENCRYPTION_KEY (32 bytes en base64): sin ella no se guarda nada.
const PREFIX = 'sb1:';

function key() {
    const raw = process.env.INTEGRATION_ENCRYPTION_KEY?.trim() || '';
    const buffer = Buffer.from(raw, 'base64');
    if (buffer.length !== 32) {
        throw new Error('Falta INTEGRATION_ENCRYPTION_KEY (32 bytes en base64) para guardar credenciales de integraciones.');
    }
    return buffer;
}

export function isSecretBoxConfigured() {
    try {
        key();
        return true;
    } catch {
        return false;
    }
}

export function sealSecret(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

export function openSecret(sealed: string): string {
    if (!sealed.startsWith(PREFIX)) throw new Error('Credencial guardada con un formato desconocido.');
    const payload = Buffer.from(sealed.slice(PREFIX.length), 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
}
