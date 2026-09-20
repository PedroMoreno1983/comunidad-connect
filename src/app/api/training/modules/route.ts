import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { isPublishableTrainingCourse, parseTrainingSlides, trainingQualityReport } from '@/lib/training/courseContent';
import type { TrainingModule } from '@/lib/types';

const MODULE_SELECT = 'id,title,description,target_audience,is_active,community_id,created_at,embed_url,learning_objectives,estimated_minutes,quality_version,quality_score,version_number,completion_mode,embed_allowed_origin,published_at,updated_at,training_lessons(id,title,content,order_index)';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function parseEmbedConfiguration(embedUrl: string, requestedMode: unknown) {
    if (!embedUrl) return { completionMode: 'interactive' as const, embedAllowedOrigin: null };
    const parsed = new URL(embedUrl);
    if (parsed.protocol !== 'https:') throw new Error('invalid_embed_url');
    const completionMode = requestedMode === 'embed_manual' ? 'embed_manual' as const : 'embed_post_message' as const;
    return { completionMode, embedAllowedOrigin: parsed.origin };
}

async function fetchModule(moduleId: string) {
    const { data } = await getSupabaseAdmin()
        .from('training_modules')
        .select(MODULE_SELECT)
        .eq('id', moduleId)
        .order('order_index', { referencedTable: 'training_lessons', ascending: true })
        .single();
    return data as TrainingModule | null;
}

async function notifyAudience(communityId: string, actorId: string, title: string, targetAudience: string, updated: boolean) {
    const audienceRoles = targetAudience === 'admin' ? ['admin'] : targetAudience === 'concierge' ? ['concierge'] : ['admin', 'concierge'];
    const supabase = getSupabaseAdmin();
    const { data: audience } = await supabase
        .from('profiles')
        .select('id')
        .eq('community_id', communityId)
        .in('role', audienceRoles);
    const recipients = (audience || []).filter(member => member.id !== actorId);
    if (!recipients.length) return;
    await supabase.from('notifications').insert(recipients.map(member => ({
        user_id: member.id,
        type: 'info',
        category: 'training',
        title: updated ? 'Curso actualizado' : 'Nuevo curso disponible',
        body: updated ? `${title} publicó una nueva versión.` : `${title} ya está publicado en el Aula virtual.`,
        link: '/staff/training',
        community_id: communityId,
    })));
}

function parseCourseBody(body: Record<string, unknown>) {
    const title = cleanText(body.title, 180);
    const description = cleanText(body.description, 1_500);
    const content = cleanText(body.content, 140_000);
    const embedUrl = cleanText(body.embedUrl, 2_000);
    const estimatedMinutes = Math.max(5, Math.min(480, Number(body.estimatedMinutes) || 20));
    const learningObjectives = Array.isArray(body.learningObjectives)
        ? body.learningObjectives.map(item => cleanText(item, 240)).filter(Boolean).slice(0, 8)
        : [];
    const requestedAudience = cleanText(body.targetAudience ?? body.target_audience, 20);
    const targetAudience = ['all', 'concierge', 'admin'].includes(requestedAudience) ? requestedAudience : 'all';
    const slides = parseTrainingSlides(content);

    if (!title || !description || learningObjectives.length === 0 || (!content && !embedUrl)) {
        throw new Error('missing_fields');
    }
    if (content && !isPublishableTrainingCourse(slides)) throw new Error('quality_gate');
    const embed = parseEmbedConfiguration(embedUrl, body.completionMode);
    const qualityScore = content ? trainingQualityReport(slides).score : 85;
    return {
        title,
        description,
        content: slides.length ? JSON.stringify(slides) : 'Curso alojado en el recurso embebido.',
        embedUrl: embedUrl || null,
        estimatedMinutes,
        learningObjectives,
        targetAudience,
        qualityScore,
        ...embed,
    };
}

function courseBodyError(error: unknown) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'missing_fields') return NextResponse.json({ error: 'Completa título, descripción, objetivos y contenido del curso.' }, { status: 400 });
    if (code === 'quality_gate') return NextResponse.json({ error: 'El curso no supera el control editorial: necesita al menos 6 secciones, las 3 actividades y un cierre aplicable.' }, { status: 400 });
    if (code === 'invalid_embed_url') return NextResponse.json({ error: 'El enlace embebido debe ser una URL HTTPS válida.' }, { status: 400 });
    return null;
}

export async function GET(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.modules.read', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (!['admin', 'concierge'].includes(profile.role)) {
        return NextResponse.json({ error: 'Aula Virtual disponible solo para administración y conserjería.' }, { status: 403 });
    }

    let query = getSupabaseAdmin()
        .from('training_modules')
        .select(MODULE_SELECT)
        .eq('is_active', true)
        .or(`community_id.is.null,community_id.eq.${profile.community_id}`)
        .order('created_at', { ascending: false })
        .order('order_index', { referencedTable: 'training_lessons', ascending: true });
    if (profile.role !== 'admin') query = query.in('target_audience', ['all', profile.role]);
    const { data, error } = await query;
    if (error) {
        console.error('[training/modules] Read failed:', error.message);
        return NextResponse.json({ error: 'No se pudieron cargar los cursos.' }, { status: 500 });
    }
    return NextResponse.json((data || []) as TrainingModule[]);
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.modules.create', { limit: 12, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (profile?.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Solo administración puede publicar cursos.' }, { status: 403 });
    }

    try {
        const values = parseCourseBody(await req.json() as Record<string, unknown>);
        const { data: moduleId, error } = await getSupabaseAdmin().rpc('training_create_module_version', {
            p_actor_id: profile.id,
            p_community_id: profile.community_id,
            p_title: values.title,
            p_description: values.description,
            p_target_audience: values.targetAudience,
            p_lesson_title: 'Curso interactivo',
            p_lesson_content: values.content,
            p_embed_url: values.embedUrl,
            p_completion_mode: values.completionMode,
            p_embed_allowed_origin: values.embedAllowedOrigin,
            p_learning_objectives: values.learningObjectives,
            p_estimated_minutes: values.estimatedMinutes,
            p_quality_score: values.qualityScore,
        });
        if (error || !moduleId) throw new Error(error?.message || 'create_failed');
        const courseModule = await fetchModule(String(moduleId));
        if (!courseModule) throw new Error('create_failed');
        await notifyAudience(profile.community_id, profile.id, values.title, values.targetAudience, false);
        return NextResponse.json({ success: true, module: courseModule }, { status: 201 });
    } catch (error) {
        const response = courseBodyError(error);
        if (response) return response;
        console.error('[training/modules] Create failed:', error instanceof Error ? error.message : error);
        return NextResponse.json({ error: 'No se pudo guardar el curso.' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.modules.update', { limit: 12, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (profile?.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Solo administración puede editar cursos.' }, { status: 403 });
    }

    try {
        const body = await req.json() as Record<string, unknown>;
        const moduleId = cleanText(body.id, 80);
        if (!moduleId) return NextResponse.json({ error: 'Falta el curso.' }, { status: 400 });
        const values = parseCourseBody(body);
        const { error } = await getSupabaseAdmin().rpc('training_publish_module_version', {
            p_module_id: moduleId,
            p_actor_id: profile.id,
            p_community_id: profile.community_id,
            p_title: values.title,
            p_description: values.description,
            p_target_audience: values.targetAudience,
            p_lesson_title: 'Curso interactivo',
            p_lesson_content: values.content,
            p_embed_url: values.embedUrl,
            p_completion_mode: values.completionMode,
            p_embed_allowed_origin: values.embedAllowedOrigin,
            p_learning_objectives: values.learningObjectives,
            p_estimated_minutes: values.estimatedMinutes,
            p_quality_score: values.qualityScore,
            p_change_summary: cleanText(body.changeSummary, 500) || 'Actualización de contenido y actividades',
        });
        if (error) {
            if (error.message.includes('training_module_not_editable')) {
                return NextResponse.json({ error: 'Los cursos oficiales se personalizan como una copia para tu comunidad.' }, { status: 403 });
            }
            throw new Error(error.message);
        }
        const courseModule = await fetchModule(moduleId);
        if (!courseModule) throw new Error('updated_module_missing');
        await notifyAudience(profile.community_id, profile.id, values.title, values.targetAudience, true);
        return NextResponse.json({ success: true, module: courseModule });
    } catch (error) {
        const response = courseBodyError(error);
        if (response) return response;
        console.error('[training/modules] Update failed:', error instanceof Error ? error.message : error);
        return NextResponse.json({ error: 'No se pudo publicar la nueva versión.' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.modules.archive', { limit: 12, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (profile?.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Solo administración puede archivar cursos.' }, { status: 403 });
    }
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Falta el ID del curso.' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: courseModule } = await supabase.from('training_modules').select('id,community_id').eq('id', id).maybeSingle();
    if (!courseModule) return NextResponse.json({ error: 'Curso no encontrado.' }, { status: 404 });
    if (!courseModule.community_id) return NextResponse.json({ error: 'Los cursos oficiales no se pueden archivar.' }, { status: 403 });
    if (courseModule.community_id !== profile.community_id) return NextResponse.json({ error: 'Curso fuera de tu comunidad.' }, { status: 403 });

    const { error } = await supabase.from('training_modules').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id).eq('community_id', profile.community_id);
    if (error) return NextResponse.json({ error: 'No se pudo archivar el curso.' }, { status: 500 });
    await supabase.from('training_assignments').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('module_id', id).eq('community_id', profile.community_id).in('status', ['assigned', 'in_progress']);
    return NextResponse.json({ success: true });
}
