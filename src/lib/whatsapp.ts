import { CANONICAL_SITE_URL, WHATSAPP_WEBHOOK_PATH } from "@/lib/config";

export function formatWhatsAppPhone(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (digits.startsWith("569")) return `+${digits}`;
    if (digits.startsWith("9") && digits.length === 9) return `+56${digits}`;
    if (digits.startsWith("56")) return `+${digits}`;
    return `+${digits}`;
}

export function maskSecret(value?: string | null): string {
    if (!value) return "";
    if (value.length <= 8) return "********";
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function getWhatsAppWebhookUrl() {
    return `${CANONICAL_SITE_URL}${WHATSAPP_WEBHOOK_PATH}`;
}

export function getWhatsAppConfigStatus() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
    const authToken = process.env.TWILIO_AUTH_TOKEN || "";
    const sharedFrom = process.env.COCO_WHATSAPP_FROM || "";
    const from = sharedFrom || process.env.TWILIO_WHATSAPP_FROM || "";
    const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET || "";
    const sharedRelayReady = Boolean(sharedFrom && process.env.COCO_TWILIO_AUTH_TOKEN);

    return {
        configured: sharedFrom ? sharedRelayReady : Boolean(accountSid && authToken && from),
        webhookConfigured: Boolean(webhookSecret),
        accountSidMasked: maskSecret(accountSid),
        fromMasked: from ? from.replace(/(\+\d{3})\d+(\d{3})/, "$1****$2") : "",
        webhookUrl: getWhatsAppWebhookUrl(),
        requiredEnv: {
            TWILIO_ACCOUNT_SID: Boolean(accountSid),
            TWILIO_AUTH_TOKEN: Boolean(authToken),
            TWILIO_WHATSAPP_FROM: Boolean(process.env.TWILIO_WHATSAPP_FROM),
            WHATSAPP_WEBHOOK_SECRET: Boolean(webhookSecret),
            COCO_WHATSAPP_FROM: Boolean(sharedFrom),
            COCO_TWILIO_AUTH_TOKEN: Boolean(process.env.COCO_TWILIO_AUTH_TOKEN),
        },
    };
}
