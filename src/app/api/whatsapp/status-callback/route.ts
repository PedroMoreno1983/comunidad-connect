import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { verifyTwilioSignature } from '@/lib/security/twilioSignature';

const CALLBACK_URL = 'https://conviveconnect.com/api/whatsapp/status-callback';
const FINAL_SUCCESS = new Set(['delivered', 'read']);
const FINAL_FAILURE = new Set(['failed', 'undelivered', 'canceled']);

export async function POST(request: NextRequest) {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
        params[key] = typeof value === 'string' ? value : '';
    }

    if (!verifyTwilioSignature(
        request.headers.get('x-twilio-signature'),
        params,
        CALLBACK_URL,
        process.env.TWILIO_AUTH_TOKEN,
    )) {
        return new NextResponse('', { status: 401 });
    }

    const messageSid = params.MessageSid || params.SmsSid || '';
    const deliveryStatus = (params.MessageStatus || params.SmsStatus || '').toLowerCase();
    if (!messageSid || !deliveryStatus) return new NextResponse('', { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: event } = await admin
        .from('operation_events')
        .select('id, summary, metadata')
        .eq('action', 'whatsapp.notification.send')
        .contains('metadata', { sid: messageSid })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!event) return new NextResponse('', { status: 204 });

    const metadata = event.metadata && typeof event.metadata === 'object'
        ? event.metadata as Record<string, unknown>
        : {};
    const failed = FINAL_FAILURE.has(deliveryStatus);
    const delivered = FINAL_SUCCESS.has(deliveryStatus);
    const title = typeof metadata.title === 'string' ? metadata.title : 'notificacion';

    await admin
        .from('operation_events')
        .update({
            status: failed ? 'error' : delivered ? 'success' : 'pending',
            severity: failed ? 'error' : delivered ? 'success' : 'info',
            summary: failed
                ? `WhatsApp no entregado: ${title}`
                : delivered
                    ? `WhatsApp ${deliveryStatus}: ${title}`
                    : `WhatsApp ${deliveryStatus}: ${title}`,
            metadata: {
                ...metadata,
                result: deliveryStatus,
                deliveryStatus,
                errorCode: params.ErrorCode || null,
                errorMessage: params.ErrorMessage || null,
                statusUpdatedAt: new Date().toISOString(),
            },
        })
        .eq('id', event.id);

    return new NextResponse('', { status: 204 });
}

