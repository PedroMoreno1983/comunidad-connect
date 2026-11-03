import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { checkDistributedRateLimitBySubject, enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { BRAND, FROM_EMAIL, emailWrapper, escapeEmailHtml, resend } from '@/lib/email';
import { CANONICAL_SITE_URL } from '@/lib/config';
import { logger, resolveRequestId } from '@/lib/observability/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    const limited = await enforceDistributedRateLimit(request, 'auth.password_reset', {
        limit: 3, windowMs: 15 * 60_000,
    });
    if (limited) return limited;

    const generic = NextResponse.json({ ok: true });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 180) : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return generic;
    const allowed = await checkDistributedRateLimitBySubject(email, 'auth.password_reset.email', {
        limit: 2, windowMs: 15 * 60_000,
    });
    if (!allowed) return generic;

    try {
        const admin = getSupabaseAdmin();
        const { data: profile, error: profileError } = await admin.from('profiles')
            .select('id,email').eq('email', email).maybeSingle();
        if (profileError) throw profileError;
        if (!profile) return generic;

        const { data: link, error: linkError } = await admin.auth.admin.generateLink({
            type: 'recovery', email,
        });
        if (linkError) throw linkError;
        const tokenHash = link.properties?.hashed_token;
        if (!tokenHash) throw new Error('Recovery token unavailable');

        const url = `${CANONICAL_SITE_URL}/api/auth/password-reset/confirm?token_hash=${encodeURIComponent(tokenHash)}`;
        const { error: sendError } = await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: 'Crea una nueva contraseña para Convive Connect',
            html: emailWrapper(`
                <h1 style="color:${BRAND.ink};">Crea una nueva contraseña</h1>
                <p>Solicitaste recuperar el acceso a Convive Connect. El enlace es personal y de un solo uso.</p>
                <p style="margin:28px 0;"><a href="${escapeEmailHtml(url)}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:${BRAND.ink};color:#fff;text-decoration:none;">Crear contraseña</a></p>
                <p>Si no lo solicitaste, ignora este correo.</p>
            `, 'Recuperar acceso'),
        });
        if (sendError) throw sendError;
    } catch (error) {
        logger.warn('auth.password_reset_failed', { requestId: resolveRequestId(request), error });
    }
    return generic;
}
