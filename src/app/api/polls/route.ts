import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';

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

async function getSupabaseUserClient() {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: () => {},
            },
        }
    );
}

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
    try {
        const supabaseUser = await getSupabaseUserClient();
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id, name, email, role, community_id')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
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

        const { data: poll, error: pollError } = await supabaseAdmin
            .from('polls')
            .insert({
                title,
                description,
                category,
                end_date: endDate,
                status: 'active',
                created_by: profile.id,
                community_id: profile.community_id,
            })
            .select('*')
            .single();

        if (pollError || !poll) {
            return NextResponse.json({ error: pollError?.message || 'No se pudo crear la votacion' }, { status: 500 });
        }

        const optionRows = options.map((text, index) => ({
            poll_id: poll.id,
            text,
            display_order: index,
            votes: 0,
        }));

        const { data: createdOptions, error: optionsError } = await supabaseAdmin
            .from('poll_options')
            .insert(optionRows)
            .select('*');

        if (optionsError) {
            await supabaseAdmin.from('polls').delete().eq('id', poll.id);
            return NextResponse.json({ error: optionsError.message }, { status: 500 });
        }

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
            const notificationRows = recipients.map(resident => ({
                user_id: resident.id,
                type: 'info',
                category: 'poll',
                title: 'Nueva votacion disponible',
                body: title,
                link: pollUrl,
                community_id: profile.community_id,
            }));

            const { error: notificationError } = await supabaseAdmin
                .from('notifications')
                .insert(notificationRows);

            if (notificationError) {
                delivery.notifications.failed = notificationRows.length;
            } else {
                delivery.notifications.sent = notificationRows.length;
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

        return NextResponse.json({
            poll,
            options: createdOptions || [],
            delivery,
        }, { status: 201 });
    } catch (error) {
        console.error('[polls] create failed:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error desconocido' },
            { status: 500 }
        );
    }
}
