import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { verifyTwilioSignature, verifyTwilioSignatureForUrls } from '@/lib/security/twilioSignature';

/**
 * La firma de Twilio es un HMAC sobre la URL exacta que invocó. Cuando el sitio
 * responde en más de un dominio, validar contra una URL fija rechaza con 401
 * mensajes legítimos — y el residente solo ve que CoCo no contesta.
 */
const TOKEN = 'c0ffee00000000000000000000000000';
const PARAMS = { Body: 'hola', From: 'whatsapp:+56999474056', WaId: '56999474056' };

function sign(url: string, params: Record<string, string>, token = TOKEN) {
    const sorted = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
    return crypto.createHmac('sha1', token).update(url + sorted, 'utf8').digest('base64');
}

describe('verifyTwilioSignature', () => {
    const url = 'https://conviveconnect.com/api/coco/whatsapp';

    it('acepta una firma legítima', () => {
        expect(verifyTwilioSignature(sign(url, PARAMS), PARAMS, url, TOKEN)).toBe(true);
    });

    it('rechaza si la URL no coincide exactamente', () => {
        const otra = 'https://convive.vercel.app/api/coco/whatsapp';
        expect(verifyTwilioSignature(sign(url, PARAMS), PARAMS, otra, TOKEN)).toBe(false);
    });

    it('rechaza si el token no coincide', () => {
        expect(verifyTwilioSignature(sign(url, PARAMS), PARAMS, url, 'otro-token-distinto')).toBe(false);
    });

    it('rechaza si falta la firma o el token', () => {
        expect(verifyTwilioSignature(null, PARAMS, url, TOKEN)).toBe(false);
        expect(verifyTwilioSignature(sign(url, PARAMS), PARAMS, url, undefined)).toBe(false);
    });

    it('rechaza si se altero un parametro', () => {
        const firma = sign(url, PARAMS);
        expect(verifyTwilioSignature(firma, { ...PARAMS, Body: 'otra cosa' }, url, TOKEN)).toBe(false);
    });
});

describe('verifyTwilioSignatureForUrls', () => {
    const apex = 'https://conviveconnect.com/api/coco/whatsapp';
    const vercel = 'https://convive.vercel.app/api/coco/whatsapp';

    it('acepta cuando la firma corresponde a cualquiera de las candidatas', () => {
        // Este es el caso que provocaba el 401: Twilio llama al dominio propio
        // mientras NEXT_PUBLIC_SITE_URL apunta al de Vercel.
        expect(verifyTwilioSignatureForUrls(sign(apex, PARAMS), PARAMS, [vercel, apex], TOKEN)).toBe(true);
        expect(verifyTwilioSignatureForUrls(sign(vercel, PARAMS), PARAMS, [vercel, apex], TOKEN)).toBe(true);
    });

    it('sigue rechazando una firma que no corresponde a ninguna', () => {
        const ajena = 'https://otro-sitio.com/api/coco/whatsapp';
        expect(verifyTwilioSignatureForUrls(sign(ajena, PARAMS), PARAMS, [vercel, apex], TOKEN)).toBe(false);
    });

    it('ignora candidatas vacias sin caerse', () => {
        expect(verifyTwilioSignatureForUrls(sign(apex, PARAMS), PARAMS, [null, undefined, '', apex], TOKEN)).toBe(true);
        expect(verifyTwilioSignatureForUrls(sign(apex, PARAMS), PARAMS, [null, undefined], TOKEN)).toBe(false);
    });

    it('no acepta nada si el token es incorrecto, por muchas URLs que se prueben', () => {
        expect(verifyTwilioSignatureForUrls(sign(apex, PARAMS, 'token-atacante'), PARAMS, [vercel, apex], TOKEN)).toBe(false);
    });
});
