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
import { buildStructuredTrainingFallback, ensureInteractiveTrainingCourse } from '@/lib/training/courseContent';

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

    const fallback = () => NextResponse.json({
        slides: buildStructuredTrainingFallback(text, audience),
        warning: 'CoCo preparo una version estructurada localmente. Revisala antes de publicar.',
    });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return fallback();

    const systemPrompt = `Eres CoCo, diseñador instruccional para condominios chilenos.
Transforma el texto fuente en un curso operativo profesional para ${audienceLabel(audience)}.

Reglas obligatorias:
1. Conserva reglas, cifras y procedimientos del texto. No inventes obligaciones legales.
2. Crea entre 6 y 10 secciones con 2 a 5 bullets observables y accionables.
3. Distingue las atribuciones de administracion y conserjeria.
4. Incluye al menos dos actividades: una pregunta knowledge_check o scenario, y una checklist final.
5. Para knowledge_check y scenario entrega 3 o 4 options, correctIndex numerico y explanation util.
6. Para checklist entrega entre 3 y 6 items verificables.
7. Usa solo estos temas: copper, sage, ink o amber.
8. Las notas explican que hacer, quien responde, que registrar y cuando escalar.

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
            estimatedCompletionTokens: 3_000,
        });

        const startedAt = Date.now();
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            signal: AbortSignal.timeout(20_000),
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
                generationConfig: {
                    temperature: 0.25,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                eyebrow: { type: 'STRING' },
                                title: { type: 'STRING' },
                                bullets: { type: 'ARRAY', items: { type: 'STRING' } },
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
                            required: ['id', 'title', 'bullets', 'visual_theme', 'notes'],
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

        return NextResponse.json({ slides });
    } catch (error: unknown) {
        if (isAiBudgetExceededError(error)) {
            return NextResponse.json({ error: error.reason }, { status: 429 });
        }
        console.error('[training/generate-slides] AI generation failed; using structured fallback:', error);
        return fallback();
    }
}
