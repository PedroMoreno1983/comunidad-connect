import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromText, isAiBudgetExceededError, recordAiUsage } from '@/lib/ai/budget';
import { enforceRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';
// Vercel Hobby allows up to 60s maxDuration for Edge/Serverless functions
export const maxDuration = 60;

export async function POST(request: Request) {
    const limited = enforceRateLimit(request, 'training.generate-slides', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const cookieStore = await cookies();
        const supabaseUser = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
        );
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { data: profile } = await getSupabaseAdmin()
            .from('profiles')
            .select('id, role, community_id')
            .eq('id', user.id)
            .maybeSingle();
        if (profile?.role !== 'admin' || !profile.community_id) {
            return NextResponse.json({ error: 'Solo administracion puede generar cursos.' }, { status: 403 });
        }

        const bodyReq = await request.json();
        const { text } = bodyReq;
        const audience = bodyReq.targetAudience === 'admin' ? 'administradores de condominios' : bodyReq.targetAudience === 'concierge' ? 'conserjes' : 'administradores y conserjes';

        if (!text) {
            return NextResponse.json({ error: 'Falta el contenido de texto para generar el curso.' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY no configurada.");

        // Gemini 2.5 Flash Endpoint
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
        
        const systemPrompt = `Eres un Experto Diseñador Instruccional e IA Educativa ("CoCo").
Tu tarea es transformar el siguiente documento o texto en un curso operativo de alta calidad para ${audience}.
Reglas:
1. Conserva fielmente reglas, cifras y procedimientos del texto fuente; no inventes obligaciones legales ni protocolos.
2. Produce entre 6 y 12 diapositivas: propósito y objetivos, conceptos, procedimiento paso a paso, casos reales del turno, errores frecuentes, escalamiento y cierre evaluativo.
3. Cada diapositiva debe tener un título corto y 2 a 5 bullets observables y accionables.
4. Las notas deben explicar qué hacer, quién responde, qué registrar y cuándo escalar. Incluye preguntas de comprobación y retroalimentación, no relleno motivacional.
5. Distingue siempre las responsabilidades de administración y conserjería. No enseñes a un rol a ejecutar acciones para las que no está autorizado.
6. Incluye al menos un escenario de decisión y una lista final de verificación aplicable dentro de Convive Connect.
7. Genera un tema visual sobrio (blue-glass, sunset-orange, tech-abstract o nature-green).
Devuelve los resultados estrictamente siguiendo el JSON schema provisto.

Texto fuente:
${text}
`;

        const bodyParts = {
            contents: [{
                role: "user", 
                parts: [{ text: systemPrompt }]
            }],
            generationConfig: {
                temperature: 0.3,
                responseMimeType: "application/json",
                responseSchema: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            id: { type: "STRING" },
                            title: { type: "STRING" },
                            bullets: { 
                                type: "ARRAY", 
                                items: { type: "STRING" } 
                            },
                            visual_theme: { type: "STRING" },
                            notes: { type: "STRING" }
                        },
                        required: ["id", "title", "bullets", "visual_theme", "notes"]
                    }
                }
            }
        };

        const model = 'gemini-2.5-flash';
        const promptTokens = estimateTokensFromText(systemPrompt);
        await enforceAiBudget({
            communityId: profile?.community_id,
            userId: user.id,
            role: profile?.role,
            module: 'training.generate_slides',
            provider: 'gemini',
            model,
            actionType: 'course',
            estimatedPromptTokens: promptTokens,
            estimatedCompletionTokens: 2500,
        });

        const startedAt = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify(bodyParts)
        });

        if (!response.ok) {
            throw new Error(`Error en IA Gemini: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        const rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!rawResponse) {
             throw new Error("No se pudo obtener la respuesta estructurada de la IA.");
        }

        // Parseamos para comprobar seguridad (el modelo ya devuelve un JSON válido gracias a responseSchema)
        const slides = JSON.parse(rawResponse);
        const actualPromptTokens = data?.usageMetadata?.promptTokenCount ?? promptTokens;
        const completionTokens = data?.usageMetadata?.candidatesTokenCount ?? estimateTokensFromText(rawResponse);

        await recordAiUsage({
            communityId: profile?.community_id,
            userId: user.id,
            role: profile?.role,
            module: 'training.generate_slides',
            provider: 'gemini',
            model,
            actionType: 'course',
            promptTokens: actualPromptTokens,
            completionTokens,
            totalTokens: data?.usageMetadata?.totalTokenCount ?? actualPromptTokens + completionTokens,
            estimatedCostCents: estimateAiCostCents({
                provider: 'gemini',
                model,
                promptTokens: actualPromptTokens,
                completionTokens,
            }),
            status: 'success',
            metadata: { latencyMs: Date.now() - startedAt, slides: Array.isArray(slides) ? slides.length : 0 },
        });

        return NextResponse.json({ slides });

    } catch (error: unknown) {
        if (isAiBudgetExceededError(error)) {
            return NextResponse.json({ error: error.reason }, { status: 429 });
        }

        console.error('Error generating slides:', error);
        return NextResponse.json({ 
            error: 'Ocurrió un error al diseñar la presentación.'
        }, { status: 500 });
    }
}
