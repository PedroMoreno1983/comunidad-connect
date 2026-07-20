import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { bindIotPayloadToCommunity, requireCommunityIotSecret } from '@/lib/iot/security';

// Server-side proxy so the IoT webhook secret never touches the browser.
// Only authenticated admins can call this endpoint.
export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, community_id')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: community, error: communityError } = await getSupabaseAdmin()
        .from('communities')
        .select('iot_webhook_secret, iot_autonomous_actions_enabled')
        .eq('id', profile.community_id)
        .maybeSingle();

    if (communityError) {
        console.error('[IoT test trigger] Failed to load community secret', communityError);
        return NextResponse.json({ error: 'No se pudo validar la configuración IoT' }, { status: 500 });
    }
    let secret: string;
    try {
        secret = requireCommunityIotSecret(community?.iot_webhook_secret);
    } catch {
        return NextResponse.json({ error: 'IoT no está configurado para esta comunidad' }, { status: 503 });
    }
    if (community?.iot_autonomous_actions_enabled !== true) {
        return NextResponse.json({ error: 'La automatización IoT no está habilitada para esta comunidad' }, { status: 409 });
    }

    let payload: Record<string, unknown>;
    try {
        payload = bindIotPayloadToCommunity(await req.json(), profile.community_id);
    } catch {
        return NextResponse.json({ error: 'Evento IoT inválido' }, { status: 400 });
    }
    const origin = req.nextUrl.origin;

    const iotRes = await fetch(`${origin}/api/webhooks/iot`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${secret}`,
        },
        body: JSON.stringify(payload),
    });

    const data = await iotRes.json();
    return NextResponse.json(data, { status: iotRes.status });
}
