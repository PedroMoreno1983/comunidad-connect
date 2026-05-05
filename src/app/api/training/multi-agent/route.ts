import { NextRequest, NextResponse } from "next/server";
import { runMultiAgentTurn } from "@/lib/ai/orchestrator";

// Rate limiter implementation similar to CoCo
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
    const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
    
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? req.headers.get("x-real-ip")
        ?? "unknown";

    if (!checkRateLimit(ip)) {
        return NextResponse.json(
            { error: "Too many messages" },
            { status: 429 }
        );
    }

    if (!GEMINI_API_KEY || !GEMINI_API_KEY.startsWith("AIza")) {
        return NextResponse.json({
            responses: [{
                id: `sys-err-${Date.now()}`,
                role: 'system',
                text: 'Error interno: La GEMINI_API_KEY no está configurada correctamente en el entorno.'
            }]
        }, { status: 200 });
    }

    try {
        const body = await req.json();
        const { message, history, courseContent, userId, communityId } = body;

        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        // Call the orchestrator, passing the injected courseContent if available
        const responses = await runMultiAgentTurn(GEMINI_API_KEY, history || [], message, courseContent, userId, communityId);

        return NextResponse.json({ responses }, { status: 200 });

    } catch (error: unknown) {
        console.error("Training MultiAgent API Error:", error);
        return NextResponse.json({
            responses: [{
                id: `sys-err-${Date.now()}`,
                role: 'system',
                text: `Error de los modelos de IA: ${error instanceof Error ? error.message : "Desconocido"}. Revisa los logs o tu clave de API.`
            }]
        }, { status: 200 });
    }
}
