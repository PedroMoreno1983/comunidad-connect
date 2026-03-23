import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Extender timeout a 60s en Vercel Hobby

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No se encontró un archivo en la solicitud' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = file.name.toLowerCase();

        let extractedText = '';

        if (fileName.endsWith('.pdf')) {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) throw new Error("GEMINI_API_KEY no configurada. Imposible leer PDFs en Vercel.");

            const pdfBase64 = buffer.toString('base64');
            const inlineData = { mimeType: 'application/pdf', data: pdfBase64 };
            
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const body = {
                contents: [{
                    role: "user", 
                    parts: [
                        { text: "Extrae TODO el texto de este documento de entrenamiento exactamente como está escrito, sin omitir partes, sin resumir y sin agregar comentarios extras. Solo retorna el contenido puro en texto plano directo, sin usar bloques de código Markdown." },
                        { inlineData }
                    ]
                }],
                generationConfig: { temperature: 0.1 }
            };

            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!response.ok) throw new Error("Error al analizar PDF con IA: " + response.statusText);
            const data = await response.json();
            extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
            // Extraer texto de Word evadiendo crash
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer });
            extractedText = result.value;
        } else if (fileName.endsWith('.txt')) {
            // Leer TXT directamente
            extractedText = buffer.toString('utf-8');
        } else {
            return NextResponse.json({ 
                error: 'Formato de archivo no soportado. Por favor sube un PDF, Word (.docx) o TXT.' 
            }, { status: 400 });
        }

        // Limpieza básica del texto extraído
        const cleanedText = extractedText
            .replace(/\u0000/g, '') // Remove nulos
            .replace(/\n{3,}/g, '\n\n') // Reducir saltos de línea múltiples
            .trim();

        if (!cleanedText) {
            return NextResponse.json({ error: 'El documento parece estar vacío o contenía solo imágenes.' }, { status: 400 });
        }

        return NextResponse.json({ text: cleanedText });

    } catch (error: any) {
        console.error('Error parsing document:', error);
        return NextResponse.json({ 
            error: 'Ocurrió un error al procesar el archivo. ' + (error.message || '') 
        }, { status: 500 });
    }
}
