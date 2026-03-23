import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Vercel Hobby allows up to 60s maxDuration for Edge/Serverless functions
export const maxDuration = 60; 

export async function POST(request: Request) {
    try {
        const bodyReq = await request.json();
        const { text } = bodyReq;

        if (!text) {
            return NextResponse.json({ error: 'Falta el contenido de texto para generar el curso.' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY no configurada.");

        // Gemini 2.5 Flash Endpoint
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
        const systemPrompt = `Eres un Experto Diseñador Instruccional e IA Educativa ("CoCo").
Tu tarea es transformar el siguiente documento o texto en una PRESENTACIÓN DE DIAPOSITIVAS altamente efectiva y didáctica.
Reglas:
1. Divide lógicamente el material en conceptos digeribles (diapositivas).
2. Para cada diapositiva, crea un título corto.
3. Extrae de 2 a 5 'bullets' concretos y muy breves para mostrar visualmente.
4. Genera un tema visual sugerido (ej. "blue-glass", "purple-gradient", "sunset-orange", "tech-abstract", "nature-green").
5. Lo más importante: Escribe un 'notes' (Notas de orador) envolvente, explicativo y conversacional que será lo que la profesora IA dirá a los estudiantes. Piensa en estas notas como el contenido profundo de la clase mientras que los 'bullets' son solo la guía visual.
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

        const response = await fetch(url, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
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

        return NextResponse.json({ slides });

    } catch (error: any) {
        console.error('Error generating slides:', error);
        return NextResponse.json({ 
            error: 'Ocurrió un error al diseñar la presentación. ' + (error.message || '') 
        }, { status: 500 });
    }
}
