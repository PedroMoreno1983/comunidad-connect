import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { FROM_EMAIL, SUPERADMIN_EMAIL, emailWrapper, resend } from '@/lib/email';
import { getPublicUrl } from '@/lib/config';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { CommercialLeadSource, EmailDeliveryResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

const LEAD_SOURCES = new Set<CommercialLeadSource>([
    'landing_contact',
    'commercial_tour',
    'onboarding_preactivation',
]);

function asText(value: unknown, maxLength = 400): string {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function asSource(value: unknown): CommercialLeadSource {
    const source = asText(value, 60) as CommercialLeadSource;
    return LEAD_SOURCES.has(source) ? source : 'landing_contact';
}

async function deliverEmail(to: string, subject: string, html: string): Promise<EmailDeliveryResult> {
    try {
        const { data, error } = await resend.emails.send({ from: FROM_EMAIL, to: [to], subject, html });
        if (error) return { sent: false, error: error.message };
        return { sent: true, id: data?.id };
    } catch (error) {
        return {
            sent: false,
            error: error instanceof Error ? error.message : 'No se pudo entregar el correo.',
        };
    }
}

export async function POST(request: Request) {
    const limited = await enforceDistributedRateLimit(request, 'commercial.outreach', { limit: 6, windowMs: 10 * 60_000 });
    if (limited) return limited;

    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const adminName = asText(body.adminName, 120);
        const adminEmail = asText(body.adminEmail, 180).toLowerCase();
        const condoName = asText(body.condoName, 160);
        const message = asText(body.message, 1200);
        const source = asSource(body.source);
        const website = asText(body.website, 200);

        if (website) {
            return NextResponse.json({
                ok: true,
                emailSent: true,
                teamNotified: true,
                status: 'notified',
                message: 'Solicitud recibida',
            });
        }

        if (!adminName || !adminEmail || !condoName) {
            return NextResponse.json({ error: 'Completa nombre, email y comunidad.' }, { status: 400 });
        }

        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(adminEmail)) {
            return NextResponse.json({ error: 'Email invalido.' }, { status: 400 });
        }

        const requestId = randomUUID();
        const admin = getSupabaseAdmin();
        const { data: lead, error: insertError } = await admin
            .from('commercial_leads')
            .insert({
                request_id: requestId,
                admin_name: adminName,
                admin_email: adminEmail,
                condo_name: condoName,
                message: message || null,
                source,
                status: 'received',
                user_agent: asText(request.headers.get('user-agent'), 500) || null,
            })
            .select('id')
            .single();

        if (insertError || !lead?.id) {
            console.error('[email/outreach] Could not persist lead:', insertError?.message || 'Missing lead id');
            return NextResponse.json({ error: 'No se pudo guardar la solicitud. Intenta nuevamente.' }, { status: 503 });
        }

        const safeAdminName = escapeHtml(adminName);
        const safeCondoName = escapeHtml(condoName);
        const safeAdminEmail = escapeHtml(adminEmail);
        const safeMessage = escapeHtml(message || 'Sin detalle adicional.');
        const confirmationSubject = `Solicitud recibida - ${condoName}`;
        const confirmationHtml = emailWrapper(`
            <h1 style="color:#1a1a1a;">Hola ${safeAdminName},</h1>
            <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.6;">
                Registramos la solicitud comercial para <strong>${safeCondoName}</strong>.
            </p>
            <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
                El equipo de Convive Connect ya recibio el aviso. Puedes comenzar de inmediato la creacion de la comunidad y dejar preparada la carga asistida por CoCo.
            </p>
            <div style="background:#fff7ed;border-radius:12px;padding:18px;margin-bottom:24px;border:1px solid #fed7aa;">
                <p style="margin:0 0 8px;font-weight:700;color:#974C3C;">Detalle recibido</p>
                <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">${safeMessage}</p>
            </div>
            <div style="margin:28px 0;">
                <a href="${getPublicUrl('/admin-onboarding')}" style="display:inline-block;padding:12px 24px;background-color:#5F7A46;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">
                    Crear comunidad
                </a>
            </div>
            <p style="margin-top:30px;border-top:1px solid #eee;padding-top:20px;color:#666;">
                Atentamente,<br><strong>Equipo Convive Connect</strong>
            </p>
        `, 'Solicitud comercial Convive Connect');

        const teamSubject = `Nueva solicitud comercial: ${condoName}`;
        const teamHtml = emailWrapper(`
            <h1 style="color:#1a1a1a;">Nueva solicitud comercial</h1>
            <p><strong>Administrador:</strong> ${safeAdminName}</p>
            <p><strong>Correo:</strong> ${safeAdminEmail}</p>
            <p><strong>Comunidad:</strong> ${safeCondoName}</p>
            <p><strong>Origen:</strong> ${escapeHtml(source)}</p>
            <p><strong>Detalle:</strong> ${safeMessage}</p>
            <p><strong>Lead:</strong> ${escapeHtml(String(lead.id))}</p>
        `, 'Nueva solicitud comercial');

        const customerDelivery = await deliverEmail(adminEmail, confirmationSubject, confirmationHtml);
        const teamDelivery = adminEmail === SUPERADMIN_EMAIL.toLowerCase()
            ? customerDelivery
            : await deliverEmail(SUPERADMIN_EMAIL, teamSubject, teamHtml);
        const delivered = customerDelivery.sent && teamDelivery.sent;
        const deliveryErrors = [customerDelivery.error, teamDelivery.error].filter(Boolean).join(' | ');
        const status = delivered ? 'notified' : 'delivery_pending';

        const { error: updateError } = await admin
            .from('commercial_leads')
            .update({
                status,
                customer_email_sent_at: customerDelivery.sent ? new Date().toISOString() : null,
                team_email_sent_at: teamDelivery.sent ? new Date().toISOString() : null,
                customer_email_id: customerDelivery.id || null,
                team_email_id: teamDelivery.id || null,
                delivery_error: deliveryErrors || null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', lead.id);

        if (updateError) {
            console.error('[email/outreach] Lead delivery state could not be updated:', updateError.message);
        }

        return NextResponse.json({
            ok: true,
            leadId: lead.id,
            emailSent: customerDelivery.sent,
            teamNotified: teamDelivery.sent,
            status,
            message: delivered
                ? 'Solicitud registrada y correos entregados.'
                : 'Solicitud registrada. Hay una entrega de correo pendiente.',
        }, { status: delivered ? 200 : 202 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        console.error('[email/outreach] Unexpected error:', message);
        return NextResponse.json({ error: 'No se pudo procesar la solicitud.' }, { status: 500 });
    }
}
