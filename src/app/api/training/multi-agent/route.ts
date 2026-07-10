import { NextRequest, NextResponse } from "next/server";
import { buildTrainingFallbackTurn, runMultiAgentTurn } from "@/lib/ai/orchestrator";
import { isAiBudgetExceededError } from "@/lib/ai/budget";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 50;
const RATE_LIMIT_WINDOW = 60_000;

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
        return true;
    }
    if (entry.count >= RATE_LIMIT_MAX) return false;
    entry.count++;
    return true;
}

export async function POST(req: NextRequest) {
    const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? req.headers.get("x-real-ip")
        ?? "unknown";

    if (!checkRateLimit(ip)) {
        return NextResponse.json(
            { error: "Too many messages" },
            { status: 429 }
        );
    }

    try {
        const body = await req.json();
        const { message, history, courseContent, userId, communityId, userName } = body;

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
            userId,
            communityId,
            userName
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

        console.error("Training MultiAgent API Error:", error);
        return NextResponse.json({
            responses: [{
                id: `sys-err-${Date.now()}`,
                role: 'system',
                text: 'La sala de IA tuvo una intermitencia. Intenta de nuevo en unos segundos; la clase sigue disponible.'
            }]
        }, { status: 200 });
    }
}
