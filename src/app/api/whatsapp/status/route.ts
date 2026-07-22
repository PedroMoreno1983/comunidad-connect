import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppConfigStatus } from "@/lib/whatsapp";
import { getAuthenticatedAgentProfile } from "@/lib/server/agentIdentity";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { isPlatformCreatorEmail } from "@/lib/platformAccess";
import { ensurePaymentReminderTemplate } from "@/lib/server/twilioContentTemplate";

async function requirePlatformCreator(request: NextRequest, rateLimitKey: string) {
    const limited = enforceRateLimit(request, rateLimitKey, { limit: 10, windowMs: 60_000 });
    if (limited) return { response: limited, profile: null };

    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return { response: NextResponse.json({ error: "No autorizado" }, { status: 401 }), profile: null };
    if (profile.role !== "admin" || !isPlatformCreatorEmail(profile.email)) {
        return { response: NextResponse.json({ error: "Esta configuracion es solo para el equipo de la plataforma." }, { status: 403 }), profile: null };
    }
    return { response: null, profile };
}

export async function GET(request: NextRequest) {
    const auth = await requirePlatformCreator(request, "whatsapp.status");
    if (auth.response) return auth.response;

    return NextResponse.json({
        ...getWhatsAppConfigStatus(),
        setup: {
            provider: "Twilio WhatsApp",
            inboundMethod: "POST",
            inboundContentType: "application/x-www-form-urlencoded",
            inboundPath: "/api/coco/whatsapp",
            outboundPath: "/api/whatsapp-notify",
            paymentTemplateSetupPath: "/api/whatsapp/status",
        },
    });
}

export async function POST(request: NextRequest) {
    const auth = await requirePlatformCreator(request, "whatsapp.template.setup");
    if (auth.response) return auth.response;

    try {
        const template = await ensurePaymentReminderTemplate();
        return NextResponse.json({ ok: true, template });
    } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo configurar la plantilla.";
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
