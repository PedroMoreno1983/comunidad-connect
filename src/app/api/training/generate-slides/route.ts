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
import { ensureInteractiveTrainingCourse, normalizeTrainingSlides, trainingQualityReport, trainingSourceEvidence } from '@/lib/training/courseContent';

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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'El diseño automático no está disponible. Conservamos tu fuente; vuelve a intentarlo cuando se restablezca el servicio.' }, { status: 503 });

    const systemPrompt = `Eres CoCo, diseñador instruccional para condominios chilenos.
Transforma el texto fuente en un curso operativo profesional para ${audienceLabel(audience)}.

Reglas editoriales obligatorias:
1. Conserva reglas, cifras y procedimientos del texto. No inventes obligaciones legales.
2. Crea exactamente 8 secciones con 2 a 5 bullets observables y accionables. El lead resume la sección y no repite ningún bullet. Las notes son solo el guion de la tutora: no las copies en el lead ni en los bullets.
3. Distingue las atribuciones de administracion y conserjeria.
4. Incluye exactamente el recorrido de práctica completo: knowledge_check, scenario y checklist final.
   La sección 2 lleva knowledge_check, la sección 6 lleva scenario y la sección 8 lleva checklist como última sección. Las demás no llevan activity.
5. Para knowledge_check y scenario entrega 4 options. Las incorrectas son errores frecuentes del turno, como omitir el registro, resolver fuera de rol, prometer un resultado o difundir un dato. No uses opciones absurdas. correctIndex numérico y una explanation que enseñe el criterio.
6. Para checklist entrega entre 3 y 6 items verificables.
7. Usa layouts variados de esta lista: opening, framework, process, comparison, scenario, checklist, summary. La primera sección usa opening y la última checklist.
8. Incluye role_cards en al menos una sección: dos tarjetas con role, responsibility y action para Administración y Conserjería.
9. Usa solo estos temas visuales: copper, sage, ink o amber.
10. Las notes forman el guion de la tutora: explican qué hacer, quién responde, qué registrar y cuándo escalar.
11. Evita diapositivas genéricas: cada una debe contener una decisión, un procedimiento o un criterio transferible al trabajo.
12. Cada sección lleva source_note: copia literalmente una frase de 20 a 180 caracteres del texto fuente que respalde esa sección. Las tres secciones con actividad deben tener una cita. No atribuyas al documento procedimientos, cifras o deberes que no contiene.

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
        const generationConfig = {
                    temperature: 0.25,
                    maxOutputTokens: 12000,
                    thinkingConfig: { thinkingBudget: 0 },
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'ARRAY',
                        minItems: 8,
                        maxItems: 8,
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                eyebrow: { type: 'STRING' },
                                title: { type: 'STRING' },
                                lead: { type: 'STRING' },
                                layout: { type: 'STRING' },
                                bullets: { type: 'ARRAY', minItems: 2, maxItems: 5, items: { type: 'STRING' } },
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
                                        type: { type: 'STRING', enum: ['knowledge_check', 'scenario', 'checklist'] },
                                        prompt: { type: 'STRING' },
                                        options: { type: 'ARRAY', items: { type: 'STRING' } },
                                        correctIndex: { type: 'INTEGER' },
                                        explanation: { type: 'STRING' },
                                        items: { type: 'ARRAY', items: { type: 'STRING' } },
                                    },
                                },
                            },
                            required: ['id', 'title', 'lead', 'layout', 'bullets', 'source_note', 'visual_theme', 'notes'],
                        },
                    },
                };
        const generate = (prompt: string) => fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            signal: AbortSignal.timeout(35_000),
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
        });
        let response = await generate(systemPrompt);
        if (!response.ok) throw new Error(`Gemini respondio ${response.status}`);

        type GeminiResponse = {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
        };
        let data = await response.json() as GeminiResponse;
        let rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawResponse) throw new Error('Gemini no devolvio contenido estructurado');
        let generated = JSON.parse(rawResponse) as unknown;
        let candidateSlides = normalizeTrainingSlides(generated);
        let candidateQuality = trainingQualityReport(candidateSlides);
        let candidateEvidence = trainingSourceEvidence(candidateSlides, text);
        let usedPromptTokens = data.usageMetadata?.promptTokenCount ?? promptTokens;
        let usedCompletionTokens = data.usageMetadata?.candidatesTokenCount ?? estimateTokensFromText(rawResponse);
        if (!candidateQuality.publishable || !candidateEvidence.sufficient) {
            const failedChecks = candidateQuality.checks.filter(check => !check.passed).map(check => check.id);
            const repairPrompt = `${systemPrompt}\n\nEl primer borrador no pasó la validación. Corrígelo completo y devuelve solamente el arreglo JSON. Debe tener exactamente 8 secciones; knowledge_check en la segunda, scenario en la sexta y checklist con actividad en la octava; mantener al menos cuatro layouts; incluir dos tarjetas de rol; y citar literalmente la fuente en cada sección, sobre todo las actividades. Fallaron: ${failedChecks.join(', ') || 'citas del material'}. Secciones sin cita válida: ${candidateEvidence.unsupportedIds.join(', ') || 'ninguna'}. Borrador que debes corregir:\n${rawResponse}`;
            response = await generate(repairPrompt);
            if (!response.ok) throw new Error(`Gemini respondio ${response.status} al corregir el curso`);
            data = await response.json() as GeminiResponse;
            rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawResponse) throw new Error('Gemini no devolvio el curso corregido');
            usedPromptTokens += data.usageMetadata?.promptTokenCount ?? estimateTokensFromText(repairPrompt);
            usedCompletionTokens += data.usageMetadata?.candidatesTokenCount ?? estimateTokensFromText(rawResponse);
            generated = JSON.parse(rawResponse) as unknown;
            candidateSlides = normalizeTrainingSlides(generated);
            candidateQuality = trainingQualityReport(candidateSlides);
            candidateEvidence = trainingSourceEvidence(candidateSlides, text);
            if (!candidateQuality.publishable || !candidateEvidence.sufficient) {
                console.warn('[training/generate-slides] Rejected repaired draft:', {
                    sections: candidateSlides.length,
                    failedChecks: candidateQuality.checks.filter(check => !check.passed).map(check => check.id),
                    activityTypes: candidateSlides.map(slide => slide.activity?.type || null),
                    supportedSections: candidateEvidence.supportedCount,
                    unsupportedSectionIds: candidateEvidence.unsupportedIds,
                });
            }
        }
        const slides = ensureInteractiveTrainingCourse(generated, text);

        await recordAiUsage({
            communityId: profile.community_id,
            userId: user.id,
            role: profile.role,
            module: 'training.generate_slides',
            provider: 'gemini',
            model,
            actionType: 'course',
            promptTokens: usedPromptTokens,
            completionTokens: usedCompletionTokens,
            totalTokens: usedPromptTokens + usedCompletionTokens,
            estimatedCostCents: estimateAiCostCents({ provider: 'gemini', model, promptTokens: usedPromptTokens, completionTokens: usedCompletionTokens }),
            status: 'success',
            metadata: { latencyMs: Date.now() - startedAt, slides: slides.length },
        });

        return NextResponse.json({ slides, quality: trainingQualityReport(slides) });
    } catch (error: unknown) {
        if (isAiBudgetExceededError(error)) {
            return NextResponse.json({ error: error.reason }, { status: 429 });
        }
        console.error('[training/generate-slides] AI generation failed:', error);
        return NextResponse.json({ error: 'No se pudo generar un curso fiel y completo desde la fuente. Revisa el documento y vuelve a intentarlo; no se publicó contenido genérico.' }, { status: 502 });
    }
}
