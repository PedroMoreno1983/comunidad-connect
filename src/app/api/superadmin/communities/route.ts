import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { hasSuperAdminConfig, isSuperAdminEmail } from '@/lib/security/superadmin';

async function getSuperAdminUser() {
    if (!hasSuperAdminConfig()) {
        return { error: NextResponse.json({ error: 'Superadmin no configurado' }, { status: 503 }) };
    }

    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email || !isSuperAdminEmail(user.email)) {
        return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
    }

    return { user };
}

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function GET(request: NextRequest) {
    const limited = enforceRateLimit(request, 'superadmin.communities.read', { limit: 80, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getSuperAdminUser();
    if (auth.error) return auth.error;

    const supabaseAdmin = getSupabaseAdmin();
    const [communitiesRes, tiersRes] = await Promise.all([
        supabaseAdmin.from('communities').select('*').order('created_at', { ascending: false }),
        supabaseAdmin.from('pricing_tiers').select('*').order('price_per_unit', { ascending: true }),
    ]);

    if (communitiesRes.error) {
        return NextResponse.json({ error: communitiesRes.error.message }, { status: 500 });
    }
    if (tiersRes.error) {
        return NextResponse.json({ error: tiersRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
        communities: communitiesRes.data || [],
        tiers: tiersRes.data || [],
    });
}

export async function PATCH(request: NextRequest) {
    const limited = enforceRateLimit(request, 'superadmin.communities.write', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getSuperAdminUser();
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({}));
    const communityId = cleanText(body.communityId, 80);
    const tierId = cleanText(body.tierId, 80);

    if (!communityId || !tierId) {
        return NextResponse.json({ error: 'communityId y tierId son obligatorios' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: community, error: updateError } = await supabaseAdmin
        .from('communities')
        .update({ tier_id: tierId })
        .eq('id', communityId)
        .select('id, name, tier_id')
        .single();

    if (updateError || !community) {
        return NextResponse.json({ error: updateError?.message || 'No se pudo actualizar el plan' }, { status: 500 });
    }

    const { data: actorProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', auth.user.id)
        .maybeSingle();

    await recordOperationEvent({
        communityId,
        actorId: actorProfile?.id || auth.user.id,
        actorRole: actorProfile?.role || 'superadmin',
        action: 'superadmin.community_tier_changed',
        entityType: 'community',
        entityId: communityId,
        severity: 'success',
        status: 'success',
        summary: `Plan actualizado para ${community.name}`,
        metadata: { tierId, actorEmail: auth.user.email },
        requestId: getRequestId(request),
    });

    return NextResponse.json({ community });
}
