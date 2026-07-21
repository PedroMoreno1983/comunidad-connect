import { formatWhatsAppPhone } from '@/lib/whatsapp';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

type WhatsAppNotificationType = 'info' | 'alert' | 'success' | 'warning';

export type WhatsAppNotificationResult = {
    status: 'sent' | 'skipped' | 'failed';
    reason?: string;
    sid?: string;
};

type TwilioMessageResponse = {
    sid?: string;
    status?: string;
    error_message?: string | null;
};

type WhatsAppNotificationInput = {
    userId: string;
    title: string;
    body?: string;
    type?: WhatsAppNotificationType;
    communityId?: string | null;
    actorId?: string | null;
    metadata?: Record<string, unknown>;
};

function clean(value: unknown, max = 500) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function getTwilioConfig() {
    return {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        from: process.env.TWILIO_WHATSAPP_FROM || '',
    };
}

function buildMessage(input: WhatsAppNotificationInput) {
    return [
        '*Convive Connect*',
        '',
        `*${clean(input.title, 140)}*`,
        clean(input.body, 1200),
        '',
        'Revisa tu cuenta en la plataforma.',
    ].filter((part, index) => index !== 3 || Boolean(part)).join('\n');
}

async function auditWhatsApp(input: WhatsAppNotificationInput, result: WhatsAppNotificationResult, resolvedCommunityId?: string | null) {
    const communityId = resolvedCommunityId || input.communityId;
    if (!communityId) return;
    const status = result.status === 'sent' ? 'success' : result.status === 'failed' ? 'error' : 'blocked';
    const severity = result.status === 'sent' ? 'success' : result.status === 'failed' ? 'error' : 'warning';
    try {
        await getSupabaseAdmin().from('operation_events').insert({
            community_id: communityId,
            actor_id: input.actorId || null,
            actor_role: input.actorId ? 'admin' : null,
            action: 'whatsapp.notification.send',
            entity_type: 'profile',
            entity_id: input.userId,
            severity,
            status,
            summary: result.status === 'sent'
                ? `WhatsApp enviado: ${clean(input.title, 120)}`
                : `WhatsApp no enviado: ${result.reason || 'sin detalle'}`,
            metadata: {
                title: clean(input.title, 140),
                type: input.type || 'info',
                result: result.status,
                reason: result.reason || null,
                sid: result.sid || null,
                ...(input.metadata || {}),
            },
        });
    } catch (error) {
        console.error('[whatsapp] Failed to audit notification result', error);
    }
}

async function sendWhatsApp(toPhoneNumber: string, message: string): Promise<TwilioMessageResponse> {
    const { accountSid, authToken, from } = getTwilioConfig();
    if (!accountSid || !authToken || !from) {
        throw new Error('twilio_not_configured');
    }

    const formattedTo = `whatsapp:${formatWhatsAppPhone(toPhoneNumber)}`;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams({ From: from, To: formattedTo, Body: message });

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        body: params.toString(),
    });

    const payload = await response.json().catch(() => ({})) as TwilioMessageResponse & { message?: string };
    if (!response.ok) {
        throw new Error(clean(payload.message || payload.error_message || 'twilio_error', 180));
    }
    return payload;
}

export async function sendWhatsAppNotificationForUser(input: WhatsAppNotificationInput): Promise<WhatsAppNotificationResult> {
    const userId = clean(input.userId, 80);
    const title = clean(input.title, 140);
    if (!userId || !title) {
        return { status: 'skipped', reason: 'missing_user_or_title' };
    }

    const admin = getSupabaseAdmin();
    const { data: profile, error } = await admin
        .from('profiles')
        .select('id, phone_number, whatsapp_enabled, community_id')
        .eq('id', userId)
        .maybeSingle();

    if (error || !profile) {
        const result: WhatsAppNotificationResult = { status: 'skipped', reason: 'profile_not_found' };
        await auditWhatsApp(input, result, input.communityId);
        return result;
    }

    const communityId = typeof profile.community_id === 'string' ? profile.community_id : input.communityId;
    if (!profile.whatsapp_enabled) {
        const result: WhatsAppNotificationResult = { status: 'skipped', reason: 'resident_without_whatsapp_opt_in' };
        await auditWhatsApp(input, result, communityId);
        return result;
    }
    if (typeof profile.phone_number !== 'string' || !profile.phone_number.trim()) {
        const result: WhatsAppNotificationResult = { status: 'skipped', reason: 'resident_without_phone_number' };
        await auditWhatsApp(input, result, communityId);
        return result;
    }

    try {
        const twilio = await sendWhatsApp(profile.phone_number, buildMessage(input));
        const result: WhatsAppNotificationResult = { status: 'sent', sid: twilio.sid };
        await auditWhatsApp(input, result, communityId);
        return result;
    } catch (error) {
        const reason = error instanceof Error ? clean(error.message, 180) : 'twilio_error';
        const result: WhatsAppNotificationResult = {
            status: reason === 'twilio_not_configured' ? 'skipped' : 'failed',
            reason,
        };
        await auditWhatsApp(input, result, communityId);
        return result;
    }
}
