import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { createPollWithOptions } from '@/lib/server/data/polls';
import { insertCommunityNotifications } from '@/lib/server/data/notifications';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

type DeliveryChannels = {
    chat?: boolean;
    notifications?: boolean;
    whatsapp?: boolean;
};

type PollCreateBody = {
    title?: string;
    description?: string;
    category?: string;
    end_date?: string;
    options?: string[];
    channels?: DeliveryChannels;
};

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanOptions(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value
        .map(option => cleanText(option, 120))
        .filter(Boolean)
        .slice(0, 8);
}

function formatPhoneNumber(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('569')) return `+${digits}`;
    if (digits.startsWith('9') && digits.length === 9) return `+56${digits}`;
    if (digits.startsWith('56')) return `+${digits}`;
    return `+${digits}`;
}

async function sendWhatsApp(to: string, message: string) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        throw new Error('Twilio credentials not configured');
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const params = new URLSearchParams({
        From: TWILIO_FROM,
        To: `whatsapp:${formatPhoneNumber(to)}`,
        Body: message,
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        },
        body: params.toString(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Twilio error');
    }
}

export async function POST(request: NextRequest) {
    const limited = enforceRateLimit(request, 'polls.create', { limit: 25, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        if (profile.role !== 'admin') {
            return NextResponse.json({ error: 'Solo administracion puede crear votaciones' }, { status: 403 });
        }

        const body = await request.json() as PollCreateBody;
        const title = cleanText(body.title, 160);
        const description = cleanText(body.description, 1200);
        const category = cleanText(body.category, 40) || 'community';
        const endDate = cleanText(body.end_date, 40);
        const options = cleanOptions(body.options);
        const channels = body.channels || {};

        if (!title || !description || !endDate || options.length < 2) {
            return NextResponse.json({ error: 'Titulo, descripcion, fecha y al menos dos opciones son obligatorios' }, { status: 400 });
        }

        if (!profile.community_id) {
            return NextResponse.json({ error: 'Tu cuenta no está asociada a una comunidad.' }, { status: 400 });
        }

        const created = await createPollWithOptions(supabaseAdmin, {
            title,
            description,
            category,
            endDate,
            createdBy: profile.id,
            communityId: profile.community_id,
            options,
        });

        if (!created.ok) {
            console.error('[polls] poll insert failed', created.reason);
            return NextResponse.json(
                { error: created.reason === 'options'
                    ? 'No se pudieron crear las opciones de la votación.'
                    : 'No se pudo crear la votación.' },
                { status: 500 },
            );
        }

        const { poll, options: createdOptions } = created;

        const pollUrl = '/votaciones';
        const announcement = [
            `Nueva votacion: ${title}`,
            '',
            description,
            '',
            `Cierre: ${new Date(endDate).toLocaleDateString('es-CL')}`,
            `Vota en Convive Connect: ${pollUrl}`,
        ].join('\n');

        const delivery = {
            chat: { sent: false },
            notifications: { sent: 0, failed: 0 },
            whatsapp: { sent: 0, skipped: 0, failed: 0, configured: Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) },
        };

        if (channels.chat) {
            const { error: chatError } = await supabaseAdmin
                .from('chat_messages')
                .insert({
                    sender_id: profile.id,
                    receiver_id: null,
                    content: announcement,
                });
            delivery.chat.sent = !chatError;
        }

        const { data: residents } = await supabaseAdmin
            .from('profiles')
            .select('id, phone_number, whatsapp_enabled')
            .eq('community_id', profile.community_id)
            .eq('role', 'resident')
            .limit(500);

        const recipients = residents || [];

        if (channels.notifications && recipients.length > 0) {
            const { error: notificationError } = await insertCommunityNotifications(
                supabaseAdmin,
                recipients.map(resident => ({
                    userId: resident.id,
                    type: 'info',
                    category: 'poll',
                    title: 'Nueva votacion disponible',
                    body: title,
                    link: pollUrl,
                    communityId: profile.community_id,
                })),
            );

            if (notificationError) {
                delivery.notifications.failed = recipients.length;
            } else {
                delivery.notifications.sent = recipients.length;
            }
        }

        if (channels.whatsapp) {
            const whatsappMessage = [
                '*Convive Connect*',
                '',
                `Nueva votacion: *${title}*`,
                description,
                '',
                `Cierre: ${new Date(endDate).toLocaleDateString('es-CL')}`,
                'Ingresa a la app y vota en /votaciones.',
            ].join('\n');

            for (const resident of recipients) {
                if (!resident.whatsapp_enabled || !resident.phone_number) {
                    delivery.whatsapp.skipped++;
                    continue;
                }
                try {
                    await sendWhatsApp(resident.phone_number, whatsappMessage);
                    delivery.whatsapp.sent++;
                } catch (error) {
                    delivery.whatsapp.failed++;
                    console.warn('[polls] whatsapp failed:', error instanceof Error ? error.message : error);
                }
            }
        }

        await recordOperationEvent({
            communityId: profile.community_id,
            actorId: profile.id,
            actorRole: profile.role,
            action: 'poll.created',
            entityType: 'poll',
            entityId: poll.id,
            severity: delivery.whatsapp.failed || delivery.notifications.failed ? 'warning' : 'success',
            status: 'success',
            summary: `Votacion publicada: ${title}`,
            metadata: {
                category,
                options: options.length,
                channels,
                delivery,
                recipients: recipients.length,
            },
            requestId: getRequestId(request),
        });

        return NextResponse.json({
            poll,
            options: createdOptions,
            delivery,
        }, { status: 201 });
    } catch (error) {
        console.error('[polls] create failed:', error);
        return NextResponse.json(
            { error: 'No se pudo procesar la votación.' },
            { status: 500 }
        );
    }
}
