import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { parseTrainingSlides } from '@/lib/training/courseContent';
import type { TrainingRetentionCheck } from '@/lib/types';

const REVIEW_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

async function context(attemptId: string) {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id || !['admin', 'concierge'].includes(profile.role)) return null;
    const { data: attempt } = await getSupabaseAdmin()
        .from('training_attempts')
        .select('id,module_id,user_id,community_id,module_version,status,completed_at')
        .eq('id', attemptId)
        .eq('user_id', profile.id)
        .eq('community_id', profile.community_id)
        .maybeSingle();
    if (!attempt || attempt.status !== 'completed' || !attempt.completed_at) return null;
    return attempt;
}

function eligibleAt(completedAt: string) {
    return new Date(new Date(completedAt).getTime() + REVIEW_DELAY_MS);
}

export async function GET(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.retention.read', { limit: 40, windowMs: 60_000 });
    if (limited) return limited;
    const attemptId = req.nextUrl.searchParams.get('attemptId') || '';
    const attempt = await context(attemptId);
    if (!attempt) return NextResponse.json({ error: 'Curso aprobado no encontrado.' }, { status: 404 });
    const { data, error } = await getSupabaseAdmin()
        .from('training_retention_checks')
        .select('id,attempt_id,slide_id,is_correct,responded_at')
        .eq('attempt_id', attempt.id)
        .order('responded_at');
    if (error) return NextResponse.json({ error: 'No se pudo cargar el repaso.' }, { status: 500 });
    const due = eligibleAt(attempt.completed_at);
    return NextResponse.json({ eligible_at: due.toISOString(), eligible: Date.now() >= due.getTime(), checks: (data || []) as TrainingRetentionCheck[] });
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.retention.write', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const body = await req.json() as Record<string, unknown>;
    const attemptId = typeof body.attemptId === 'string' ? body.attemptId.trim().slice(0, 80) : '';
    const slideId = typeof body.slideId === 'string' ? body.slideId.trim().slice(0, 120) : '';
    const answer = body.answer;
    const attempt = await context(attemptId);
    if (!attempt) return NextResponse.json({ error: 'Curso aprobado no encontrado.' }, { status: 404 });
    if (Date.now() < eligibleAt(attempt.completed_at).getTime()) {
        return NextResponse.json({ error: 'El repaso se abre siete días después de aprobar el curso.' }, { status: 403 });
    }
    const supabase = getSupabaseAdmin();
    const { data: version } = await supabase.from('training_module_versions')
        .select('lesson_content')
        .eq('module_id', attempt.module_id)
        .eq('version_number', attempt.module_version)
        .maybeSingle();
    const slide = parseTrainingSlides(version?.lesson_content).find(item => item.id === slideId);
    if (!slide?.activity || slide.activity.type === 'checklist') {
        return NextResponse.json({ error: 'Esta sección no tiene pregunta de repaso.' }, { status: 400 });
    }
    if (!Number.isInteger(answer) || Number(answer) < 0 || Number(answer) >= (slide.activity.options?.length || 0)) {
        return NextResponse.json({ error: 'Selecciona una respuesta válida.' }, { status: 400 });
    }
    const { data, error } = await supabase.from('training_retention_checks').insert({
        attempt_id: attempt.id,
        module_id: attempt.module_id,
        user_id: attempt.user_id,
        community_id: attempt.community_id,
        module_version: attempt.module_version,
        slide_id: slideId,
        answer,
        is_correct: answer === slide.activity.correctIndex,
    }).select('id,attempt_id,slide_id,is_correct,responded_at').single();
    if (error?.code === '23505') return NextResponse.json({ error: 'Esta pregunta de repaso ya fue respondida.' }, { status: 409 });
    if (error || !data) return NextResponse.json({ error: 'No se pudo guardar el repaso.' }, { status: 500 });
    return NextResponse.json({ check: data as TrainingRetentionCheck }, { status: 201 });
}
