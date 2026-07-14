import { NextRequest, NextResponse } from "next/server";
import { buildTrainingFallbackTurn, runMultiAgentTurn } from "@/lib/ai/orchestrator";
import { isAiBudgetExceededError } from "@/lib/ai/budget";
import { enforceDistributedRateLimit } from "@/lib/security/rateLimit";
import { getAuthenticatedAgentProfile } from "@/lib/server/agentIdentity";
import { logApiError } from "@/lib/observability/logger";

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
        const courseContent = typeof body.courseContent === "string"
            ? body.courseContent.slice(0, MAX_COURSE_CONTENT_LENGTH)
            : undefined;
        const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_ITEMS) : [];

        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

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
            profile.name || undefined
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
