import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { parseTrainingSlides } from '@/lib/training/courseContent';
import type {
    TrainingActivityResponseRecord,
    TrainingAttemptRecord,
    TrainingCertificateRecord,
    TrainingModule,
} from '@/lib/types';

function cleanId(value: unknown, max = 120) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function loadVisibleModule(moduleId: string, communityId: string, role: string) {
    const { data } = await getSupabaseAdmin()
        .from('training_modules')
        .select('id,title,target_audience,community_id,is_active,version_number,completion_mode,embed_allowed_origin,training_lessons(id,title,content,order_index)')
        .eq('id', moduleId)
        .eq('is_active', true)
        .or(`community_id.is.null,community_id.eq.${communityId}`)
        .order('order_index', { referencedTable: 'training_lessons', ascending: true })
        .maybeSingle();
    if (!data) return null;
    if (role !== 'admin' && !['all', role].includes(data.target_audience)) return null;
    return data as TrainingModule;
}

async function loadAttempt(attemptId: string, userId: string, communityId: string) {
    const { data } = await getSupabaseAdmin()
        .from('training_attempts')
        .select('id,module_id,user_id,community_id,assignment_id,module_version,attempt_number,status,score,passed,completion_source,embed_nonce,started_at,completed_at,updated_at')
        .eq('id', attemptId)
        .eq('user_id', userId)
        .eq('community_id', communityId)
        .maybeSingle();
    return data as TrainingAttemptRecord | null;
}

async function hydrateAttempt(attempt: TrainingAttemptRecord) {
    const supabase = getSupabaseAdmin();
    const [responsesResult, certificateResult] = await Promise.all([
        supabase.from('training_activity_responses').select('id,attempt_id,slide_id,activity_type,response_number,answer,is_correct,score,responded_at').eq('attempt_id', attempt.id).order('response_number'),
        supabase.from('training_certificates').select('id,attempt_id,module_id,user_id,community_id,certificate_number,issued_at,revoked_at').eq('attempt_id', attempt.id).maybeSingle(),
    ]);
    return {
        ...attempt,
        responses: (responsesResult.data || []) as TrainingActivityResponseRecord[],
        certificate: (certificateResult.data || null) as TrainingCertificateRecord | null,
    } satisfies TrainingAttemptRecord;
}

async function loadVersionContent(moduleId: string, versionNumber: number) {
    const { data } = await getSupabaseAdmin()
        .from('training_module_versions')
        .select('lesson_content')
        .eq('module_id', moduleId)
        .eq('version_number', versionNumber)
        .maybeSingle();
    return typeof data?.lesson_content === 'string' ? data.lesson_content : '';
}

async function issueCertificate(attempt: TrainingAttemptRecord) {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
        .from('training_certificates')
        .select('id,attempt_id,module_id,user_id,community_id,certificate_number,issued_at,revoked_at')
        .eq('attempt_id', attempt.id)
        .maybeSingle();
    if (existing) return existing as TrainingCertificateRecord;
    const year = new Date().getUTCFullYear();
    const certificateNumber = `COCO-${year}-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const { data, error } = await supabase
        .from('training_certificates')
        .insert({
            attempt_id: attempt.id,
            module_id: attempt.module_id,
            user_id: attempt.user_id,
            community_id: attempt.community_id,
            certificate_number: certificateNumber,
        })
        .select('id,attempt_id,module_id,user_id,community_id,certificate_number,issued_at,revoked_at')
        .single();
    if (error || !data) throw new Error(error?.message || 'certificate_failed');
    return data as TrainingCertificateRecord;
}

async function finalizeAttempt(attempt: TrainingAttemptRecord, score: number, source: 'interactive' | 'embed_post_message', evidence: Record<string, unknown>) {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from('training_attempts')
        .update({ status: 'completed', score, passed: true, completion_source: source, completion_evidence: evidence, completed_at: now, updated_at: now })
        .eq('id', attempt.id)
        .eq('status', 'in_progress')
        .select('id,module_id,user_id,community_id,assignment_id,module_version,attempt_number,status,score,passed,completion_source,embed_nonce,started_at,completed_at,updated_at')
        .single();
    if (error || !data) throw new Error(error?.message || 'completion_failed');
    const completedAttempt = data as TrainingAttemptRecord;
    await supabase.from('user_training_progress').upsert({
        user_id: attempt.user_id,
        module_id: attempt.module_id,
        community_id: attempt.community_id,
        status: 'completed',
        last_slide_index: 10_000,
        completed_at: now,
        updated_at: now,
    }, { onConflict: 'user_id,module_id' });
    if (attempt.assignment_id) {
        await supabase.from('training_assignments').update({ status: 'completed', completed_at: now, updated_at: now }).eq('id', attempt.assignment_id);
    }
    const certificate = await issueCertificate(completedAttempt);
    return { attempt: await hydrateAttempt(completedAttempt), certificate };
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.attempts.write', { limit: 80, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (!['admin', 'concierge'].includes(profile.role)) {
        return NextResponse.json({ error: 'Aula Virtual disponible solo para administración y conserjería.' }, { status: 403 });
    }

    const body = await req.json() as Record<string, unknown>;
    const action = cleanId(body.action, 40);
    const supabase = getSupabaseAdmin();

    if (action === 'start') {
        const moduleId = cleanId(body.moduleId);
        const courseModule = await loadVisibleModule(moduleId, profile.community_id, profile.role);
        if (!courseModule) return NextResponse.json({ error: 'Curso no disponible para tu rol o comunidad.' }, { status: 404 });
        const version = courseModule.version_number || 1;
        const { data: assignment } = await supabase
            .from('training_assignments')
            .select('id,status')
            .eq('module_id', moduleId)
            .eq('user_id', profile.id)
            .eq('module_version', version)
            .neq('status', 'cancelled')
            .maybeSingle();
        const { data: latest } = await supabase
            .from('training_attempts')
            .select('id,module_id,user_id,community_id,assignment_id,module_version,attempt_number,status,score,passed,completion_source,embed_nonce,started_at,completed_at,updated_at')
            .eq('module_id', moduleId)
            .eq('user_id', profile.id)
            .eq('module_version', version)
            .order('attempt_number', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (latest) return NextResponse.json({ attempt: await hydrateAttempt(latest as TrainingAttemptRecord) });

        const now = new Date().toISOString();
        const { data: created, error } = await supabase
            .from('training_attempts')
            .insert({
                module_id: moduleId,
                user_id: profile.id,
                community_id: profile.community_id,
                assignment_id: assignment?.id || null,
                module_version: version,
                attempt_number: 1,
                completion_source: courseModule.completion_mode === 'embed_post_message' ? 'embed_post_message' : 'interactive',
            })
            .select('id,module_id,user_id,community_id,assignment_id,module_version,attempt_number,status,score,passed,completion_source,embed_nonce,started_at,completed_at,updated_at')
            .single();
        if (error || !created) return NextResponse.json({ error: 'No se pudo iniciar el intento.' }, { status: 500 });
        await supabase.from('user_training_progress').upsert({
            user_id: profile.id,
            module_id: moduleId,
            community_id: profile.community_id,
            status: 'in_progress',
            last_slide_index: 0,
            completed_at: null,
            updated_at: now,
        }, { onConflict: 'user_id,module_id' });
        if (assignment?.id && assignment.status === 'assigned') {
            await supabase.from('training_assignments').update({ status: 'in_progress', updated_at: now }).eq('id', assignment.id);
        }
        return NextResponse.json({ attempt: await hydrateAttempt(created as TrainingAttemptRecord) }, { status: 201 });
    }

    const attemptId = cleanId(body.attemptId);
    const attempt = await loadAttempt(attemptId, profile.id, profile.community_id);
    if (!attempt) return NextResponse.json({ error: 'Intento no encontrado.' }, { status: 404 });
    if (attempt.status === 'completed') return NextResponse.json({ attempt: await hydrateAttempt(attempt), error: 'Este intento ya está completado.' }, { status: 409 });

    if (action === 'answer') {
        const slideId = cleanId(body.slideId);
        const content = await loadVersionContent(attempt.module_id, attempt.module_version);
        const slide = parseTrainingSlides(content).find(item => item.id === slideId);
        if (!slide?.activity) return NextResponse.json({ error: 'Actividad no encontrada en esta versión.' }, { status: 404 });
        let isCorrect = false;
        let answer: number | string[];
        if (slide.activity.type === 'checklist') {
            const selected = Array.isArray(body.answer) ? [...new Set(body.answer.map(item => cleanId(item, 240)).filter(Boolean))] : [];
            const expected = slide.activity.items || [];
            isCorrect = selected.length === expected.length && expected.every(item => selected.includes(item));
            answer = selected;
        } else {
            const selected = Number(body.answer);
            if (!Number.isInteger(selected) || selected < 0 || selected >= (slide.activity.options?.length || 0)) {
                return NextResponse.json({ error: 'Selecciona una respuesta válida.' }, { status: 400 });
            }
            isCorrect = selected === slide.activity.correctIndex;
            answer = selected;
        }
        const { data: previous } = await supabase
            .from('training_activity_responses')
            .select('response_number')
            .eq('attempt_id', attempt.id)
            .eq('slide_id', slideId)
            .order('response_number', { ascending: false })
            .limit(1)
            .maybeSingle();
        const { data, error } = await supabase
            .from('training_activity_responses')
            .insert({
                attempt_id: attempt.id,
                slide_id: slideId,
                activity_type: slide.activity.type,
                response_number: (previous?.response_number || 0) + 1,
                answer,
                is_correct: isCorrect,
                score: isCorrect ? 100 : 0,
            })
            .select('id,attempt_id,slide_id,activity_type,response_number,answer,is_correct,score,responded_at')
            .single();
        if (error || !data) return NextResponse.json({ error: 'No se pudo registrar la respuesta.' }, { status: 500 });
        const feedback = isCorrect ? slide.activity.explanation || 'Respuesta correcta. Puedes continuar.' : 'Aún no. Revisa el criterio de la sección y vuelve a intentarlo.';
        return NextResponse.json({ response: data as TrainingActivityResponseRecord, feedback });
    }

    if (action === 'complete') {
        const content = await loadVersionContent(attempt.module_id, attempt.module_version);
        const activities = parseTrainingSlides(content).filter(slide => slide.activity);
        if (!activities.length) return NextResponse.json({ error: 'Esta versión no contiene actividades verificables.' }, { status: 400 });
        const { data: responses } = await supabase
            .from('training_activity_responses')
            .select('slide_id,response_number,is_correct,score')
            .eq('attempt_id', attempt.id)
            .order('response_number', { ascending: false });
        const latest = new Map<string, { is_correct: boolean; score: number }>();
        for (const response of responses || []) {
            if (!latest.has(response.slide_id)) latest.set(response.slide_id, response);
        }
        const activityResults = activities.map(slide => latest.get(slide.id));
        if (activityResults.some(result => !result?.is_correct)) {
            return NextResponse.json({ error: 'Completa correctamente todas las actividades antes de cerrar el curso.' }, { status: 400 });
        }
        const score = Math.round(activityResults.reduce((total, result) => total + Number(result?.score || 0), 0) / activityResults.length);
        try {
            const result = await finalizeAttempt(attempt, score, 'interactive', { verifiedActivities: activities.map(slide => slide.id) });
            return NextResponse.json(result);
        } catch (error) {
            console.error('[training/attempts] Completion failed:', error instanceof Error ? error.message : error);
            return NextResponse.json({ error: 'No se pudo certificar el cierre del curso.' }, { status: 500 });
        }
    }

    if (action === 'embed_complete') {
        const courseModule = await loadVisibleModule(attempt.module_id, profile.community_id, profile.role);
        const nonce = cleanId(body.nonce);
        const origin = cleanId(body.origin, 500);
        const eventId = cleanId(body.eventId, 160);
        const score = Math.max(0, Math.min(100, Number(body.score) || 0));
        if (courseModule?.completion_mode !== 'embed_post_message' || !courseModule.embed_allowed_origin) {
            return NextResponse.json({ error: 'Este curso externo no tiene habilitada la validación automática.' }, { status: 400 });
        }
        if (!nonce || nonce !== attempt.embed_nonce || origin !== courseModule.embed_allowed_origin || !eventId || score < 80) {
            return NextResponse.json({ error: 'La evidencia de finalización no es válida.' }, { status: 400 });
        }
        try {
            const result = await finalizeAttempt(attempt, score, 'embed_post_message', { origin, eventId, receivedAt: new Date().toISOString() });
            return NextResponse.json(result);
        } catch (error) {
            console.error('[training/attempts] Embed completion failed:', error instanceof Error ? error.message : error);
            return NextResponse.json({ error: 'No se pudo certificar el curso externo.' }, { status: 500 });
        }
    }

    return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
}
