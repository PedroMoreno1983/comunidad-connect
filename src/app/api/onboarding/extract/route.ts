import { NextResponse } from 'next/server';
import { spreadsheetBufferToText } from '@/lib/server/spreadsheetText';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromText, isAiBudgetExceededError, recordAiUsage } from '@/lib/ai/budget';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Extender el Timeout de Vercel a 60 segundos (Máximo plan Hobby) para procesamiento IA prolongado.

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type ExtractedResident = {
    name: string;
    unit_id: string;
    email: string;
    phone: string;
};

type OnboardingAssessment = {
    totalRows: number;
    validRows: number;
    missingNameRows: number;
    missingUnitRows: number;
    missingContactRows: number;
    duplicateUnits: string[];
    confidenceScore: number;
    warnings: string[];
};

const GEMINI_JSON_PROMPT = `
Eres un Extractor de Datos experto.
Tu objetivo es analizar un documento sin formato (sucio, listas desordenadas, actas, reglamentos, excels en texto plano) y extraer EXCLUSIVAMENTE a las personas (residentes, dueños, arrendatarios) mencionadas en él.

Debes devolver un JSON estrictamente válido que sea un Array de objetos. Cada objeto debe tener esta estructura exacta:
{
  "name": "Nombre completo de la persona",
  "unit_id": "Número de departamento o unidad (ej: '101', 'A5', o 'Desconocido' si no se menciona)",
  "email": "Correo electrónico (o un string vacío '' si no aparece en el texto — NUNCA inventes ni deduzcas emails)",
  "phone": "Teléfono (o un string vacío '' si no hay)"
}

REGLAS ABSOLUTAS:
1. Tu respuesta DEBE ser un Array JSON puro. Nada de texto antes ni después.
2. NO incluyas bloques de código markdown \`\`\`json. Solo envía el texto plano que pueda ser parseado por JSON.parse() directamente.
3. Si el documento es masivo, extrae la lista completa sin resumir.
4. Si el documento no tiene personas, devuelve un array vacío [].
`;

async function callGeminiExtractor(
    apiKey: string,
    text: string,
    inlineData: { mimeType: string, data: string } | undefined,
    context: { userId: string; communityId?: string | null; role?: string | null }
) {
    // Usamos un ID estable de Gemini; los alias "-latest" pueden saturarse o cambiar.
    const model = process.env.GEMINI_EXTRACT_MODEL || "gemini-2.5-flash-lite";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Configurar Gemini para responder en JSON estricto
    const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [{ text: "Extrae a todos los residentes de este archivo. Si el archivo incluye imágenes, escaneos o texto sucio, léelo cuidadosamente e ignora el ruido.\n\n" }];

    if (text) {
        parts.push({ text: text });
    }

    if (inlineData) {
        parts.push({ inlineData });
    }

    const body = {
        systemInstruction: {
            role: "system",
            parts: [{ text: GEMINI_JSON_PROMPT }]
        },
        contents: [
            { role: "user", parts }
        ],
        generationConfig: {
            temperature: 0.1, // Baja temperatura para precisión analítica
            responseMimeType: "application/json",
        },
    };

    const promptTokens = estimateTokensFromText(GEMINI_JSON_PROMPT) + estimateTokensFromText(text) + (inlineData ? 2000 : 0);
    await enforceAiBudget({
        communityId: context.communityId,
        userId: context.userId,
        role: context.role,
        module: 'onboarding.extract',
        provider: 'gemini',
        model,
        actionType: 'extraction',
        estimatedPromptTokens: promptTokens,
        estimatedCompletionTokens: 2500,
    });

    const startedAt = Date.now();
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        throw new Error(`Gemini API Error: ${res.statusText}`);
    }

    const data = await res.json();
    const output = data.candidates[0].content.parts[0].text;
    const actualPromptTokens = data?.usageMetadata?.promptTokenCount ?? promptTokens;
    const completionTokens = data?.usageMetadata?.candidatesTokenCount ?? estimateTokensFromText(output);

    await recordAiUsage({
        communityId: context.communityId,
        userId: context.userId,
        role: context.role,
        module: 'onboarding.extract',
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
        metadata: { latencyMs: Date.now() - startedAt, hasInlineData: Boolean(inlineData) },
    });

    return output;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function cleanText(value: unknown) {
    return typeof value === 'string' || typeof value === 'number'
        ? String(value).replace(/\s+/g, ' ').trim()
        : '';
}

function cleanUnit(value: unknown) {
    const text = cleanText(value);
    return /^desconocid[oa]$/i.test(text) ? '' : text;
}

function normalizeExtractedRows(raw: unknown): ExtractedResident[] {
    const rows = Array.isArray(raw) ? raw : [raw];

    return rows
        .map((row) => {
            const record = asRecord(row);
            return {
                name: cleanText(record?.name),
                unit_id: cleanUnit(record?.unit_id ?? record?.unit ?? record?.department_number),
                email: cleanText(record?.email).toLowerCase(),
                phone: cleanText(record?.phone ?? record?.phone_number),
            };
        })
        .filter((row) => row.name || row.unit_id || row.email || row.phone);
}

function buildAssessment(rows: ExtractedResident[]): OnboardingAssessment {
    const totalRows = rows.length;
    const validRows = rows.filter(row => row.name && row.unit_id).length;
    const missingNameRows = rows.filter(row => !row.name).length;
    const missingUnitRows = rows.filter(row => !row.unit_id).length;
    const missingContactRows = rows.filter(row => !row.email && !row.phone).length;
    const unitCounts = new Map<string, number>();

    for (const row of rows) {
        const key = row.unit_id.trim().toLowerCase();
        if (!key) continue;
        unitCounts.set(key, (unitCounts.get(key) || 0) + 1);
    }

    const duplicateUnits = Array.from(unitCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([unit]) => unit)
        .slice(0, 20);

    const warnings: string[] = [];
    if (missingNameRows) warnings.push(`${missingNameRows} fila(s) sin nombre.`);
    if (missingUnitRows) warnings.push(`${missingUnitRows} fila(s) sin unidad.`);
    if (missingContactRows) warnings.push(`${missingContactRows} fila(s) sin email ni telefono.`);
    if (duplicateUnits.length) warnings.push(`${duplicateUnits.length} unidad(es) aparecen repetidas.`);

    const completeness = totalRows > 0 ? validRows / totalRows : 0;
    const contactCoverage = totalRows > 0 ? (totalRows - missingContactRows) / totalRows : 0;
    const duplicatePenalty = totalRows > 0 ? Math.min(0.2, duplicateUnits.length / totalRows) : 0;
    const confidenceScore = Math.max(0, Math.min(100, Math.round(((completeness * 0.75) + (contactCoverage * 0.25) - duplicatePenalty) * 100)));

    return {
        totalRows,
        validRows,
        missingNameRows,
        missingUnitRows,
        missingContactRows,
        duplicateUnits,
        confidenceScore,
        warnings,
    };
}

export async function POST(request: Request) {
    const limited = enforceRateLimit(request, 'onboarding.extract', { limit: 12, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        if (profile.role !== 'admin') {
            return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No se adjuntó ningún archivo.' }, { status: 400 });
        }

        if (file.size > MAX_UPLOAD_BYTES) {
            return NextResponse.json({ error: 'Archivo demasiado grande. Sube un archivo de hasta 10 MB o divide la nomina.' }, { status: 413 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = file.name.toLowerCase();

        let extractedText = '';
        let extractedInlineData: { mimeType: string, data: string } | undefined = undefined;

        // 1. EXTRAER TEXTO BRUTO DEL BINARIO (PDF, DOCX) O ENVIAR DIRECTO (PDF NATIVO VIA IA)
        if (fileName.endsWith('.pdf')) {
            // EN PRODUCCIÓN/VERCEL: `pdf-parse` arroja ERROR: "t is not a function" al intentar
            // usar polyfills en Server Components. Gemini FLASH tiene soporte NATIVO perfecto
            // para leer PDFs base64 directamente, incluso si están escaneados (OCR). ¡Usemoslo!
            const pdfBase64 = buffer.toString('base64');
            extractedInlineData = { mimeType: 'application/pdf', data: pdfBase64 };
        } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
            // Lazy load mammoth as well
            const mammoth = await import('mammoth');
            const result = await mammoth.extractRawText({ buffer });
            extractedText = result.value;
        } else if (fileName.endsWith('.xlsx')) {
            extractedText = await spreadsheetBufferToText(buffer, { maxRows: 1000 });
        } else if (fileName.endsWith('.xls')) {
            extractedInlineData = {
                mimeType: 'application/vnd.ms-excel',
                data: buffer.toString('base64')
            };
        } else if (fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
            extractedText = buffer.toString('utf-8');
        } else {
            return NextResponse.json({ error: 'Formato no soportado (.pdf, .docx, .xls, .xlsx, .txt, .csv)' }, { status: 400 });
        }

        if (!extractedText.trim() && !extractedInlineData) {
            return NextResponse.json({ error: 'El documento está vacío o no se puede procesar.' }, { status: 400 });
        }

        // 2. ENVIAR A GEMINI PARA VECTO-EXTRACCIÓN JSON
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY no configurada en las variables de entorno");

        // Limitamos el texto a ~100,000 caracteres para no romper el contexto por accidente (solo para inputs de docx/txt)
        const safeText = extractedText.trim() ? extractedText.substring(0, 100000) : "";

        const jsonString = await callGeminiExtractor(apiKey, safeText, extractedInlineData, {
            userId: profile.id,
            communityId: profile?.community_id,
            role: profile?.role,
        });

        // 3. VALIDACIÓN FINAL: Parseamos el JSON para asegurarnos que la IA obedeció
        let parsedJson: unknown = [];
        try {
            parsedJson = JSON.parse(jsonString);
            if (!Array.isArray(parsedJson)) {
                parsedJson = [parsedJson]; // Forzar Array si devolvió objeto
            }
        } catch {
            console.warn("Gemini no devolvio un JSON valido:", jsonString);
            throw new Error("La Inteligencia Artificial no pudo estructurar los datos correctamente. Intenta subir un archivo más limpio.");
        }

        const rows = normalizeExtractedRows(parsedJson);
        const assessment = buildAssessment(rows);

        await recordOperationEvent({
            communityId: profile.community_id,
            actorId: profile.id,
            actorRole: profile.role,
            action: 'onboarding.roster_extracted',
            entityType: 'resident_roster',
            severity: assessment.warnings.length ? 'warning' : 'success',
            status: assessment.warnings.length ? 'pending' : 'success',
            summary: `Nomina analizada: ${assessment.validRows}/${assessment.totalRows} filas listas`,
            metadata: {
                fileName: file.name,
                fileSize: file.size,
                confidenceScore: assessment.confidenceScore,
                warnings: assessment.warnings,
                duplicateUnits: assessment.duplicateUnits,
            },
            requestId: getRequestId(request),
        });

        return NextResponse.json({ data: rows, assessment });

    } catch (error: unknown) {
        if (isAiBudgetExceededError(error)) {
            return NextResponse.json({ error: error.reason }, { status: 429 });
        }

        console.warn('Extractor Error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}
