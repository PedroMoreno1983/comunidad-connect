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

/**
 * Valida la firma contra varias URLs candidatas.
 *
 * El HMAC se calcula sobre la URL exacta que Twilio invocó, asi que basta con
 * que el sitio responda en mas de un dominio —el propio y el de Vercel— para
 * que la validacion falle con un 401 silencioso aunque el token sea correcto.
 * Probar la URL configurada y tambien la que llego en la peticion evita ese
 * desajuste sin debilitar nada: cada candidata sigue exigiendo un HMAC valido
 * hecho con el Auth Token, que solo Twilio conoce.
 */
export function verifyTwilioSignatureForUrls(
    signature: string | null,
    params: Record<string, string>,
    webhookUrls: (string | null | undefined)[],
    authToken: string | undefined,
): boolean {
    const seen = new Set<string>();
    for (const url of webhookUrls) {
        if (!url || seen.has(url)) continue;
        seen.add(url);
        if (verifyTwilioSignature(signature, params, url, authToken)) return true;
    }
    return false;
}

/**
 * Reconstruye la URL publica de la peticion tal como la vio Twilio. En Vercel
 * el host real llega en las cabeceras de proxy, no en req.url.
 */
export function publicRequestUrl(req: Request, path: string): string | null {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (!host) return null;
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${host}${path}`;
}
