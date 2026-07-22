export const PAYMENT_TEMPLATE_FRIENDLY_NAME = 'convive_recordatorio_gasto_comun';
export const PAYMENT_TEMPLATE_APPROVAL_NAME = 'convive_recordatorio_gasto_comun';

type TwilioConfig = {
    accountSid: string;
    authToken: string;
};

type TwilioContent = {
    sid?: string;
    friendly_name?: string;
};

type TwilioContentList = {
    contents?: TwilioContent[];
};

type TwilioApproval = {
    status?: string;
    rejection_reason?: string;
};

function authHeader(config: TwilioConfig) {
    return `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`;
}

async function twilioJson<T>(url: string, config: TwilioConfig, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        ...init,
        headers: {
            Authorization: authHeader(config),
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            ...(init?.headers || {}),
        },
    });
    const payload = await response.json().catch(() => ({})) as T & { message?: string };
    if (!response.ok) throw new Error(String(payload.message || `Twilio Content API HTTP ${response.status}`).slice(0, 220));
    return payload;
}

export function getTwilioContentConfig(): TwilioConfig {
    const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    const authToken = process.env.TWILIO_AUTH_TOKEN || '';
    if (!accountSid || !authToken) throw new Error('twilio_not_configured');
    return { accountSid, authToken };
}

export async function findPaymentTemplateSid(config = getTwilioContentConfig()) {
    const configuredSid = process.env.TWILIO_WHATSAPP_PAYMENT_CONTENT_SID?.trim();
    if (configuredSid) return configuredSid;

    const list = await twilioJson<TwilioContentList>('https://content.twilio.com/v1/Content?PageSize=1000', config);
    return list.contents?.find(item => item.friendly_name === PAYMENT_TEMPLATE_FRIENDLY_NAME)?.sid || '';
}

export async function ensurePaymentReminderTemplate() {
    const config = getTwilioContentConfig();
    let contentSid = await findPaymentTemplateSid(config);

    if (!contentSid) {
        const created = await twilioJson<TwilioContent>('https://content.twilio.com/v1/Content', config, {
            method: 'POST',
            body: JSON.stringify({
                friendly_name: PAYMENT_TEMPLATE_FRIENDLY_NAME,
                language: 'es',
                variables: { '1': '1204', '2': '148.600 CLP' },
                types: {
                    'twilio/text': {
                        body: 'Hola. Tienes un recordatorio de gasto común para el departamento {{1}} por {{2}}. Revisa el detalle y la fecha de vencimiento en Convive Connect.',
                    },
                },
            }),
        });
        contentSid = created.sid || '';
    }

    if (!contentSid) throw new Error('Twilio no devolvio ContentSid para la plantilla.');

    let approval: TwilioApproval;
    try {
        approval = await twilioJson<TwilioApproval>(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests/whatsapp`, config, {
            method: 'POST',
            body: JSON.stringify({ name: PAYMENT_TEMPLATE_APPROVAL_NAME, category: 'UTILITY' }),
        });
    } catch (error) {
        const existing = await twilioJson<{ whatsapp?: TwilioApproval }>(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`, config);
        if (!existing.whatsapp) throw error;
        approval = existing.whatsapp;
    }

    return {
        contentSid,
        friendlyName: PAYMENT_TEMPLATE_FRIENDLY_NAME,
        status: approval.status || 'received',
        rejectionReason: approval.rejection_reason || null,
    };
}

