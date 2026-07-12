import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { sendWelcomeEmail } from '@/lib/email';
import type { UserRole } from '@/lib/types';
import { logApiError, logger, resolveRequestId } from '@/lib/observability/logger';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isEmail(value: string) {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
}

function roleForCode(
    community: { resident_code?: string | null; concierge_code?: string | null; admin_code?: string | null },
    code: string,
): UserRole | null {
    if (community.resident_code === code) return 'resident';
    if (community.concierge_code === code) return 'concierge';
    if (community.admin_code === code) return 'admin';
    return null;
}

function isExistingUserError(error: unknown) {
    const message = error instanceof Error
        ? error.message.toLowerCase()
        : typeof error === 'object' && error && 'message' in error
            ? String(error.message).toLowerCase()
            : '';
    return message.includes('already') || message.includes('registered') || message.includes('exists');
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'auth.signup', { limit: 5, windowMs: 15 * 60_000 });
    if (limited) return limited;

    try {
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const fullName = cleanText(body.fullName, 140);
        const email = cleanText(body.email, 180).toLowerCase();
        const password = cleanText(body.password, 200);
        const accessCode = cleanText(body.accessCode, 40).toUpperCase();
        const requestedRole = cleanText(body.role, 20);
        const departmentNumber = cleanText(body.departmentNumber, 40);

        if (!fullName) return NextResponse.json({ error: 'Ingresa tu nombre.' }, { status: 400 });
        if (!isEmail(email)) return NextResponse.json({ error: 'Email inválido.' }, { status: 400 });
        if (password.length < 8) return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
        if (!/^[A-Z0-9_-]{4,40}$/.test(accessCode)) {
            return NextResponse.json({ error: 'Código de invitación inválido.' }, { status: 400 });
        }

        const admin = getSupabaseAdmin();
        const { data: communities, error: communityError } = await admin
            .from('communities')
            .select('id,name,resident_code,concierge_code,admin_code')
            .or(`resident_code.eq.${accessCode},concierge_code.eq.${accessCode},admin_code.eq.${accessCode}`)
            .limit(1);
        if (communityError) throw communityError;

        const community = communities?.[0];
        const resolvedRole = community ? roleForCode(community, accessCode) : null;
        if (!community || !resolvedRole || resolvedRole !== requestedRole) {
            return NextResponse.json({ error: 'El código no corresponde al perfil seleccionado.' }, { status: 403 });
        }
        if (resolvedRole === 'resident' && !departmentNumber) {
            return NextResponse.json({ error: 'Ingresa tu departamento o unidad.' }, { status: 400 });
        }

        const { data: created, error: createError } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                name: fullName,
                invite_code: accessCode,
                department_number: resolvedRole === 'resident' ? departmentNumber : undefined,
            },
        });
        if (createError) {
            const status = isExistingUserError(createError) ? 409 : 400;
            return NextResponse.json({
                error: status === 409 ? 'Este correo ya tiene una cuenta.' : 'No se pudo crear la cuenta.',
            }, { status });
        }

        const userId = created.user?.id;
        if (!userId) throw new Error('No se pudo crear el usuario.');

        const { error: profileError } = await admin.from('profiles').upsert({
            id: userId,
            email,
            name: fullName,
            full_name: fullName,
            role: resolvedRole,
            community_id: community.id,
            department_number: resolvedRole === 'resident' ? departmentNumber : null,
        }, { onConflict: 'id' });
        if (profileError) {
            await admin.auth.admin.deleteUser(userId);
            throw profileError;
        }

        await sendWelcomeEmail({
            to: email,
            residentName: fullName,
            unitName: departmentNumber ? `Depto ${departmentNumber}` : resolvedRole === 'admin' ? 'Administración' : 'Conserjería',
            condoName: community.name || 'Convive Connect',
        }).catch(error => logger.warn('auth.signup_welcome_email_failed', {
            requestId: resolveRequestId(req),
            error,
        }));

        return NextResponse.json({ ok: true, role: resolvedRole });
    } catch (error) {
        logApiError(req, '/api/auth/signup', error);
        return NextResponse.json({ error: 'No se pudo crear la cuenta.' }, { status: 500 });
    }
}
