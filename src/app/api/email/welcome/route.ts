import { NextRequest, NextResponse } from 'next/server';
import { sendWelcomeEmail } from '@/lib/email';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { apiErrorResponse } from '@/lib/observability/logger';

function clean(value: unknown, max = 200) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'email.welcome', { limit: 3, windowMs: 60_000 });
    if (limited) return limited;

    try {
        if (!process.env.RESEND_API_KEY) {
            return NextResponse.json({ ok: true, skipped: true, reason: 'RESEND_API_KEY missing' });
        }

        const profile = await getAuthenticatedAgentProfile();
        if (!profile?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await req.json() as Record<string, unknown>;
        const to = profile.email;
        const residentName = clean(profile.name, 120) || 'Residente';
        const unitName = clean(body.unitName, 50) || 'Unidad';
        const condoName = clean(body.condoName, 120) || 'Convive Connect';

        if (!to) {
            return NextResponse.json({ error: 'Falta email de destino (to)' }, { status: 400 });
        }

        const { error } = await sendWelcomeEmail({
            to,
            residentName,
            unitName,
            condoName,
            temporaryPassword: undefined,
        });

        if (error) {
            return apiErrorResponse(req, '/api/email/welcome', error, {
                status: 502,
                publicMessage: 'No se pudo enviar el correo de bienvenida.',
            });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        return apiErrorResponse(req, '/api/email/welcome', error, {
            publicMessage: 'No se pudo enviar el correo de bienvenida.',
        });
    }
}
