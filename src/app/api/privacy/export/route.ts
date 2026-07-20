import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export async function GET(request: NextRequest) {
    const limited = await enforceDistributedRateLimit(request, 'privacy.export', { limit: 3, windowMs: 60 * 60_000 });
    if (limited) return limited;

    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const admin = getSupabaseAdmin();
    const datasets = await Promise.all([
        admin.from('profiles').select('*').eq('id', profile.id),
        admin.from('bookings').select('*').eq('user_id', profile.id),
        admin.from('marketplace_items').select('*').eq('seller_id', profile.id),
        admin.from('poll_votes').select('*').eq('user_id', profile.id),
        admin.from('service_requests').select('*').eq('user_id', profile.id),
        admin.from('reviews').select('*').eq('user_id', profile.id),
        admin.from('solidarity_contributions').select('*').eq('user_id', profile.id),
        admin.from('solidarity_applications').select('*').eq('user_id', profile.id),
        admin.from('notifications').select('*').eq('user_id', profile.id),
        admin.from('agent_memories').select('*').eq('user_id', profile.id),
        admin.from('privacy_consent_events').select('*').eq('user_id', profile.id),
        admin.from('data_subject_requests').select('*').eq('user_id', profile.id),
    ]);

    const names = [
        'profile', 'bookings', 'marketplaceItems', 'pollVotes', 'serviceRequests', 'reviews',
        'solidarityContributions', 'solidarityApplications', 'notifications', 'agentMemories',
        'consentEvents', 'dataSubjectRequests',
    ];
    const data = Object.fromEntries(datasets.map((result, index) => [
        names[index],
        result.error ? { unavailable: true } : result.data || [],
    ]));
    const exportedAt = new Date().toISOString();
    const body = JSON.stringify({
        exportVersion: '1.0',
        exportedAt,
        userId: profile.id,
        data,
    }, null, 2);

    return new NextResponse(body, {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="convive-datos-${exportedAt.slice(0, 10)}.json"`,
            'Cache-Control': 'no-store',
        },
    });
}
