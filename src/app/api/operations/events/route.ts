import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

const MAX_LIMIT = 100;

function cleanFilter(value: string | null, max = 80) {
    return value ? value.trim().slice(0, max) : '';
}

export async function GET(request: NextRequest) {
    try {
        const supabaseUser = await createClient();
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const supabaseAdmin = getSupabaseAdmin();
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id, email, role, community_id')
            .eq('id', user.id)
            .single();

        if (profileError || !profile?.community_id) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
        }

        if (profile.role !== 'admin') {
            return NextResponse.json({ error: 'Solo administracion puede revisar el centro operativo' }, { status: 403 });
        }

        const searchParams = request.nextUrl.searchParams;
        const limit = Math.min(Number(searchParams.get('limit') || 50), MAX_LIMIT);
        const severity = cleanFilter(searchParams.get('severity'));
        const status = cleanFilter(searchParams.get('status'));
        const action = cleanFilter(searchParams.get('action'));
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        let query = supabaseAdmin
            .from('operation_events')
            .select('*')
            .eq('community_id', profile.community_id)
            .order('created_at', { ascending: false })
            .limit(Number.isFinite(limit) && limit > 0 ? limit : 50);

        if (severity) query = query.eq('severity', severity);
        if (status) query = query.eq('status', status);
        if (action) query = query.eq('action', action);

        const { data: events, error: eventsError } = await query;

        if (eventsError) {
            return NextResponse.json({ error: eventsError.message }, { status: 500 });
        }

        const { data: lastDayEvents, error: summaryError } = await supabaseAdmin
            .from('operation_events')
            .select('severity,status')
            .eq('community_id', profile.community_id)
            .gte('created_at', since);

        if (summaryError) {
            return NextResponse.json({ error: summaryError.message }, { status: 500 });
        }

        const summary = (lastDayEvents || []).reduce((acc, event) => {
            acc.total += 1;
            if (event.severity === 'error' || event.status === 'error') acc.errors += 1;
            if (event.severity === 'warning' || event.status === 'blocked') acc.warnings += 1;
            if (event.status === 'success') acc.success += 1;
            if (event.status === 'pending') acc.pending += 1;
            return acc;
        }, { total: 0, success: 0, warnings: 0, errors: 0, pending: 0 });

        return NextResponse.json({
            summary,
            events: events || [],
        });
    } catch (error) {
        console.error('[operations/events] failed:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error desconocido' },
            { status: 500 }
        );
    }
}
