import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@/lib/privacy';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    const response = NextResponse.redirect(new URL('/resident-access?error=invalid', request.url));
    const tokenHash = request.nextUrl.searchParams.get('token_hash');
    if (!tokenHash) return response;

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll: (cookiesToSet) => {
                    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
                },
            },
        },
    );

    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
    if (error || !data.user?.email) return response;

    const { data: profile } = await getSupabaseAdmin().from('profiles')
        .select('role, unit_id, community_id, email')
        .eq('id', data.user.id)
        .maybeSingle();
    if (profile?.role !== 'resident' || !profile.unit_id || !profile.community_id
        || profile.email?.toLowerCase() !== data.user.email.toLowerCase()) {
        await supabase.auth.signOut();
        return response;
    }
    const { data: unit } = await getSupabaseAdmin().from('units')
        .select('id')
        .eq('id', profile.unit_id)
        .eq('community_id', profile.community_id)
        .maybeSingle();
    if (!unit) {
        await supabase.auth.signOut();
        return response;
    }

    const { error: consentError } = await getSupabaseAdmin().from('privacy_consent_events').insert([
        {
            user_id: data.user.id,
            community_id: profile.community_id,
            consent_type: 'terms',
            action: 'granted',
            policy_version: TERMS_VERSION,
            channel: 'signup',
            subject_email: data.user.email,
            evidence: { method: 'resident_email_access', email_link_button: 'Aceptar y entrar' },
        },
        {
            user_id: data.user.id,
            community_id: profile.community_id,
            consent_type: 'privacy_notice',
            action: 'granted',
            policy_version: PRIVACY_POLICY_VERSION,
            channel: 'signup',
            subject_email: data.user.email,
            evidence: { method: 'resident_email_access', email_link_button: 'Aceptar y entrar' },
        },
    ]);
    if (consentError) {
        await supabase.auth.signOut();
        return response;
    }

    response.headers.set('Location', new URL('/home', request.url).toString());
    return response;
}
