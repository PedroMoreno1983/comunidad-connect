import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import {
    enforceAiBudget,
    estimateAiCostCents,
    estimateTokensFromText,
    isAiBudgetExceededError,
    recordAiUsage,
} from '@/lib/ai/budget';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { buildStructuredTrainingFallback, ensureInteractiveTrainingCourse, trainingQualityReport } from '@/lib/training/courseContent';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type TrainingAudience = 'admin' | 'concierge' | 'all';

function audienceFrom(value: unknown): TrainingAudience {
    return value === 'admin' || value === 'concierge' ? value : 'all';
}

function audienceLabel(audience: TrainingAudience) {
    if (audience === 'admin') return 'administradores de condominios';
    if (audience === 'concierge') return 'conserjes';
    return 'administradores y conserjes';
}

export async function POST(request: Request) {
    const limited = enforceRateLimit(request, 'training.generate-slides', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;

    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data: profile } = await getSupabaseAdmin()
        .from('profiles')
        .select('id, role, community_id')
        .eq('id', user.id)
        .maybeSingle();
    if (profile?.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Solo administracion puede generar cursos.' }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 80_000) : '';
    const audience = audienceFrom(body.targetAudience);
    if (text.length < 80) {
        return NextResponse.json({ error: 'Agrega al menos 80 caracteres de contenido fuente para diseñar el curso.' }, { status: 400 });
    }

    const fallback = () => {
        const slides = buildStructuredTrainingFallback(text, audience);
        return NextResponse.json({
            slides,
            quality: trainingQualityReport(slides),
            warning: 'CoCo preparó una versión estructurada localmente. Revísala antes de publicar.',
        });
    };
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return fallback();

    const systemPrompt = `Eres CoCo, diseñador instruccional para condominios chilenos.
Transforma el texto fuente en un curso operativo profesional para ${audienceLabel(audience)}.

Reglas editoriales obligatorias:
1. Conserva reglas, cifras y procedimientos del texto. No inventes obligaciones legales.
2. Crea entre 6 y 10 secciones con 2 a 5 bullets observables y accionables. El lead resume la sección y no repite ningún bullet. Las notes son solo el guion de la tutora: no las copies en el lead ni en los bullets.
3. Distingue las atribuciones de administracion y conserjeria.
4. Incluye exactamente el recorrido de práctica completo: knowledge_check, scenario y checklist final.
5. Para knowledge_check y scenario entrega 4 options. Las incorrectas son errores frecuentes del turno, como omitir el registro, resolver fuera de rol, prometer un resultado o difundir un dato. No uses opciones absurdas. correctIndex numérico y una explanation que enseñe el criterio.
6. Para checklist entrega entre 3 y 6 items verificables.
7. Usa layouts variados de esta lista: opening, framework, process, comparison, scenario, checklist, summary. La primera sección usa opening y la última checklist.
8. Incluye role_cards en al menos una sección: dos tarjetas con role, responsibility y action para Administración y Conserjería.
9. Usa solo estos temas visuales: copper, sage, ink o amber.
10. Las notes forman el guion de la tutora: explican qué hacer, quién responde, qué registrar y cuándo escalar.
11. Evita diapositivas genéricas: cada una debe contener una decisión, un procedimiento o un criterio transferible al trabajo.

Texto fuente:
${text}`;
    const model = 'gemini-2.5-flash';
    const promptTokens = estimateTokensFromText(systemPrompt);

    try {
        await enforceAiBudget({
            communityId: profile.community_id,
            userId: user.id,
            role: profile.role,
            module: 'training.generate_slides',
            provider: 'gemini',
            model,
            actionType: 'course',
            estimatedPromptTokens: promptTokens,
            estimatedCompletionTokens: 6_000,
        });

        const startedAt = Date.now();
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            signal: AbortSignal.timeout(45_000),
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
                generationConfig: {
                    temperature: 0.25,
                    maxOutputTokens: 8192,
                    thinkingConfig: { thinkingBudget: 0 },
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                eyebrow: { type: 'STRING' },
                                title: { type: 'STRING' },
                                lead: { type: 'STRING' },
                                layout: { type: 'STRING' },
                                bullets: { type: 'ARRAY', items: { type: 'STRING' } },
                                role_cards: {
                                    type: 'ARRAY',
                                    items: {
                                        type: 'OBJECT',
                                        properties: {
                                            role: { type: 'STRING' },
                                            responsibility: { type: 'STRING' },
                                            action: { type: 'STRING' },
                                        },
                                        required: ['role', 'responsibility', 'action'],
                                    },
                                },
                                source_note: { type: 'STRING' },
                                visual_theme: { type: 'STRING' },
                                notes: { type: 'STRING' },
                                activity: {
                                    type: 'OBJECT',
                                    properties: {
                                        type: { type: 'STRING' },
                                        prompt: { type: 'STRING' },
                                        options: { type: 'ARRAY', items: { type: 'STRING' } },
                                        correctIndex: { type: 'INTEGER' },
                                        explanation: { type: 'STRING' },
                                        items: { type: 'ARRAY', items: { type: 'STRING' } },
                                    },
                                },
                            },
                            required: ['id', 'title', 'lead', 'layout', 'bullets', 'visual_theme', 'notes'],
                        },
                    },
                },
            }),
        });
        if (!response.ok) throw new Error(`Gemini respondio ${response.status}`);

        const data = await response.json() as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
        };
        const rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawResponse) throw new Error('Gemini no devolvio contenido estructurado');
        const generated = JSON.parse(rawResponse) as unknown;
        const slides = ensureInteractiveTrainingCourse(generated, text, audience);
        const actualPromptTokens = data.usageMetadata?.promptTokenCount ?? promptTokens;
        const completionTokens = data.usageMetadata?.candidatesTokenCount ?? estimateTokensFromText(rawResponse);

        await recordAiUsage({
            communityId: profile.community_id,
            userId: user.id,
            role: profile.role,
            module: 'training.generate_slides',
            provider: 'gemini',
            model,
            actionType: 'course',
            promptTokens: actualPromptTokens,
            completionTokens,
            totalTokens: data.usageMetadata?.totalTokenCount ?? actualPromptTokens + completionTokens,
            estimatedCostCents: estimateAiCostCents({ provider: 'gemini', model, promptTokens: actualPromptTokens, completionTokens }),
            status: 'success',
            metadata: { latencyMs: Date.now() - startedAt, slides: slides.length },
        });

        return NextResponse.json({ slides, quality: trainingQualityReport(slides) });
    } catch (error: unknown) {
        if (isAiBudgetExceededError(error)) {
            return NextResponse.json({ error: error.reason }, { status: 429 });
        }
        console.error('[training/generate-slides] AI generation failed; using structured fallback:', error);
        return fallback();
    }
}
