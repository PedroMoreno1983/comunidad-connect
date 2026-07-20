import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { DataSubjectRequestType } from '@/lib/types';

const REQUEST_TYPES = new Set<DataSubjectRequestType>([
    'access',
    'rectification',
    'deletion',
    'opposition',
    'portability',
]);

function cleanText(value: unknown, maxLength: number) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export async function GET(request: NextRequest) {
    const limited = await enforceDistributedRateLimit(request, 'privacy.requests.list', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data, error } = await getSupabaseAdmin()
        .from('data_subject_requests')
        .select('id, request_type, status, details, response_summary, received_at, due_at, completed_at')
        .eq('user_id', profile.id)
        .order('received_at', { ascending: false });

    if (error) {
        console.error('[privacy requests] list failed', error);
        return NextResponse.json({ error: 'No se pudieron cargar tus solicitudes.' }, { status: 500 });
    }
    return NextResponse.json({ requests: data || [] });
}

export async function POST(request: NextRequest) {
    const limited = await enforceDistributedRateLimit(request, 'privacy.requests.create', { limit: 5, windowMs: 60 * 60_000 });
    if (limited) return limited;

    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const requestType = cleanText(body.requestType, 30) as DataSubjectRequestType;
    const details = cleanText(body.details, 2_000);
    if (!REQUEST_TYPES.has(requestType)) {
        return NextResponse.json({ error: 'Tipo de solicitud inválido.' }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
        .from('data_subject_requests')
        .insert({
            user_id: profile.id,
            community_id: profile.community_id || null,
            request_type: requestType,
            subject_email: profile.email,
            details: details || null,
        })
        .select('id, request_type, status, details, response_summary, received_at, due_at, completed_at')
        .single();

    if (error) {
        console.error('[privacy requests] create failed', error);
        return NextResponse.json({ error: 'No se pudo registrar la solicitud.' }, { status: 500 });
    }
    return NextResponse.json({ request: data }, { status: 201 });
}
