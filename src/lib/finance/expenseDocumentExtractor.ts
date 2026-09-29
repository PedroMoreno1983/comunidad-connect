import { enforceAiBudget, estimateAiCostCents, estimateTokensFromText, recordAiUsage } from '@/lib/ai/budget';
import { spreadsheetBufferToText } from '@/lib/server/spreadsheetText';
import type { FinanceDocumentDraft } from '@/lib/types';

const PROMPT = `Lee este respaldo de un gasto de comunidad en Chile. Devuelve JSON con
{"label":"","amount":0,"provider":"","category":"other","documentDate":"","documentNumber":"","warnings":[]}.
amount es el total a pagar en pesos chilenos, como entero. category es uno de water,electricity,salaries,maintenance,security,other.
No inventes datos. Si el monto no está claro usa 0. Usa warnings para dudas, ilegibilidad, varias boletas, montos contradictorios o falta de fecha. Nunca supongas que un documento es un pago efectuado.`;

export async function extractExpenseDocument(file: File, context: { userId: string; communityId: string }): Promise<FinanceDocumentDraft> {
    if (file.size > 10 * 1024 * 1024) throw new Error('El archivo supera 10 MB.');
    const extension = file.name.toLowerCase().split('.').pop();
    const bytes = Buffer.from(await file.arrayBuffer());
    let text = '';
    let inlineData: { mimeType: string; data: string } | undefined;
    if (extension === 'pdf') inlineData = { mimeType: 'application/pdf', data: bytes.toString('base64') };
    else if (extension === 'jpg' || extension === 'jpeg' || extension === 'png') {
        inlineData = { mimeType: extension === 'png' ? 'image/png' : 'image/jpeg', data: bytes.toString('base64') };
    } else if (extension === 'docx') {
        const mammoth = await import('mammoth');
        text = (await mammoth.extractRawText({ buffer: bytes })).value;
    } else if (extension === 'xlsx') text = await spreadsheetBufferToText(bytes, { maxRows: 2000 });
    else if (extension === 'txt' || extension === 'csv') text = bytes.toString('utf8');
    else throw new Error('Formato no soportado. Usa PDF, imagen, DOCX, XLSX, TXT o CSV.');
    if (!inlineData && !text.trim()) throw new Error('El documento está vacío.');
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('La extracción automática no está configurada. Puedes registrar el egreso manualmente.');
    const model = process.env.GEMINI_EXTRACT_MODEL || 'gemini-2.5-flash-lite';
    const promptTokens = estimateTokensFromText(PROMPT) + estimateTokensFromText(text) + (inlineData ? 2000 : 0);
    await enforceAiBudget({ communityId: context.communityId, userId: context.userId, role: 'admin',
        module: 'finance.document_extract', provider: 'gemini', model, actionType: 'extraction',
        estimatedPromptTokens: promptTokens, estimatedCompletionTokens: 500 });
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ systemInstruction: { role: 'system', parts: [{ text: PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: text.slice(0, 100_000) || `Archivo ${file.name}` }, ...(inlineData ? [{ inlineData }] : [])] }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
    });
    if (!response.ok) throw new Error(`No se pudo leer el documento (servicio ${response.status}).`);
    const payload = await response.json();
    const output = String(payload?.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const inputTokens = Number(payload?.usageMetadata?.promptTokenCount ?? promptTokens);
    const completionTokens = Number(payload?.usageMetadata?.candidatesTokenCount ?? estimateTokensFromText(output));
    await recordAiUsage({ communityId: context.communityId, userId: context.userId, role: 'admin',
        module: 'finance.document_extract', provider: 'gemini', model, actionType: 'extraction',
        promptTokens: inputTokens, completionTokens, totalTokens: inputTokens + completionTokens,
        estimatedCostCents: estimateAiCostCents({ provider: 'gemini', model, promptTokens: inputTokens, completionTokens }),
        status: 'success', metadata: { fileName: file.name } });
    const allowed = new Set(['water', 'electricity', 'salaries', 'maintenance', 'security', 'other']);
    const rawAmount = parsed.amount;
    const amount = typeof rawAmount === 'number' && Number.isSafeInteger(rawAmount) ? rawAmount
        : typeof rawAmount === 'string' && /^\d+$/.test(rawAmount.trim()) ? Number(rawAmount) : 0;
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((value): value is string => typeof value === 'string').slice(0, 5) : [];
    if (!Number.isFinite(amount) || amount <= 0) warnings.push('Monto no identificado: ingrésalo y compruébalo contra el documento.');
    return { fileName: file.name, label: String(parsed.label ?? '').slice(0, 160),
        amount: amount > 0 && Number.isFinite(amount) ? amount : 0,
        provider: String(parsed.provider ?? '').slice(0, 160), category: allowed.has(String(parsed.category)) ? String(parsed.category) : 'other',
        documentDate: String(parsed.documentDate ?? '').slice(0, 20), documentNumber: String(parsed.documentNumber ?? '').slice(0, 80), warnings };
}
