import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { spreadsheetBufferToText } from '@/lib/server/spreadsheetText';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromText, isAiBudgetExceededError, recordAiUsage } from '@/lib/ai/budget';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
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

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No se encontro un archivo en la solicitud' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = file.name.toLowerCase();

        let extractedText = '';

        if (fileName.endsWith('.pdf')) {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) throw new Error('GEMINI_API_KEY no configurada. Imposible leer PDFs en Vercel.');

            const pdfBase64 = buffer.toString('base64');
            const inlineData = { mimeType: 'application/pdf', data: pdfBase64 };
            const model = 'gemini-2.0-flash';
            const prompt = 'Extrae TODO el texto de este documento de entrenamiento exactamente como esta escrito, sin omitir partes, sin resumir y sin agregar comentarios extras. Solo retorna el contenido puro en texto plano directo, sin usar bloques de codigo Markdown.';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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
                headers: { 'Content-Type': 'application/json' },
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
        } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
            const mammoth = await import('mammoth');
            const result = await mammoth.extractRawText({ buffer });
            extractedText = result.value;
        } else if (fileName.endsWith('.xlsx')) {
            extractedText = await spreadsheetBufferToText(buffer, { maxRows: 500 });
        } else if (fileName.endsWith('.xls')) {
            return NextResponse.json({
                error: 'Excel .xls antiguo no soportado por seguridad. Guarda el archivo como .xlsx o CSV y vuelve a subirlo.',
            }, { status: 400 });
        } else if (fileName.endsWith('.csv')) {
            extractedText = buffer.toString('utf-8');
        } else if (fileName.endsWith('.txt')) {
            extractedText = buffer.toString('utf-8');
        } else {
            return NextResponse.json({
                error: 'Formato de archivo no soportado. Por favor sube PDF, Word, Excel, CSV o TXT.',
            }, { status: 400 });
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

        console.warn('Error parsing document:', error);
        return NextResponse.json({
            error: 'Ocurrio un error al procesar el archivo. ' + (error instanceof Error ? error.message : ''),
        }, { status: 500 });
    }
}
