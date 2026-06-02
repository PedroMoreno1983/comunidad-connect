/**
 * /api/coco/route.ts — CoCo IA
 * Reemplaza la implementación Gemini por Claude con tool use + sesiones persistentes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { askCoCo } from '@/lib/coco/agent';
import { COCO_SYSTEM_PROMPT } from '@/lib/coco/system-prompt';
import { getSession, saveSession, checkRateLimit } from '@/lib/coco/session-store';
import { maybeCreateCoCoCase } from '@/lib/coco/caseService';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromText, isAiBudgetExceededError, recordAiUsage } from '@/lib/ai/budget';

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
        userId?: string;
        communityId?: string;
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
    const estimatedPromptTokens = estimateTokensFromText(prompt);
    const estimatedCompletionTokens = 700;

    for (const model of GEMINI_MODELS) {
        await enforceAiBudget({
            communityId: context.communityId,
            userId: context.userId,
            role: context.role,
            module: 'coco.chat.fallback',
            provider: 'gemini',
            model,
            actionType: 'fallback',
            estimatedPromptTokens,
            estimatedCompletionTokens,
        });

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const startedAt = Date.now();
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
            const completionTokens = estimateTokensFromText(rawText);

            await recordAiUsage({
                communityId: context.communityId,
                userId: context.userId,
                role: context.role,
                module: 'coco.chat.fallback',
                provider: 'gemini',
                model,
                actionType: 'fallback',
                promptTokens: estimatedPromptTokens,
                completionTokens,
                totalTokens: estimatedPromptTokens + completionTokens,
                estimatedCostCents: estimateAiCostCents({
                    provider: 'gemini',
                    model,
                    promptTokens: estimatedPromptTokens,
                    completionTokens,
                }),
                status: 'success',
                metadata: { latencyMs: Date.now() - startedAt },
            });

            return {
                reply: reply || 'No pude generar una respuesta clara.',
                navigate: navMatch?.[1],
                action: actionMatch?.[1],
            };
        }

        const errorMessage = data?.error?.message || res.statusText || 'Unknown Gemini error';
        await recordAiUsage({
            communityId: context.communityId,
            userId: context.userId,
            role: context.role,
            module: 'coco.chat.fallback',
            provider: 'gemini',
            model,
            actionType: 'fallback',
            promptTokens: estimatedPromptTokens,
            completionTokens: 0,
            totalTokens: estimatedPromptTokens,
            status: 'error',
            metadata: { latencyMs: Date.now() - startedAt, status: res.status },
            blockedReason: errorMessage,
        });
        failures.push(`[${model}]: ${res.status} - ${errorMessage}`);
    }

    throw new Error(`All Gemini configs failed: ${failures.join(' | ')}`);
}

function buildLocalCoCoFallback(
    message: string,
    context: {
        name: string;
        role: string;
        currentPage: string;
    }
) {
    const text = message.toLowerCase();
    const page = context.currentPage || '';

    if (
        text.includes('ley') ||
        text.includes('copropiedad') ||
        text.includes('reglamento') ||
        text.includes('ruido') ||
        text.includes('moroso') ||
        text.includes('morosidad') ||
        text.includes('gasto comun') ||
        text.includes('gastos comunes') ||
        text.includes('administrador')
    ) {
        if (text.includes('dato') || text.includes('camara') || text.includes('cámara') || text.includes('rut') || text.includes('whatsapp')) {
            return {
                reply: 'Como orientación operativa, aplica minimización y acceso por rol. La Ley 21.719 exige tratar datos personales con finalidad, proporcionalidad, seguridad, transparencia y confidencialidad. No conviene exponer RUT, teléfonos, imágenes de cámaras, deudas o datos de contacto a vecinos no autorizados. Si es una solicitud formal de acceso, rectificación o eliminación, debe canalizarla Administración.',
                navigate: context.role === 'admin' ? '/admin/users' : '/profile',
                action: 'OPEN_PRIVACY_CONTEXT',
            };
        }

        if (text.includes('ruido') || text.includes('fiesta') || text.includes('molestia')) {
            return {
                reply: 'Como orientación operativa, la Ley 21.442 art. 27 protege la tranquilidad de la comunidad, pero antes de escalar a multa conviene intentar mediación activa. Te propongo ordenar el mensaje con Comunicación No Violenta: observación concreta, cómo te afecta, qué necesitas y una petición amable. Si hay reincidencia o riesgo, Administración puede aplicar reglamento y dejar trazabilidad. Esto no reemplaza asesoría jurídica.',
                navigate: '/convivencia',
                action: 'OPEN_MEDIATION_CNV',
            };
        }

        if (text.includes('moroso') || text.includes('morosidad') || text.includes('gasto comun') || text.includes('gastos comunes') || text.includes('corte') || text.includes('suspension')) {
            return {
                reply: 'Como orientación operativa, los gastos comunes se rigen por la Ley 21.442 arts. 31 y 32, y el aviso de cobro firmado por la administración tiene mérito ejecutivo. Para suspensión de servicios, el art. 36 exige tres o más cuotas morosas, autorización previa del comité y solicitud escrita del administrador; además, no se puede suspender electricidad a personas electrodependientes. Evita divulgar deudas de otros residentes fuera de perfiles autorizados.',
                navigate: context.role === 'admin' ? '/admin/finanzas' : '/resident/finances',
                action: 'OPEN_FINANCES',
            };
        }

        return {
            reply: 'Como orientación operativa, CoCo usa la Ley 21.442 de Copropiedad Inmobiliaria, su reglamento y la Ley 21.719 de datos personales. Para administrador: revisar inscripción vigente, rendición de cuentas, cobro y conservación de bienes comunes. Para convivencia: registrar hechos, aplicar reglamento y mantener trazabilidad. Para datos personales: mínimo dato necesario, finalidad clara y acceso por rol. No reemplazo asesoría legal, pero puedo ayudarte a ordenar el caso.',
            navigate: context.role === 'admin' ? '/admin/training' : '/resident/training',
            action: 'OPEN_LEGAL_GUIDANCE',
        };
    }

    if (text.includes('mediacion') || text.includes('mediación') || text.includes('cnv') || text.includes('convivencia') || text.includes('vecino dificil') || text.includes('vecino difícil')) {
        return {
            reply: 'Podemos resolverlo desde convivencia activa. En vez de partir con denuncia, usa el flujo CNV: hecho observable, sentimiento, necesidad y petición privada. CoCo puede redactar el mensaje para bajar defensividad y dejar trazabilidad si luego hace falta escalar.',
            navigate: '/convivencia',
            action: 'OPEN_MEDIATION_CNV',
        };
    }

    if (text.includes('taladro') || text.includes('ayuda mutua') || text.includes('banco de tiempo') || text.includes('apoyo mutuo') || text.includes('habilidad') || text.includes('router') || text.includes('paquete')) {
        return {
            reply: 'Eso calza con el Banco de Tiempo: vecinos que ofrecen ayuda no monetaria como herramientas, paquetes, apoyo digital o cuidados. Puedes publicar una oferta o pedir apoyo sin convertir todo en compra externa.',
            navigate: '/convivencia',
            action: 'OPEN_TIME_BANK',
        };
    }

    if (text.includes('compra colectiva') || text.includes('abasto') || text.includes('mayorista') || text.includes('gas') || text.includes('bidon') || text.includes('bidón') || text.includes('limpieza')) {
        return {
            reply: 'Para eso está Abasto Comunitario: campañas de compra colectiva para ahorrar por volumen y coordinar entregas con menos fricción. Te puedo llevar a crear una campaña con proveedor, precio retail, precio comunitario y mínimo de participantes.',
            navigate: '/convivencia',
            action: 'OPEN_COLLECTIVE_PURCHASES',
        };
    }

    if (text.includes('huerto') || text.includes('reciclaje') || text.includes('mascota') || text.includes('proyecto comunitario') || text.includes('adulto mayor') || text.includes('tercera edad')) {
        return {
            reply: 'Eso pertenece a la Plaza Social: proyectos colectivos con impacto visible, participantes, necesidades y señales que CoCo puede detectar para formar grupos útiles. La idea es destacar cooperación, no solo quejas individuales.',
            navigate: '/convivencia',
            action: 'OPEN_COMMUNITY_PROJECTS',
        };
    }

    if (text.includes('agua') || text.includes('consumo') || page.includes('consumo')) {
        return {
            reply: 'Puedo ayudarte con control hídrico: revisa consumo mensual, unidades sin lectura y alertas de fuga. Si quieres actuar ahora, entra al módulo de Control Hídrico y prioriza las unidades con sobreconsumo.',
            navigate: context.role === 'admin' ? '/admin/consumo' : '/resident/consumo',
            action: 'OPEN_WATER_MODULE',
        };
    }

    if (text.includes('reserva') || text.includes('quincho') || text.includes('sala') || page.includes('amenities')) {
        return {
            reply: 'Para reservas, lo más rápido es elegir el espacio, fecha y horario disponible. Si hay conflicto, conviene proponer un segundo horario para no dejar la solicitud abierta.',
            navigate: '/amenities',
            action: 'OPEN_AMENITIES',
        };
    }

    if (text.includes('mantencion') || text.includes('mantenimiento') || text.includes('reparacion') || page.includes('mantenimiento')) {
        return {
            reply: 'Para mantenimiento, registra el caso con ubicación, urgencia, evidencia y responsable. Si hay riesgo a personas o bienes, trátalo como alta prioridad y escala a administración.',
            navigate: context.role === 'admin' ? '/admin/mantenimiento' : '/resident/cases',
            action: 'OPEN_MAINTENANCE',
        };
    }

    if (text.includes('gasto') || text.includes('pago') || text.includes('finanza') || page.includes('finances')) {
        return {
            reply: 'En finanzas puedo ayudarte a revisar deuda, vencimientos, comprobantes y pagos pendientes. Parte por el periodo activo y luego baja al detalle de unidad.',
            navigate: context.role === 'admin' ? '/admin/finanzas' : '/resident/finances',
            action: 'OPEN_FINANCES',
        };
    }

    return {
        reply: `Estoy en modo operativo local, ${context.name || 'vecino/a'}. Puedo orientarte por módulo, crear criterios de priorización y llevarte a la sección correcta mientras el motor IA principal no está disponible.`,
        action: 'LOCAL_FALLBACK',
    };
}

export async function POST(req: NextRequest) {
    const limited = enforceRateLimit(req, 'coco.chat', { limit: 90, windowMs: 60_000 });
    if (limited) return limited;

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
            const fallbackContext = { name: userName, role: safeRole, currentPage, userId, communityId };
            const fallback = process.env.GEMINI_API_KEY
                ? await askGeminiFallback(message, fallbackContext).catch(error => {
                    if (isAiBudgetExceededError(error)) throw error;
                    console.warn('[CoCo Gemini Fallback Error]', error);
                    return buildLocalCoCoFallback(message, fallbackContext);
                })
                : buildLocalCoCoFallback(message, fallbackContext);
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
            if (isAiBudgetExceededError(agentError)) {
                return NextResponse.json(
                    { reply: agentError.reason, action: 'AI_BUDGET_EXCEEDED' },
                    { status: 429 }
                );
            }

            console.error('[CoCo Anthropic Error]', agentError);
            const fallbackContext = { name: userName, role: safeRole, currentPage, userId, communityId };
            const fallback = process.env.GEMINI_API_KEY
                ? await askGeminiFallback(message, fallbackContext).catch(error => {
                    if (isAiBudgetExceededError(error)) throw error;
                    console.warn('[CoCo Gemini Fallback Error]', error);
                    return buildLocalCoCoFallback(message, fallbackContext);
                })
                : buildLocalCoCoFallback(message, fallbackContext);
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
        if (isAiBudgetExceededError(err)) {
            return NextResponse.json(
                { reply: err.reason, action: 'AI_BUDGET_EXCEEDED' },
                { status: 429 }
            );
        }

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
