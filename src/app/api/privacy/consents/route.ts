import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { PRIVACY_POLICY_VERSION } from '@/lib/privacy';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export async function GET(request: NextRequest) {
    const limited = await enforceDistributedRateLimit(request, 'privacy.consents.list', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const admin = getSupabaseAdmin();
    const [{ data: settings, error: settingsError }, { data: events, error: eventsError }] = await Promise.all([
        admin.from('profiles').select('whatsapp_enabled').eq('id', profile.id).maybeSingle(),
        admin.from('privacy_consent_events')
            .select('id, consent_type, action, policy_version, channel, created_at')
            .eq('user_id', profile.id)
            .order('created_at', { ascending: false }),
    ]);
    if (settingsError || eventsError) {
        console.error('[privacy consents] list failed', settingsError || eventsError);
        return NextResponse.json({ error: 'No se pudieron cargar tus preferencias.' }, { status: 500 });
    }

    return NextResponse.json({ whatsappEnabled: settings?.whatsapp_enabled === true, events: events || [] });
}

export async function POST(request: NextRequest) {
    const limited = await enforceDistributedRateLimit(request, 'privacy.consents.update', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;

    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.consentType !== 'whatsapp' || typeof body.granted !== 'boolean') {
        return NextResponse.json({ error: 'Preferencia inválida.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { error: updateError } = await admin
        .from('profiles')
        .update({ whatsapp_enabled: body.granted })
        .eq('id', profile.id)
        .eq('community_id', profile.community_id);
    if (updateError) {
        console.error('[privacy consents] profile update failed', updateError);
        return NextResponse.json({ error: 'No se pudo guardar la preferencia.' }, { status: 500 });
    }

    const { error: consentError } = await admin.from('privacy_consent_events').insert({
        user_id: profile.id,
        community_id: profile.community_id || null,
        consent_type: 'whatsapp',
        action: body.granted ? 'granted' : 'withdrawn',
        policy_version: PRIVACY_POLICY_VERSION,
        channel: 'privacy_center',
        subject_email: profile.email,
        evidence: { explicit_toggle: true },
    });
    if (consentError) {
        await admin.from('profiles').update({ whatsapp_enabled: !body.granted }).eq('id', profile.id);
        console.error('[privacy consents] audit insert failed', consentError);
        return NextResponse.json({ error: 'No se pudo guardar la evidencia de consentimiento.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, whatsappEnabled: body.granted });
}
