/**
 * Cómo sale un mensaje que CoCo inicia por WhatsApp.
 * Dentro de las 24 h puede ir texto libre (y un archivo). Fuera, solo una
 * plantilla aprobada. Sin opt-in no se envía: eso lo decide el llamador.
 */

export type CoCoWhatsAppPurpose = 'community_notice' | 'payment_reminder' | 'legal_draft';

export type CoCoWhatsAppDelivery =
    | { mode: 'free'; body: string; mediaUrl?: string }
    | { mode: 'template'; templateKey: 'community_notice' | 'payment_reminder'; variables: Record<string, string> }
    | { mode: 'skip'; reason: 'missing_payment_facts' };

export function planCoCoWhatsAppDelivery(input: {
    purpose: CoCoWhatsAppPurpose;
    windowOpen: boolean;
    title: string;
    body?: string;
    mediaUrl?: string;
    unitLabel?: string;
    amountLabel?: string;
}): CoCoWhatsAppDelivery {
    const title = input.title.trim().slice(0, 140) || 'Aviso de tu comunidad';
    if (input.purpose === 'payment_reminder') {
        const unit = (input.unitLabel || '').trim();
        const amount = (input.amountLabel || '').trim();
        if (!unit || !amount) return { mode: 'skip', reason: 'missing_payment_facts' };
        if (input.windowOpen) {
            return { mode: 'free', body: `Recordatorio de gasto común del departamento ${unit} por ${amount}. El detalle está en Convive Connect.` };
        }
        return { mode: 'template', templateKey: 'payment_reminder', variables: { '1': unit.slice(0, 40), '2': amount.slice(0, 40) } };
    }
    if (input.windowOpen) {
        const body = (input.body || title).trim();
        return { mode: 'free', body, ...(input.mediaUrl ? { mediaUrl: input.mediaUrl } : {}) };
    }
    const variable = input.mediaUrl && input.mediaUrl.length <= 180
        ? `${title}. ${input.mediaUrl}`.slice(0, 200)
        : title;
    return { mode: 'template', templateKey: 'community_notice', variables: { '1': variable } };
}
