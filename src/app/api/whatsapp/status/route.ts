import { NextResponse } from "next/server";
import { getWhatsAppConfigStatus } from "@/lib/whatsapp";

export async function GET() {
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
