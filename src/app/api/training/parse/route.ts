import { NextResponse } from 'next/server';
const pdfParse = require('pdf-parse');
import mammoth from 'mammoth';
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
            // Extraer texto de PDF
            const pdfData = await pdfParse(buffer);
            extractedText = pdfData.text;
        } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
            // Extraer texto de Word
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
