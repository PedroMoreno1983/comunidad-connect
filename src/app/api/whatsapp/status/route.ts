import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppConfigStatus } from "@/lib/whatsapp";
import { getAuthenticatedAgentProfile } from "@/lib/server/agentIdentity";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { isPlatformCreatorEmail } from "@/lib/platformAccess";

export async function GET(request: NextRequest) {
    const limited = enforceRateLimit(request, "whatsapp.status", { limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (profile.role !== "admin" || !isPlatformCreatorEmail(profile.email)) {
        return NextResponse.json({ error: "Esta configuracion es solo para el equipo de la plataforma." }, { status: 403 });
    }

    return NextResponse.json({
        ...getWhatsAppConfigStatus(),
        setup: {
            provider: "Twilio WhatsApp",
            inboundMethod: "POST",
            inboundContentType: "application/x-www-form-urlencoded",
            inboundPath: "/api/coco/whatsapp",
            outboundPath: "/api/whatsapp-notify",
        },
    });
}
