import { NextRequest, NextResponse } from "next/server";
import { buildTrainingFallbackTurn, runMultiAgentTurn } from "@/lib/ai/orchestrator";
import { isAiBudgetExceededError } from "@/lib/ai/budget";
import { enforceDistributedRateLimit } from "@/lib/security/rateLimit";
import { getAuthenticatedAgentProfile } from "@/lib/server/agentIdentity";
import { logApiError } from "@/lib/observability/logger";
import { getSupabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import { parseTrainingSlides } from "@/lib/training/courseContent";

const MAX_MESSAGE_LENGTH = 4_000;
const MAX_COURSE_CONTENT_LENGTH = 40_000;
const MAX_HISTORY_ITEMS = 30;

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, "training.multi_agent", { limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        if (!['admin', 'concierge'].includes(profile.role)) {
            return NextResponse.json({ error: "Aula Virtual disponible solo para administracion y conserjeria." }, { status: 403 });
        }

        const body = await req.json() as Record<string, unknown>;
        const message = typeof body.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
        const moduleId = typeof body.moduleId === "string" ? body.moduleId.trim().slice(0, 80) : "";
        const currentSlideId = typeof body.currentSlideId === "string" ? body.currentSlideId.trim().slice(0, 120) : "";
        const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_ITEMS) : [];

        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }
        if (!moduleId || !profile.community_id) return NextResponse.json({ error: "Falta el curso publicado." }, { status: 400 });

        let moduleQuery = getSupabaseAdmin()
            .from('training_modules')
            .select('id,title,description,target_audience,learning_objectives,training_lessons(content,order_index)')
            .eq('id', moduleId)
            .eq('is_active', true)
            .or(`community_id.is.null,community_id.eq.${profile.community_id}`)
            .order('order_index', { referencedTable: 'training_lessons', ascending: true });
        if (profile.role !== 'admin') moduleQuery = moduleQuery.in('target_audience', ['all', profile.role]);
        const { data: courseModule } = await moduleQuery.maybeSingle();
        if (!courseModule) return NextResponse.json({ error: "Curso no disponible para tu rol o comunidad." }, { status: 404 });
        const lessonContent = courseModule.training_lessons?.[0]?.content || '';
        const currentSlide = parseTrainingSlides(lessonContent).find(slide => slide.id === currentSlideId);
        const courseContent = JSON.stringify({
            course: { title: courseModule.title, description: courseModule.description, objectives: courseModule.learning_objectives },
            participantRole: profile.role,
            currentSection: currentSlide || null,
            fullCourse: parseTrainingSlides(lessonContent),
            instruction: 'Responde desde esta versión publicada. Distingue responsabilidades, cita la sección pertinente y termina con una acción aplicable al rol.',
        }).slice(0, MAX_COURSE_CONTENT_LENGTH);

        if (!geminiApiKey || !geminiApiKey.startsWith("AIza")) {
            const responses = await buildTrainingFallbackTurn(history || [], message);
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
        return NextResponse.json({
            responses: [{
                id: `sys-err-${Date.now()}`,
                role: 'system',
                text: 'La sala de IA tuvo una intermitencia. Intenta de nuevo en unos segundos; la clase sigue disponible.'
            }]
        }, { status: 200 });
    }
}
