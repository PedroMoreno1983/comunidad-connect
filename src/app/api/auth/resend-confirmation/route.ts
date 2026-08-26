import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { PUBLIC_SITE_URL } from '@/lib/config';
import { logger, resolveRequestId } from '@/lib/observability/logger';

export const runtime = 'nodejs';

/**
 * Reenvía el correo de verificación de una cuenta ya creada.
 *
 * Existe porque el envío del correo no forma parte de la creación de la
 * cuenta: si falla (por ejemplo al topar el rate limit de Supabase), la
 * cuenta se conserva y el residente necesita una forma de pedir el enlace
 * otra vez. Sin esto, un correo perdido dejaba la cuenta inaccesible para
 * siempre y sin explicación.
 */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'auth.resend_confirmation', {
        limit: 3,
        windowMs: 15 * 60_000,
    });
    if (limited) return limited;

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';

    // La respuesta es siempre la misma, exista o no la cuenta: de lo contrario
    // este endpoint serviría para averiguar qué correos están registrados.
    const genericResponse = NextResponse.json({
        ok: true,
        message: 'Si esa cuenta existe y aún no está verificada, te enviamos un enlace nuevo.',
    });

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return genericResponse;

    const { error } = await getSupabaseAdmin().auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${PUBLIC_SITE_URL}/login?confirmed=1` },
    });

    if (error) {
        logger.warn('auth.resend_confirmation_failed', {
            requestId: resolveRequestId(req),
            error,
        });
    }

    return genericResponse;
}
