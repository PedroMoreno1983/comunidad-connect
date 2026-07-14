import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { hasSuperAdminConfig, isSuperAdminEmail } from '@/lib/security/superadmin';
import type { CommercialLeadStatus, CommunitySubscriptionStatus, SuperAdminCommunity } from '@/lib/types';

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
    const [communitiesRes, tiersRes, leadsRes] = await Promise.all([
        supabaseAdmin.from('communities').select('*').order('created_at', { ascending: false }),
        supabaseAdmin.from('pricing_tiers').select('*').order('price_per_unit', { ascending: true }),
        supabaseAdmin
            .from('commercial_leads')
            .select('id,admin_name,admin_email,condo_name,message,source,status,delivery_error,created_at,updated_at')
            .order('created_at', { ascending: false })
            .limit(100),
    ]);

    if (communitiesRes.error) {
        return NextResponse.json({ error: communitiesRes.error.message }, { status: 500 });
    }
    if (tiersRes.error) {
        return NextResponse.json({ error: tiersRes.error.message }, { status: 500 });
    }
    if (leadsRes.error) {
        return NextResponse.json({ error: leadsRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
        communities: communitiesRes.data || [],
        tiers: tiersRes.data || [],
        leads: leadsRes.data || [],
    });
}

export async function PATCH(request: NextRequest) {
    const limited = enforceRateLimit(request, 'superadmin.communities.write', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getSuperAdminUser();
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const communityId = cleanText(body.communityId, 80);
    const tierId = cleanText(body.tierId, 80);
    const subscriptionStatus = cleanText(body.subscriptionStatus, 30) as CommunitySubscriptionStatus;
    const leadId = cleanText(body.leadId, 80);
    const leadStatus = cleanText(body.leadStatus, 30) as CommercialLeadStatus;

    const supabaseAdmin = getSupabaseAdmin();

    if (leadId) {
        const allowedLeadStatuses: CommercialLeadStatus[] = ['received', 'notified', 'delivery_pending', 'contacted', 'closed'];
        if (!allowedLeadStatuses.includes(leadStatus)) {
            return NextResponse.json({ error: 'Estado comercial no valido' }, { status: 400 });
        }

        const { data: lead, error: leadError } = await supabaseAdmin
            .from('commercial_leads')
            .update({ status: leadStatus, updated_at: new Date().toISOString() })
            .eq('id', leadId)
            .select('id,status,updated_at')
            .single();

        if (leadError || !lead) {
            return NextResponse.json({ error: leadError?.message || 'No se pudo actualizar el contacto' }, { status: 500 });
        }

        return NextResponse.json({ lead });
    }

    if (!communityId || (!tierId && !subscriptionStatus)) {
        return NextResponse.json({ error: 'communityId y al menos un cambio son obligatorios' }, { status: 400 });
    }

    const allowedSubscriptionStatuses: CommunitySubscriptionStatus[] = ['active', 'past_due', 'canceled', 'trialing'];
    if (subscriptionStatus && !allowedSubscriptionStatuses.includes(subscriptionStatus)) {
        return NextResponse.json({ error: 'Estado de suscripcion no valido' }, { status: 400 });
    }

    const updates: Partial<Pick<SuperAdminCommunity, 'tier_id' | 'subscription_status'>> = {};
    if (tierId) updates.tier_id = tierId;
    if (subscriptionStatus) updates.subscription_status = subscriptionStatus;

    const { data: community, error: updateError } = await supabaseAdmin
        .from('communities')
        .update(updates)
        .eq('id', communityId)
        .select('id, name, tier_id, subscription_status')
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
        action: tierId && subscriptionStatus
            ? 'superadmin.community_plan_and_status_changed'
            : tierId
                ? 'superadmin.community_tier_changed'
                : 'superadmin.community_status_changed',
        entityType: 'community',
        entityId: communityId,
        severity: 'success',
        status: 'success',
        summary: `Configuracion comercial actualizada para ${community.name}`,
        metadata: { tierId: tierId || null, subscriptionStatus: subscriptionStatus || null, actorEmail: auth.user.email },
        requestId: getRequestId(request),
    });

    return NextResponse.json({ community });
}
