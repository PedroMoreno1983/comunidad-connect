import { NextRequest, NextResponse } from "next/server";
import { buildTrainingFallbackTurn, runMultiAgentTurn } from "@/lib/ai/orchestrator";
import { isAiBudgetExceededError } from "@/lib/ai/budget";
import { enforceDistributedRateLimit } from "@/lib/security/rateLimit";
import { getAuthenticatedAgentProfile } from "@/lib/server/agentIdentity";
import { logApiError } from "@/lib/observability/logger";
import { getSupabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import { parseTrainingSlides } from "@/lib/training/courseContent";
import { runClassroomTurn } from "@/lib/training/classroomAgents";
import type { TrainingChatMessage, TrainingSlide } from "@/lib/types";

const MAX_MESSAGE_LENGTH = 4_000;
const MAX_COURSE_CONTENT_LENGTH = 40_000;
const MAX_HISTORY_ITEMS = 30;

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, "training.multi_agent", { limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();
    let message = "";
    let currentSlide: TrainingSlide | null = null;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        if (!['admin', 'concierge'].includes(profile.role)) {
            return NextResponse.json({ error: "Aula Virtual disponible solo para administracion y conserjeria." }, { status: 403 });
        }

        const body = await req.json() as Record<string, unknown>;
        message = typeof body.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
        const moduleId = typeof body.moduleId === "string" ? body.moduleId.trim().slice(0, 80) : "";
        const currentSlideId = typeof body.currentSlideId === "string" ? body.currentSlideId.trim().slice(0, 120) : "";
        const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_ITEMS) : [];

        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }
        if (!moduleId || !profile.community_id) return NextResponse.json({ error: "Falta el curso publicado." }, { status: 400 });

        let moduleQuery = getSupabaseAdmin()
            .from('training_modules')
            .select('id,title,description,target_audience,learning_objectives,version_number,training_lessons(content,order_index)')
            .eq('id', moduleId)
            .eq('is_active', true)
            .or(`community_id.is.null,community_id.eq.${profile.community_id}`)
            .order('order_index', { referencedTable: 'training_lessons', ascending: true });
        if (profile.role !== 'admin') moduleQuery = moduleQuery.in('target_audience', ['all', profile.role]);
        const { data: courseModule } = await moduleQuery.maybeSingle();
        if (!courseModule) return NextResponse.json({ error: "Curso no disponible para tu rol o comunidad." }, { status: 404 });
        const lessonContent = courseModule.training_lessons?.[0]?.content || '';
        currentSlide = parseTrainingSlides(lessonContent).find(slide => slide.id === currentSlideId) || null;
        let practiceContext = '';
        if (currentSlide?.activity) {
            const { data: latestAttempt } = await getSupabaseAdmin()
                .from('training_attempts')
                .select('id')
                .eq('module_id', moduleId)
                .eq('user_id', profile.id)
                .eq('community_id', profile.community_id)
                .eq('module_version', courseModule.version_number || 1)
                .order('attempt_number', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (latestAttempt) {
                const { data: activityResponses } = await getSupabaseAdmin()
                    .from('training_activity_responses')
                    .select('response_number,is_correct')
                    .eq('attempt_id', latestAttempt.id)
                    .eq('slide_id', currentSlide.id)
                    .order('response_number', { ascending: false })
                    .limit(5);
                if (activityResponses?.length) {
                    const latest = activityResponses[0];
                    practiceContext = `Práctica registrada en esta sección: ${activityResponses.length} respuesta(s) reciente(s); la última fue ${latest.is_correct ? 'correcta' : 'incorrecta'}. No reveles la alternativa correcta; ayuda a razonar el criterio.`;
                }
            }
        }
        const courseContent = JSON.stringify({
            course: { title: courseModule.title, description: courseModule.description, objectives: courseModule.learning_objectives },
            participantRole: profile.role,
            practiceContext,
            currentSection: currentSlide || null,
            fullCourse: parseTrainingSlides(lessonContent),
            instruction: 'Responde desde esta versión publicada. Distingue responsabilidades, cita la sección pertinente y termina con una acción aplicable al rol.',
        }).slice(0, MAX_COURSE_CONTENT_LENGTH);

        // Motor principal: Claude, en una sola llamada coherente. Gemini queda de
        // respaldo, y la respuesta anclada a la sección, como último recurso.
        if (process.env.ANTHROPIC_API_KEY) {
            try {
                const responses = await runClassroomTurn({
                    role: profile.role as 'admin' | 'concierge',
                    course: {
                        title: String(courseModule.title),
                        description: courseModule.description ?? null,
                        objectives: Array.isArray(courseModule.learning_objectives) ? courseModule.learning_objectives : [],
                        slides: parseTrainingSlides(lessonContent),
                    },
                    section: currentSlide,
                    message,
                    history: history as TrainingChatMessage[],
                    learnerName: profile.name && !profile.name.includes("@") ? profile.name : undefined,
                    communityId: profile.community_id || undefined,
                    userId: profile.id,
                    practiceContext,
                });
                return NextResponse.json({ responses }, { status: 200 });
            } catch (error) {
                if (isAiBudgetExceededError(error)) throw error;
                logApiError(req, "/api/training/multi-agent#claude", error);
            }
        }

        if (!geminiApiKey || !geminiApiKey.startsWith("AIza")) {
            const responses = await buildTrainingFallbackTurn(history || [], message, currentSlide);
            return NextResponse.json({ responses }, { status: 200 });
        }

        const responses = await runMultiAgentTurn(
            geminiApiKey,
            history || [],
            message,
            courseContent,
            profile.id,
            profile.community_id || undefined,
            profile.name || undefined,
            profile.role as 'admin' | 'concierge',
        );

        return NextResponse.json({ responses }, { status: 200 });
    } catch (error: unknown) {
        if (isAiBudgetExceededError(error)) {
            return NextResponse.json({
                responses: [{
                    id: `budget-${Date.now()}`,
                    role: 'system',
                    text: error.reason,
                }]
            }, { status: 429 });
        }

        logApiError(req, "/api/training/multi-agent", error);
        const responses = await buildTrainingFallbackTurn([], message, currentSlide);
        return NextResponse.json({ responses }, { status: 200 });
    }
}
