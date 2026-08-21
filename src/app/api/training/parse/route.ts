import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { spreadsheetBufferToText } from '@/lib/server/spreadsheetText';
import { verifyUploadSignature } from '@/lib/server/fileSignature';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromText, isAiBudgetExceededError, recordAiUsage } from '@/lib/ai/budget';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_TRAINING_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
    const limited = await enforceDistributedRateLimit(request, 'training.parse', { limit: 10, windowMs: 60_000 });
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

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No se encontro un archivo en la solicitud' }, { status: 400 });
        }
        if (file.size > MAX_TRAINING_FILE_BYTES) {
            return NextResponse.json({ error: 'Archivo demasiado grande. Maximo 10 MB.' }, { status: 413 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // El parser se elegía sólo por la extensión del nombre, que la manda
        // quien sube el archivo. Se comprueba la firma real antes de entregarle
        // el contenido a Gemini, a mammoth o a exceljs.
        const signature = verifyUploadSignature(file.name, buffer);
        if (!signature.ok) {
            return NextResponse.json({ error: signature.reason }, { status: 400 });
        }
        const { extension } = signature;

        let extractedText = '';

        if (extension === 'pdf') {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) throw new Error('GEMINI_API_KEY no configurada. Imposible leer PDFs en Vercel.');

            const pdfBase64 = buffer.toString('base64');
            const inlineData = { mimeType: 'application/pdf', data: pdfBase64 };
            const model = 'gemini-2.0-flash';
            const prompt = 'Extrae TODO el texto de este documento de entrenamiento exactamente como esta escrito, sin omitir partes, sin resumir y sin agregar comentarios extras. Solo retorna el contenido puro en texto plano directo, sin usar bloques de codigo Markdown.';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
            const body = {
                contents: [{
                    role: 'user',
                    parts: [
                        { text: prompt },
                        { inlineData },
                    ],
                }],
                generationConfig: { temperature: 0.1 },
            };

            const promptTokens = estimateTokensFromText(prompt) + 2000;
            await enforceAiBudget({
                communityId: profile?.community_id,
                userId: user.id,
                role: profile?.role,
                module: 'training.parse_pdf',
                provider: 'gemini',
                model,
                actionType: 'extraction',
                estimatedPromptTokens: promptTokens,
                estimatedCompletionTokens: 6000,
            });

            const startedAt = Date.now();
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errBody = await response.json().catch(() => ({}));
                throw new Error(`Error Gemini API (${response.status}): ${errBody?.error?.message || response.statusText}`);
            }

            const data = await response.json();
            extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const actualPromptTokens = data?.usageMetadata?.promptTokenCount ?? promptTokens;
            const completionTokens = data?.usageMetadata?.candidatesTokenCount ?? estimateTokensFromText(extractedText);

            await recordAiUsage({
                communityId: profile?.community_id,
                userId: user.id,
                role: profile?.role,
                module: 'training.parse_pdf',
                provider: 'gemini',
                model,
                actionType: 'extraction',
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
                metadata: { latencyMs: Date.now() - startedAt },
            });
        } else if (extension === 'docx') {
            const mammoth = await import('mammoth');
            const result = await mammoth.extractRawText({ buffer });
            extractedText = result.value;
        } else if (extension === 'xlsx') {
            extractedText = await spreadsheetBufferToText(buffer, { maxRows: 500 });
        } else {
            extractedText = buffer.toString('utf-8');
        }

        const cleanedText = extractedText
            .replace(/\u0000/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        if (!cleanedText) {
            return NextResponse.json({ error: 'El documento parece estar vacio o contenia solo imagenes.' }, { status: 400 });
        }

        return NextResponse.json({ text: cleanedText });
    } catch (error: unknown) {
        if (isAiBudgetExceededError(error)) {
            return NextResponse.json({ error: error.reason }, { status: 429 });
        }

        return apiErrorResponse(request, '/api/training/parse', error, {
            publicMessage: 'Ocurrio un error al procesar el archivo.',
        });
    }
}
