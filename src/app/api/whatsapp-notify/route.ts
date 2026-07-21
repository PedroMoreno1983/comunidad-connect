import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { sendWhatsAppNotificationForUser } from "@/lib/server/whatsappNotify";

const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET;

// POST /api/whatsapp-notify
// Requires in production: Authorization: Bearer <WHATSAPP_WEBHOOK_SECRET>
// Body: { user_id, title, body, type }
export async function POST(req: NextRequest) {
    const limited = enforceRateLimit(req, 'whatsapp.notify', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    try {
        if (WEBHOOK_SECRET) {
            const token = req.headers.get('authorization')?.replace('Bearer ', '');
            if (token !== WEBHOOK_SECRET) {
                return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
            }
        } else if (process.env.NODE_ENV === 'production') {
            return NextResponse.json({ error: 'WHATSAPP_WEBHOOK_SECRET no configurado' }, { status: 500 });
        }

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
        return NextResponse.json({ success: result.status === 'sent', ...result });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        console.error('WhatsApp notify error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
