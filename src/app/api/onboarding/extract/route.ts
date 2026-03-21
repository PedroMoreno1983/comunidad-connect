import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Extender el Timeout de Vercel a 60 segundos (Máximo plan Hobby) para procesamiento IA prolongado.

const GEMINI_JSON_PROMPT = `
Eres un Extractor de Datos experto.
Tu objetivo es analizar un documento sin formato (sucio, listas desordenadas, actas, reglamentos, excels en texto plano) y extraer EXCLUSIVAMENTE a las personas (residentes, dueños, arrendatarios) mencionadas en él.

Debes devolver un JSON estrictamente válido que sea un Array de objetos. Cada objeto debe tener esta estructura exacta:
{
  "name": "Nombre completo de la persona",
  "unit_id": "Número de departamento o unidad (ej: '101', 'A5', o 'Desconocido' si no se menciona)",
  "email": "Correo electrónico (Si no aparece en el texto, inventa uno falso pero realista uniendo el nombre y apellido con el dominio @comunidad.cl, ej: juan.perez@comunidad.cl)",
  "phone": "Teléfono (o un string vacío '' si no hay)"
}

REGLAS ABSOLUTAS:
1. Tu respuesta DEBE ser un Array JSON puro. Nada de texto antes ni después.
2. NO incluyas bloques de código markdown \`\`\`json. Solo envía el texto plano que pueda ser parseado por JSON.parse() directamente.
3. Si el documento es masivo, extrae la lista completa sin resumir.
4. Si el documento no tiene personas, devuelve un array vacío [].
`;

async function callGeminiExtractor(apiKey: string, text: string) {
    // Usamos el modelo rápido y barato ideal para parsear
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    // Configurar Gemini para responder en JSON estricto
    const body = {
        systemInstruction: {
            role: "user",
            parts: [{ text: GEMINI_JSON_PROMPT }]
        },
        contents: [
            { role: "user", parts: [{ text: "Extrae a todos los residentes de este texto sucio obtenido de un binario:\n\n" + text }] }
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
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No se adjuntó ningún archivo.' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = file.name.toLowerCase();

        let extractedText = '';

        // 1. EXTRAER TEXTO BRUTO DEL BINARIO (PDF, DOCX)
        if (fileName.endsWith('.pdf')) {
            // Lazy load the native module to prevent Vercel Serverless top-level crashes
            const pdfParse = require('pdf-parse');
            const pdfData = await pdfParse(buffer);
            extractedText = pdfData.text;
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

        if (!extractedText.trim()) {
            return NextResponse.json({ error: 'El documento está vacío o ilegible.' }, { status: 400 });
        }

        // 2. ENVIAR A GEMINI PARA VECTO-EXTRACCIÓN JSON
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY no configurada en las variables de entorno");

        // Limitamos el texto a ~50,000 caracteres para no romper el contexto por accidente
        const safeText = extractedText.substring(0, 50000); 
        
        const jsonString = await callGeminiExtractor(apiKey, safeText);
        
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
        
    } catch (error: any) {
        console.error('Extractor Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
