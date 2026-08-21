import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { denyUnlessSharedSecret } from "@/lib/security/sharedSecret";
import { sendWhatsAppNotificationForUser } from "@/lib/server/whatsappNotify";

// POST /api/whatsapp-notify
// Requires: Authorization: Bearer <WHATSAPP_WEBHOOK_SECRET>
// Body: { user_id, title, body, type }
export async function POST(req: NextRequest) {
    const limited = enforceRateLimit(req, 'whatsapp.notify', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const denied = denyUnlessSharedSecret(req, process.env.WHATSAPP_WEBHOOK_SECRET, {
        notConfiguredMessage: 'WHATSAPP_WEBHOOK_SECRET no configurado.',
    });
    if (denied) return denied;

    try {
        const { user_id, title, body: notifBody, type } = await req.json();
        if (!user_id || !title) {
            return NextResponse.json({ error: 'Missing user_id or title' }, { status: 400 });
        }

        const result = await sendWhatsAppNotificationForUser({
            userId: String(user_id),
            title: String(title),
            body: typeof notifBody === 'string' ? notifBody : '',
            type: type === 'alert' || type === 'success' || type === 'warning' || type === 'info' ? type : 'info',
            metadata: { source: 'api.whatsapp-notify' },
        });

        if (result.status === 'failed') {
            return NextResponse.json({ success: false, ...result }, { status: 502 });
        }
        return NextResponse.json({ success: result.status === 'sent' || result.status === 'queued', ...result });
    } catch (err: unknown) {
        console.error('WhatsApp notify error:', err);
        return NextResponse.json({ error: 'No se pudo enviar la notificación.' }, { status: 500 });
    }
}
