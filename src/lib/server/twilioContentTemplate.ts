/**
 * Plantillas de contenido de WhatsApp (Twilio Content API).
 *
 * WhatsApp exige plantilla aprobada por Meta para todo mensaje que inicia el
 * negocio fuera de la ventana de 24 horas. Meta rechaza las plantillas
 * demasiado genéricas —un cuerpo que es puro {{1}} {{2}} no se aprueba—, así
 * que cada plantilla dice explícitamente de qué se trata y deja en variables
 * solo el dato que cambia. El detalle completo vive en la plataforma.
 */

export type WhatsAppTemplateKey = 'payment_reminder' | 'community_notice';

type TemplateDefinition = {
    friendlyName: string;
    /** Categoría de Meta. UTILITY = transaccional; MARKETING se aprueba distinto. */
    category: 'UTILITY' | 'MARKETING';
    body: string;
    /** Valores de muestra que Meta usa para revisar la plantilla. */
    sampleVariables: Record<string, string>;
    /** Variable de entorno que permite fijar un ContentSid ya aprobado a mano. */
    envSidKey: string;
};

export const WHATSAPP_TEMPLATES: Record<WhatsAppTemplateKey, TemplateDefinition> = {
    payment_reminder: {
        friendlyName: 'convive_recordatorio_gasto_comun',
        category: 'UTILITY',
        body: 'Hola. Tienes un recordatorio de gasto común para el departamento {{1}} por {{2}}. Revisa el detalle y la fecha de vencimiento en Convive Connect.',
        sampleVariables: { '1': '1204', '2': '148.600 CLP' },
        envSidKey: 'TWILIO_WHATSAPP_PAYMENT_CONTENT_SID',
    },
    community_notice: {
        friendlyName: 'convive_aviso_comunidad',
        category: 'UTILITY',
        // Una sola variable, con el asunto del aviso. El cuerpo largo no viaja en
        // la plantilla: iría a parar a una variable libre y eso es justo lo que
        // Meta rechaza.
        body: 'Hola. Tu administración publicó un aviso en Convive Connect: {{1}}. Ingresa a la plataforma para leer el detalle completo.',
        sampleVariables: { '1': 'Corte de agua programado para el martes' },
        envSidKey: 'TWILIO_WHATSAPP_NOTICE_CONTENT_SID',
    },
};

/** Compatibilidad con el código que ya importaba estos nombres. */
export const PAYMENT_TEMPLATE_FRIENDLY_NAME = WHATSAPP_TEMPLATES.payment_reminder.friendlyName;
export const PAYMENT_TEMPLATE_APPROVAL_NAME = WHATSAPP_TEMPLATES.payment_reminder.friendlyName;

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

export async function findTemplateSid(key: WhatsAppTemplateKey, config = getTwilioContentConfig()) {
    const template = WHATSAPP_TEMPLATES[key];
    const configuredSid = process.env[template.envSidKey]?.trim();
    if (configuredSid) return configuredSid;

    const list = await twilioJson<TwilioContentList>('https://content.twilio.com/v1/Content?PageSize=1000', config);
    return list.contents?.find(item => item.friendly_name === template.friendlyName)?.sid || '';
}

export async function findPaymentTemplateSid(config = getTwilioContentConfig()) {
    return findTemplateSid('payment_reminder', config);
}

/**
 * Crea la plantilla si no existe y pide su aprobación a Meta. Es idempotente:
 * si ya está creada devuelve el estado actual de la revisión.
 */
export async function ensureTemplate(key: WhatsAppTemplateKey) {
    const template = WHATSAPP_TEMPLATES[key];
    const config = getTwilioContentConfig();
    let contentSid = await findTemplateSid(key, config);

    if (!contentSid) {
        const created = await twilioJson<TwilioContent>('https://content.twilio.com/v1/Content', config, {
            method: 'POST',
            body: JSON.stringify({
                friendly_name: template.friendlyName,
                language: 'es',
                variables: template.sampleVariables,
                types: { 'twilio/text': { body: template.body } },
            }),
        });
        contentSid = created.sid || '';
    }

    if (!contentSid) throw new Error('Twilio no devolvio ContentSid para la plantilla.');

    let approval: TwilioApproval;
    try {
        approval = await twilioJson<TwilioApproval>(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests/whatsapp`, config, {
            method: 'POST',
            body: JSON.stringify({ name: template.friendlyName, category: template.category }),
        });
    } catch (error) {
        // Ya estaba enviada a revisión: se devuelve el estado en curso.
        const existing = await twilioJson<{ whatsapp?: TwilioApproval }>(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`, config);
        if (!existing.whatsapp) throw error;
        approval = existing.whatsapp;
    }

    return {
        key,
        contentSid,
        friendlyName: template.friendlyName,
        status: approval.status || 'received',
        rejectionReason: approval.rejection_reason || null,
    };
}

export async function ensurePaymentReminderTemplate() {
    return ensureTemplate('payment_reminder');
}

/** Registra en Twilio todas las plantillas que el módulo necesita. */
export async function ensureAllTemplates() {
    const results = [];
    for (const key of Object.keys(WHATSAPP_TEMPLATES) as WhatsAppTemplateKey[]) {
        try {
            results.push(await ensureTemplate(key));
        } catch (error) {
            results.push({
                key,
                contentSid: '',
                friendlyName: WHATSAPP_TEMPLATES[key].friendlyName,
                status: 'error',
                rejectionReason: error instanceof Error ? error.message : 'Error desconocido',
            });
        }
    }
    return results;
}
