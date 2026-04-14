/**
 * /api/coco/route.ts — CoCo IA
 * Reemplaza la implementación Gemini por Claude con tool use + sesiones persistentes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { askCoCo } from '@/lib/coco/agent';
import { getSession, saveSession, checkRateLimit } from '@/lib/coco/session-store';

function sanitize(value: unknown, max: number): string {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, max);
}

export async function POST(req: NextRequest) {
    // ── 1. Verificar API Key ─────────────────────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
            { reply: '⚠️ CoCo no está configurada. Falta ANTHROPIC_API_KEY en las variables de entorno de Vercel.' },
            { status: 200 }
        );
    }

    // ── 2. Rate Limit ────────────────────────────────────────────────────────
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

        // ── 3. Validar entrada ───────────────────────────────────────────────
        const message     = sanitize(body.message, 1000);
        const userName    = sanitize(body.userName, 80);
        const userRole    = sanitize(body.userRole, 20);
        const userId      = sanitize(body.userId, 100);
        const unitId      = sanitize(body.unitId, 50);
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

        // ── 4. Cargar sesión ─────────────────────────────────────────────────
        const sessionKey = userId || ip;
        const session = await getSession(`web:${sessionKey}`);

        // ── 5. Llamar al agente ──────────────────────────────────────────────
        const { reply, navigate, updatedHistory } = await askCoCo(
            message,
            session,
            {
                name:        userName,
                role:        safeRole,
                unit_id:     unitId    || session?.user_context?.unit_id,
                community_id: communityId || session?.user_context?.community_id,
                currentPage,
                channel:     'web',
            }
        );

        // ── 6. Guardar sesión actualizada ────────────────────────────────────
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

        return NextResponse.json({ reply, navigate }, { status: 200 });

    } catch (err) {
        console.error('[CoCo API Error]', err);
        return NextResponse.json(
            { reply: 'Tuve un problema al procesar tu mensaje. Inténtalo de nuevo. 😊' },
            { status: 500 }
        );
    }
}
