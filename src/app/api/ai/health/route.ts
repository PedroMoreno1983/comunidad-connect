import { NextRequest, NextResponse } from "next/server";
import { getAiHealthSnapshot } from "@/lib/ai/telemetry";

export async function GET(req: NextRequest) {
    const token = process.env.AI_HEALTH_TOKEN;
    const provided = req.nextUrl.searchParams.get("token") || req.headers.get("x-ai-health-token");

    if (process.env.NODE_ENV === "production" && !token) {
        return NextResponse.json({ error: "AI_HEALTH_TOKEN no configurado" }, { status: 503 });
    }

    if (token && provided !== token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(getAiHealthSnapshot(), { status: 200 });
}
