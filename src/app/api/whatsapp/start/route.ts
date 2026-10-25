import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { WhatsAppStartStatus } from '@/lib/types';

export async function GET() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data: settings, error } = await getSupabaseAdmin()
        .from('profiles')
        .select('phone_number, whatsapp_enabled')
        .eq('id', profile.id)
        .maybeSingle();
    if (error || !settings) {
        return NextResponse.json({ error: 'No se pudo consultar tu configuración de WhatsApp.' }, { status: 500 });
    }

    const sharedFrom = process.env.COCO_WHATSAPP_FROM?.trim() || '';
    const from = sharedFrom || process.env.TWILIO_WHATSAPP_FROM?.trim() || '';
    const number = /^whatsapp:\+([1-9]\d{6,14})$/.exec(from)?.[1];
    const configured = sharedFrom
        ? Boolean(process.env.COCO_TWILIO_AUTH_TOKEN && number)
        : Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && number);
    const phone = String(settings.phone_number || '').replace(/\D/g, '');
    const validPhone = /^569\d{8}$/.test(phone) || /^9\d{8}$/.test(phone);

    const status: WhatsAppStartStatus = !configured
        ? { available: false, reason: 'unconfigured' }
        : !settings.whatsapp_enabled
            ? { available: false, reason: 'consent' }
            : !validPhone
                ? { available: false, reason: 'phone' }
                : { available: true, url: `https://wa.me/${number}?text=${encodeURIComponent('Hola CoCo')}` };

    return NextResponse.json(status, { headers: { 'Cache-Control': 'private, no-store' } });
}
