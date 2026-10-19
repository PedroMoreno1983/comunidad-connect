import { NextRequest, NextResponse } from 'next/server';
import { checkDistributedRateLimitBySubject, enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { BRAND, FROM_EMAIL, emailWrapper, escapeEmailHtml, resend } from '@/lib/email';
import { CANONICAL_SITE_URL } from '@/lib/config';
import { logger, resolveRequestId } from '@/lib/observability/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    const limited = await enforceDistributedRateLimit(request, 'auth.resident_access', {
        limit: 3,
        windowMs: 15 * 60_000,
    });
    if (limited) return limited;

    const genericResponse = NextResponse.json({ ok: true });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 180) : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return genericResponse;
    const emailAllowed = await checkDistributedRateLimitBySubject(email, 'auth.resident_access.email', {
        limit: 2,
        windowMs: 15 * 60_000,
    });
    if (!emailAllowed) return genericResponse;

    try {
        const admin = getSupabaseAdmin();
        const { data: profile, error: profileError } = await admin.from('profiles')
            .select('id, name, email, role, unit_id')
            .eq('email', email)
            .maybeSingle();
        if (profileError) throw profileError;
        if (!profile || profile.role !== 'resident' || !profile.unit_id) return genericResponse;

        const { data: authUser, error: authError } = await admin.auth.admin.getUserById(String(profile.id));
        if (authError) throw authError;
        if (authUser.user?.email?.toLowerCase() !== email) return genericResponse;

        const { data: link, error: linkError } = await admin.auth.admin.generateLink({
            type: 'magiclink',
            email,
        });
        if (linkError) throw linkError;
        const tokenHash = link.properties?.hashed_token;
        if (!tokenHash) throw new Error('Magic link token hash unavailable');

        const url = `${CANONICAL_SITE_URL}/api/auth/resident-confirm?token_hash=${encodeURIComponent(tokenHash)}`;
        const residentName = escapeEmailHtml(profile.name || 'residente');
        const safeUrl = escapeEmailHtml(url);
        const html = emailWrapper(`
            <h1 style="font-family:${BRAND.serif};font-size:30px;font-weight:400;color:${BRAND.ink};">Hola, ${residentName}</h1>
            <p style="color:${BRAND.inkMuted};font-size:15px;line-height:1.6;">Usa este enlace para entrar a tu comunidad. El enlace es personal y de un solo uso.</p>
            <p style="color:${BRAND.inkMuted};font-size:13px;line-height:1.6;">Al pulsar el botón aceptas los <a href="${CANONICAL_SITE_URL}/terms">términos del servicio</a> y confirmas que leíste la <a href="${CANONICAL_SITE_URL}/privacy">política de privacidad</a>.</p>
            <p style="margin:28px 0;"><a href="${safeUrl}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:${BRAND.ink};color:#fff;text-decoration:none;font-weight:600;">Aceptar y entrar</a></p>
            <p style="color:${BRAND.inkTertiary};font-size:13px;">Si no solicitaste este acceso, ignora este correo.</p>
        `, 'Acceso de residentes');
        const { error: sendError } = await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: 'Tu acceso a Convive Connect',
            html,
        });
        if (sendError) throw sendError;
    } catch (error) {
        logger.warn('auth.resident_access_failed', { requestId: resolveRequestId(request), error });
    }
    return genericResponse;
}
