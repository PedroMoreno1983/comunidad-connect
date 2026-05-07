/**
 * /api/coco/route.ts — CoCo IA
 * Reemplaza la implementación Gemini por Claude con tool use + sesiones persistentes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { askCoCo } from '@/lib/coco/agent';
import { COCO_SYSTEM_PROMPT } from '@/lib/coco/system-prompt';
import { getSession, saveSession, checkRateLimit } from '@/lib/coco/session-store';
import { maybeCreateCoCoCase } from '@/lib/coco/caseService';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro',
];

function sanitize(value: unknown, max: number): string {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, max);
}

async function askGeminiFallback(
    message: string,
    context: {
        name: string;
        role: string;
        currentPage: string;
    }
) {
    if (!GEMINI_API_KEY) {
        throw new Error('Missing GEMINI_API_KEY');
    }

    const prompt = `${COCO_SYSTEM_PROMPT}

Contexto del usuario: Nombre: ${context.name || 'Usuario'} | Rol: ${context.role} | Página actual: ${context.currentPage}

Usuario dice: ${message}`;

    const body = {
        contents: [
            {
                role: 'user',
                parts: [{ text: prompt }],
            },
        ],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 700,
        },
    };

    const failures: string[] = [];

    for (const model of GEMINI_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok) {
            const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const navMatch = rawText.match(/NAVEGAR:(\/[a-zA-Z0-9/_-]+)/);
            const actionMatch = rawText.match(/CMD:([A-Z_]+)/);
            const reply = rawText
                .replace(/NAVEGAR:\/[a-zA-Z0-9/_-]+/g, '')
                .replace(/CMD:[A-Z_]+/g, '')
                .trim();

            return {
                reply: reply || 'No pude generar una respuesta clara.',
                navigate: navMatch?.[1],
                action: actionMatch?.[1],
            };
        }

        const errorMessage = data?.error?.message || res.statusText || 'Unknown Gemini error';
        failures.push(`[${model}]: ${res.status} - ${errorMessage}`);
    }

    throw new Error(`All Gemini configs failed: ${failures.join(' | ')}`);
}

export async function POST(req: NextRequest) {
    // ── 1. Rate Limit ────────────────────────────────────────────────────────
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? req.headers.get('x-real-ip')
        ?? 'unknown';

    if (!checkRateLimit(`web:${ip}`)) {
        return NextResponse.json(
            { reply: 'Estoy recibiendo demasiados mensajes. Por favor espera un momento. 😊' },
            { status: 429 }
        );
    }

    try {
        const body = await req.json();

        // ── 2. Validar entrada ───────────────────────────────────────────────
        const message     = sanitize(body.message, 1000);
        const userName    = sanitize(body.userName, 80);
        const userRole    = sanitize(body.userRole, 20);
        const userId      = sanitize(body.userId, 100);
        const unitId      = sanitize(body.unitId, 50);
        const unitName    = sanitize(body.unitName, 80);
        const communityId = sanitize(body.communityId, 50);
        const currentPage = sanitize(body.currentPage, 100);

        if (!message) {
            return NextResponse.json(
                { reply: 'Por favor envía un mensaje para que pueda ayudarte. 😊' },
                { status: 400 }
            );
        }

        const validRoles = ['admin', 'resident', 'concierge'];
        const safeRole = validRoles.includes(userRole) ? userRole : 'resident';
        const caseContext = {
            userId,
            unitId,
            unitName,
            communityId,
            role: safeRole,
            currentPage,
            channel: 'web',
        };

        if (!process.env.ANTHROPIC_API_KEY) {
            const fallback = await askGeminiFallback(message, {
                name: userName,
                role: safeRole,
                currentPage,
            });
            const cocoCase = await maybeCreateCoCoCase(message, caseContext, fallback.reply);

            return NextResponse.json({ ...fallback, case: cocoCase }, { status: 200 });
        }

        // ── 3. Cargar sesión ─────────────────────────────────────────────────
        const sessionKey = userId || ip;
        const session = await getSession(`web:${sessionKey}`);

        // ── 4. Llamar al agente ──────────────────────────────────────────────
        let agentResponse: Awaited<ReturnType<typeof askCoCo>>;

        try {
            agentResponse = await askCoCo(
                message,
                session,
                {
                    user_id:     userId,
                    name:        userName,
                    role:        safeRole,
                    unit_id:     unitId    || session?.user_context?.unit_id,
                    community_id: communityId || session?.user_context?.community_id,
                    currentPage,
                    channel:     'web',
                }
            );
        } catch (agentError) {
            console.error('[CoCo Anthropic Error]', agentError);
            const fallback = await askGeminiFallback(message, {
                name: userName,
                role: safeRole,
                currentPage,
            });
            const cocoCase = await maybeCreateCoCoCase(message, caseContext, fallback.reply);

            return NextResponse.json({ ...fallback, case: cocoCase }, { status: 200 });
        }

        const { reply, navigate, action, updatedHistory } = agentResponse;
        const cocoCase = await maybeCreateCoCoCase(message, caseContext, reply);

        // ── 5. Guardar sesión actualizada ────────────────────────────────────
        await saveSession(`web:${sessionKey}`, {
            conversation: updatedHistory,
            user_context: {
                role:         safeRole,
                unit_id:      unitId || session?.user_context?.unit_id,
                community_id: communityId || session?.user_context?.community_id,
                name:         userName,
                channel:      'web',
            },
        });

        return NextResponse.json({ reply, navigate, action, case: cocoCase }, { status: 200 });

    } catch (err) {
        console.error('[CoCo API Error]', err);
        const message = err instanceof Error ? err.message : '';

        if (message.includes('All Gemini configs failed')) {
            return NextResponse.json(
                { reply: 'El motor de IA está con alta demanda o modelos no disponibles. Ya dejé configurado el fallback con Gemini 2.5; vuelve a intentar en unos segundos y revisa que GEMINI_API_KEY esté activa.' },
                { status: 200 }
            );
        }

        if (message.includes('Missing GEMINI_API_KEY')) {
            return NextResponse.json(
                { reply: 'CoCo necesita ANTHROPIC_API_KEY o GEMINI_API_KEY configurada en Vercel para responder.' },
                { status: 200 }
            );
        }

        return NextResponse.json(
            { reply: 'Tuve un problema al procesar tu mensaje. Inténtalo de nuevo. 😊' },
            { status: 500 }
        );
    }
}
