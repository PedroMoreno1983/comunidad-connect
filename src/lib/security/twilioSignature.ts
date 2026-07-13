import crypto from 'crypto';

/**
 * Valida que el POST venga realmente de Twilio (algoritmo oficial:
 * HMAC-SHA1 de la URL exacta del webhook + parametros ordenados, con el
 * Auth Token como llave). Sin esto, cualquiera que conozca la URL puede
 * hacerse pasar por un numero de WhatsApp verificado.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioSignature(
    signature: string | null,
    params: Record<string, string>,
    webhookUrl: string,
    authToken: string | undefined,
): boolean {
    if (!authToken) return false;
    if (!signature) return false;

    const sortedBody = Object.keys(params)
        .sort()
        .map(key => `${key}${params[key]}`)
        .join('');

    const expected = crypto
        .createHmac('sha1', authToken)
        .update(webhookUrl + sortedBody, 'utf8')
        .digest('base64');

    const provided = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    return provided.length === expectedBuf.length && crypto.timingSafeEqual(provided, expectedBuf);
}
