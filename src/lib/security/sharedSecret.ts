import crypto from 'crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Autorización por secreto compartido para endpoints internos: webhooks de
 * Supabase, crons y disparadores de servicio a servicio.
 *
 * Centraliza dos cosas que estaban repetidas y mal en varias rutas:
 *
 * 1. **Fallar cerrada.** El patrón `if (secret && token !== secret)` deja el
 *    endpoint abierto en cuanto la variable de entorno falta, que es
 *    justamente cuando algo está mal configurado. Aquí la ausencia de secreto
 *    es un 503, nunca un pase libre.
 * 2. **Comparar en tiempo constante.** `!==` sobre un secreto filtra su
 *    contenido por el tiempo de respuesta.
 */

/** Compara dos secretos sin filtrar su contenido por el tiempo de respuesta. */
export function matchesSharedSecret(provided: string | null | undefined, secret: string): boolean {
    if (!provided) return false;
    const providedBuffer = Buffer.from(provided, 'utf8');
    const secretBuffer = Buffer.from(secret, 'utf8');
    return providedBuffer.length === secretBuffer.length
        && crypto.timingSafeEqual(providedBuffer, secretBuffer);
}

function presentedSecrets(req: NextRequest, extraHeaders: string[]): (string | null)[] {
    const authorization = req.headers.get('authorization');
    return [
        authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null,
        ...extraHeaders.map(header => req.headers.get(header)),
    ];
}

/**
 * Autoriza una llamada interna. Devuelve la respuesta de rechazo, o `null` si
 * el llamante presentó el secreto correcto.
 *
 * Acepta `Authorization: Bearer <secreto>` y, opcionalmente, cabeceras
 * adicionales (`headers`) para invocaciones manuales o webhooks que no pueden
 * usar Authorization.
 */
export function denyUnlessSharedSecret(
    req: NextRequest,
    secret: string | undefined,
    options: { headers?: string[]; notConfiguredMessage?: string } = {},
): NextResponse | null {
    const trimmed = secret?.trim();
    if (!trimmed) {
        return NextResponse.json(
            { error: options.notConfiguredMessage ?? 'Endpoint interno no configurado.' },
            { status: 503 },
        );
    }

    const presented = presentedSecrets(req, options.headers ?? []);
    if (presented.some(candidate => matchesSharedSecret(candidate, trimmed))) return null;

    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
}
