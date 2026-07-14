import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';

export async function GET(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.progress.read', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (!['admin', 'concierge'].includes(profile.role)) {
        return NextResponse.json({ error: 'Aula Virtual disponible solo para administracion y conserjeria.' }, { status: 403 });
    }

    const { data, error } = await getSupabaseAdmin()
        .from('user_training_progress')
        .select('module_id,status,last_slide_index,started_at,completed_at,updated_at')
        .eq('user_id', profile.id)
        .eq('community_id', profile.community_id);
    if (error) return NextResponse.json({ error: 'No se pudo cargar el progreso.' }, { status: 500 });
    return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.progress.write', { limit: 40, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (!['admin', 'concierge'].includes(profile.role)) {
        return NextResponse.json({ error: 'Aula Virtual disponible solo para administracion y conserjeria.' }, { status: 403 });
    }

    const body = await req.json() as Record<string, unknown>;
    const moduleId = typeof body.moduleId === 'string' ? body.moduleId : '';
    const status = body.status === 'completed' ? 'completed' : 'in_progress';
    const lastSlideIndex = typeof body.lastSlideIndex === 'number' && Number.isInteger(body.lastSlideIndex)
        ? Math.max(0, Math.min(body.lastSlideIndex, 10_000))
        : 0;
    if (!moduleId) return NextResponse.json({ error: 'Falta el curso.' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: module } = await supabase
        .from('training_modules')
        .select('id,target_audience,community_id,is_active')
        .eq('id', moduleId)
        .eq('is_active', true)
        .or(`community_id.is.null,community_id.eq.${profile.community_id}`)
        .maybeSingle();
    if (!module) return NextResponse.json({ error: 'Curso no disponible para tu comunidad.' }, { status: 404 });
    if (profile.role !== 'admin' && !['all', profile.role].includes(module.target_audience)) {
        return NextResponse.json({ error: 'Curso no disponible para tu rol.' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const payload = {
        user_id: profile.id,
        module_id: moduleId,
        community_id: profile.community_id,
        status,
        last_slide_index: lastSlideIndex,
        completed_at: status === 'completed' ? now : null,
        updated_at: now,
    };
    const { data, error } = await supabase
        .from('user_training_progress')
        .upsert(payload, { onConflict: 'user_id,module_id' })
        .select('module_id,status,last_slide_index,started_at,completed_at,updated_at')
        .single();
    if (error) {
        console.error('[training/progress] Write failed:', error.message);
        return NextResponse.json({ error: 'No se pudo guardar el progreso.' }, { status: 500 });
    }
    return NextResponse.json(data);
}
