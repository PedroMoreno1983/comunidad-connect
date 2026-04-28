import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Extender el Timeout de Vercel a 60 segundos (Máximo plan Hobby) para procesamiento IA prolongado.

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

async function callGeminiExtractor(apiKey: string, text: string, inlineData?: { mimeType: string, data: string }) {
    // Usamos el modelo rápido y barato ideal para parsear. gemini-flash-latest es el más compatible con esta clave.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
    
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

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        throw new Error(`Gemini API Error: ${res.statusText}`);
    }

    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
}

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

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No se adjuntó ningún archivo.' }, { status: 400 });
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
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer });
            extractedText = result.value;
        } else if (fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
            extractedText = buffer.toString('utf-8');
        } else {
            return NextResponse.json({ error: 'Formato no soportado (.pdf, .docx, .txt, .csv)' }, { status: 400 });
        }

        if (!extractedText.trim() && !extractedInlineData) {
            return NextResponse.json({ error: 'El documento está vacío o no se puede procesar.' }, { status: 400 });
        }

        // 2. ENVIAR A GEMINI PARA VECTO-EXTRACCIÓN JSON
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY no configurada en las variables de entorno");

        // Limitamos el texto a ~100,000 caracteres para no romper el contexto por accidente (solo para inputs de docx/txt)
        const safeText = extractedText.trim() ? extractedText.substring(0, 100000) : ""; 
        
        const jsonString = await callGeminiExtractor(apiKey, safeText, extractedInlineData);
        
        // 3. VALIDACIÓN FINAL: Parseamos el JSON para asegurarnos que la IA obedeció
        let parsedJson = [];
        try {
            parsedJson = JSON.parse(jsonString);
            if (!Array.isArray(parsedJson)) {
                parsedJson = [parsedJson]; // Forzar Array si devolvió objeto
            }
        } catch (parseError) {
            console.error("Gemini no devolvió un JSON válido:", jsonString);
            throw new Error("La Inteligencia Artificial no pudo estructurar los datos correctamente. Intenta subir un archivo más limpio.");
        }

        return NextResponse.json({ data: parsedJson });
        
    } catch (error: unknown) {
        console.error('Extractor Error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}
