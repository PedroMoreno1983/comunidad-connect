import { createHash } from 'node:crypto';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromText, recordAiUsage } from '@/lib/ai/budget';
import { spreadsheetBufferToText } from '@/lib/server/spreadsheetText';

export const MAX_ONBOARDING_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ONBOARDING_BATCH_BYTES = 50 * 1024 * 1024;
export const MAX_ONBOARDING_BATCH_FILES = 20;

export type ExtractedResident = { name: string; unit_id: string; email: string; phone: string };
export type OnboardingAssessment = {
    totalRows: number;
    validRows: number;
    missingNameRows: number;
    missingUnitRows: number;
    missingContactRows: number;
    duplicateUnits: string[];
    confidenceScore: number;
    warnings: string[];
};

type ExtractionContext = { userId: string; communityId?: string | null; role?: string | null };

const PROMPT = `Eres un extractor de nominas de residentes. Extrae exclusivamente personas residentes, dueños o arrendatarios.
Devuelve solo un array JSON con objetos {"name":"", "unit_id":"", "email":"", "phone":""}.
No inventes correos, telefonos, nombres ni unidades. Si un dato no aparece, usa string vacio. Si no hay personas, devuelve [].`;

function clean(value: unknown) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\s+/g, ' ').trim() : '';
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function residentDedupeKey(row: ExtractedResident) {
    const email = row.email.trim().toLowerCase();
    if (email) return `email:${email}`;
    return `unit-name:${row.unit_id.trim().toLowerCase()}|${row.name.trim().toLowerCase()}`;
}

export function assessResidents(rows: ExtractedResident[]): OnboardingAssessment {
    const totalRows = rows.length;
    const validRows = rows.filter(row => row.name && row.unit_id).length;
    const missingNameRows = rows.filter(row => !row.name).length;
    const missingUnitRows = rows.filter(row => !row.unit_id).length;
    const missingContactRows = rows.filter(row => !row.email && !row.phone).length;
    const counts = new Map<string, number>();
    for (const row of rows) {
        const unit = row.unit_id.trim().toLowerCase();
        if (unit) counts.set(unit, (counts.get(unit) || 0) + 1);
    }
    const duplicateUnits = [...counts.entries()].filter(([, count]) => count > 1).map(([unit]) => unit).slice(0, 20);
    const warnings: string[] = [];
    if (missingNameRows) warnings.push(`${missingNameRows} fila(s) sin nombre.`);
    if (missingUnitRows) warnings.push(`${missingUnitRows} fila(s) sin unidad.`);
    if (missingContactRows) warnings.push(`${missingContactRows} fila(s) sin email ni telefono.`);
    if (duplicateUnits.length) warnings.push(`${duplicateUnits.length} unidad(es) aparecen repetidas.`);
    const completeness = totalRows ? validRows / totalRows : 0;
    const contacts = totalRows ? (totalRows - missingContactRows) / totalRows : 0;
    const duplicatePenalty = totalRows ? Math.min(0.2, duplicateUnits.length / totalRows) : 0;
    return {
        totalRows, validRows, missingNameRows, missingUnitRows, missingContactRows, duplicateUnits, warnings,
        confidenceScore: Math.max(0, Math.min(100, Math.round(((completeness * 0.75) + (contacts * 0.25) - duplicatePenalty) * 100))),
    };
}

async function callGemini(text: string, inlineData: { mimeType: string; data: string } | undefined, context: ExtractionContext) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY no configurada.');
    const model = process.env.GEMINI_EXTRACT_MODEL || 'gemini-2.5-flash-lite';
    const promptTokens = estimateTokensFromText(PROMPT) + estimateTokensFromText(text) + (inlineData ? 2000 : 0);
    await enforceAiBudget({
        communityId: context.communityId, userId: context.userId, role: context.role,
        module: 'onboarding.extract', provider: 'gemini', model, actionType: 'extraction',
        estimatedPromptTokens: promptTokens, estimatedCompletionTokens: 3000,
    });
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
        { text: 'Extrae la nomina completa, incluso desde tablas, escaneos o texto desordenado.' },
    ];
    if (text) parts.push({ text });
    if (inlineData) parts.push({ inlineData });
    const startedAt = Date.now();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { role: 'system', parts: [{ text: PROMPT }] },
            contents: [{ role: 'user', parts }],
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
    });
    if (!response.ok) throw new Error(`Gemini API Error: ${response.status}`);
    const data = await response.json();
    const output = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]');
    const inputTokens = data?.usageMetadata?.promptTokenCount ?? promptTokens;
    const outputTokens = data?.usageMetadata?.candidatesTokenCount ?? estimateTokensFromText(output);
    await recordAiUsage({
        communityId: context.communityId, userId: context.userId, role: context.role,
        module: 'onboarding.extract', provider: 'gemini', model, actionType: 'extraction',
        promptTokens: inputTokens, completionTokens: outputTokens, totalTokens: inputTokens + outputTokens,
        estimatedCostCents: estimateAiCostCents({ provider: 'gemini', model, promptTokens: inputTokens, completionTokens: outputTokens }),
        status: 'success', metadata: { latencyMs: Date.now() - startedAt, hasInlineData: Boolean(inlineData) },
    });
    return output;
}

export async function extractResidentsFromBuffer(fileName: string, mimeType: string, buffer: Buffer, context: ExtractionContext) {
    if (buffer.byteLength > MAX_ONBOARDING_FILE_BYTES) throw new Error('Archivo demasiado grande. Maximo 10 MB por archivo.');
    const lower = fileName.toLowerCase();
    let text = '';
    let inlineData: { mimeType: string; data: string } | undefined;
    if (lower.endsWith('.pdf')) inlineData = { mimeType: 'application/pdf', data: buffer.toString('base64') };
    else if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
        const mammoth = await import('mammoth');
        text = (await mammoth.extractRawText({ buffer })).value;
    } else if (lower.endsWith('.xlsx')) text = await spreadsheetBufferToText(buffer, { maxRows: 10_000 });
    else if (lower.endsWith('.xls')) inlineData = { mimeType: 'application/vnd.ms-excel', data: buffer.toString('base64') };
    else if (lower.endsWith('.txt') || lower.endsWith('.csv')) text = buffer.toString('utf-8');
    else throw new Error('Formato no soportado (.pdf, .doc, .docx, .xls, .xlsx, .txt, .csv).');
    if (!text.trim() && !inlineData) throw new Error('El documento esta vacio o no se puede procesar.');
    const output = await callGemini(text.slice(0, 400_000), inlineData, context);
    let parsed: unknown;
    try { parsed = JSON.parse(output); } catch { throw new Error('La IA no devolvio datos estructurados validos.'); }
    const values = Array.isArray(parsed) ? parsed : [parsed];
    const rows = values.map(value => {
        const row = record(value);
        const unit = clean(row.unit_id ?? row.unit ?? row.department_number);
        return {
            name: clean(row.name),
            unit_id: /^desconocid[oa]$/i.test(unit) ? '' : unit,
            email: clean(row.email).toLowerCase(),
            phone: clean(row.phone ?? row.phone_number),
        };
    }).filter(row => row.name || row.unit_id || row.email || row.phone);
    return {
        rows,
        assessment: assessResidents(rows),
        checksum: createHash('sha256').update(buffer).digest('hex'),
        mimeType: mimeType || 'application/octet-stream',
    };
}
