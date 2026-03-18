import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886"; // Twilio sandbox

// Format Chilean numbers: +569XXXXXXXX
function formatPhoneNumber(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (digits.startsWith("569")) return `+${digits}`;
    if (digits.startsWith("9") && digits.length === 9) return `+56${digits}`;
    if (digits.startsWith("56")) return `+${digits}`;
    return `+${digits}`;
}

async function sendWhatsApp(to: string, message: string) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        throw new Error("Twilio credentials not configured");
    }

    const formattedTo = `whatsapp:${formatPhoneNumber(to)}`;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

    const params = new URLSearchParams({
        From: TWILIO_FROM,
        To: formattedTo,
        Body: message,
    });

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        },
        body: params.toString(),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Twilio error");
    }
    return res.json();
}

// POST /api/whatsapp-notify
// Called by Supabase Webhook OR directly from the app
// Body: { user_id, title, body, type }
export async function POST(req: NextRequest) {
    try {
        const { user_id, title, body: notifBody, type } = await req.json();

        if (!user_id || !title) {
            return NextResponse.json({ error: "Missing user_id or title" }, { status: 400 });
        }

        // Get user's phone number and WhatsApp opt-in status
        const { data: profile, error } = await supabaseAdmin
            .from("profiles")
            .select("phone_number, whatsapp_enabled, name")
            .eq("id", user_id)
            .single();

        if (error || !profile) {
            return NextResponse.json({ error: "Profile not found" }, { status: 404 });
        }

        if (!profile.whatsapp_enabled || !profile.phone_number) {
            return NextResponse.json({ skipped: true, reason: "WhatsApp not enabled or no phone number" });
        }

        // Build message
        const emoji = type === "alert" ? "🚨" : type === "success" ? "✅" : type === "warning" ? "⚠️" : "📢";
        const message = [
            `${emoji} *ComunidadConnect*`,
            ``,
            `*${title}*`,
            notifBody || "",
            ``,
            `👉 Revisa tu cuenta en la plataforma.`,
        ].join("\n");

        await sendWhatsApp(profile.phone_number, message);

        return NextResponse.json({ success: true, sentTo: profile.phone_number });
    } catch (err: any) {
        console.error("WhatsApp notify error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
