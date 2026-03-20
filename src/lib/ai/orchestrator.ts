import { TUTOR_PROMPT } from './agents/tutor';
import { CLASSMATE_PERSONAS } from './agents/classmate';

type MessageRole = 'user' | 'model';
type AgentRole = 'system' | 'tutor' | 'classmate' | 'user';

export interface ChatMessage {
    id: string;
    role: AgentRole;
    text: string;
    blackboard?: string;
    name?: string;
}

const HALLUCINATED_SPEAKER_TAG_REGEX =
    /((?:^|\n)\s*)\[([A-Za-z0-9\s_]+)\]:?\s*/gi;

function sanitizeAgentResponse(text: string) {
    return text
        .replace(HALLUCINATED_SPEAKER_TAG_REGEX, "$1")
        .replace(/\[USER\]/gi, "vecino(a)")
        .trim();
}

/**
 * Llama a la API nativa de Gemini con el contexto de la clase.
 */
async function callGemini(apiKey: string, systemPrompt: string, history: {role: MessageRole, text: string}[]) {
    const formattedHistory = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
    }));

    const body = {
        systemInstruction: {
            role: "user",
            parts: [{ text: systemPrompt }]
        },
        contents: formattedHistory,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1000,
        },
    };

    const configs = [
        { ver: "v1beta", model: "gemini-2.5-flash" },
        { ver: "v1beta", model: "gemini-2.0-flash" },
        { ver: "v1beta", model: "gemini-1.5-flash" },
        { ver: "v1beta", model: "gemini-pro" },
        { ver: "v1", model: "gemini-pro" }
    ];

    let lastError = null;

    for (const config of configs) {
        const url = `https://generativelanguage.googleapis.com/${config.ver}/models/${config.model}:generateContent?key=${apiKey}`;
        
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                const data = await res.json();
                const candidate = data?.candidates?.[0];
                return (candidate?.content?.parts?.[0]?.text || "").trim();
            } else {
                lastError = new Error(`Gemini API Error: ${res.status}`);
            }
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error("All Gemini configurations failed");
}

/**
 * Orquestador Básico Multi-Agente
 * Recibe el input del usuario, llama al Tutor, y aleatoriamente llama a un Classmate.
 */
export async function runMultiAgentTurn(
    apiKey: string,
    history: ChatMessage[],
    userMessage: string,
    courseContent?: string
): Promise<ChatMessage[]> {
    const newResponses: ChatMessage[] = [];
    const geminiHistory: {role: MessageRole, text: string}[] = [];

    // Mapear historial al formato de Gemini
    for (const msg of history) {
        // Ignoramos el mensaje duplicado del usuario actual si es el ultimo,
        // porque lo consolidaremos al final
        if (msg.text === userMessage && msg === history[history.length - 1]) continue;

        const role = msg.role === 'user' ? 'user' : 'model';
        const prefix = msg.role !== 'user' ? `[${msg.role.toUpperCase()}]: ` : '';
        
        // Evitar que haya dos roles seguidos repetidos, Gemini arroja 400 si eso pasa.
        // Si el ultimo es el mismo rol, concatenamos al texto.
        if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === role) {
            geminiHistory[geminiHistory.length - 1].text += `\n\n${prefix}${msg.text}`;
        } else {
            geminiHistory.push({ role, text: `${prefix}${msg.text}` });
        }
    }

    // Agregar mensaje actual del usuario (asegurando alternancia)
    if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === 'user') {
        geminiHistory[geminiHistory.length - 1].text += `\n\n[USER]: ${userMessage}`;
    } else {
        geminiHistory.push({ role: 'user', text: `[USER]: ${userMessage}` });
    }

    // Gemini exige que si el ultimo no es user (casi imposible aca), o el primero no es user...
    // Pero con el SystemPrompt como 'user' instruction, Gemini suele aceptar si history empieza como model.
    try {
        // 1. TURNO DEL TUTOR
        let tutorContextParam = "MODO PIZARRA REGLAS: Si usas la etiqueta <pizarra> ... </pizarra> DEBES incluir ayudas visuales. 1) Para imágenes: ![Alt](https://image.pollinations.ai/prompt/palabra-ingles-sin-espacios) (NUNCA uses espacios ni mayúsculas). 2) NUEVA CAPACIDAD: Para mostrar videos explicaivos reales de YouTube usa enlaces estándar: [Ver Video](https://www.youtube.com/watch?v=ID_EJEMPLO). La pizarra detectará mágicamente los enlaces de YouTube y los transformará en reproductores de video incrustados. Usa videos libremente si crees que aportan a la clase.";
        
        // Forzar la pizarra visual al inicio de la conversación
        if (history.length <= 2) {
            tutorContextParam = "OBLIGATORIO EN ESTE TURNO: Debes generar contenido para la pizarra. FORMATO ESTRICTO DE EJEMPLO:\n<pizarra>\n# 🎨 Título\n\n![Ilustracion](https://image.pollinations.ai/prompt/condominium)\n\n[Ver Video](https://www.youtube.com/watch?v=kR2C2B6u-M4)\n\n## 📋 Puntos Clave\n\n* ✅ Punto 1\n</pizarra>\n\n¡Fuera de esas etiquetas, saluda amigablemente en el chat.";
        }

        const tutorCourseContext = courseContent 
            ? `\n\nCONTENIDO DEL CURSO: A continuación tienes el contenido estricto sobre el cual debes basar tu clase hoy. Úsalo como tu fuente principal de verdad:\n${courseContent}\n\n`
            : "";

        const rawTutorResponse = await callGemini(apiKey, TUTOR_PROMPT + tutorCourseContext + "\n\n" + tutorContextParam, geminiHistory);
        
        let tutorChatText = sanitizeAgentResponse(rawTutorResponse);
        let tutorBlackboard = "";

        // Extractor primario: Soporta <pizarra>, [PIZARRA], o 【BLACKBOARD】
        const bbRegex = /(?:<pizarra>|\[PIZARRA\]|【BLACKBOARD】)([\s\S]*?)(?:<\/pizarra>|\[\/PIZARRA\]|【\/BLACKBOARD】|$)/i;
        const bbMatch = tutorChatText.match(bbRegex);
        
        if (bbMatch) {
            tutorBlackboard = bbMatch[1].trim();
            tutorChatText = tutorChatText.replace(bbRegex, "").trim();
        } else {
            // Extractor secundario (Fallback): Si la IA omitió etiqueta de apertura pero escupió el cierre
            const fallbackRegex = /^([\s\S]*?)(?:<\/pizarra>|\[\/PIZARRA\]|【\/BLACKBOARD】)/i;
            const fallbackMatch = tutorChatText.match(fallbackRegex);
            if (fallbackMatch && fallbackMatch[1].length > 20) {
               tutorBlackboard = fallbackMatch[1].trim();
               tutorChatText = tutorChatText.replace(fallbackRegex, "").trim();
            }
        }

        if (tutorBlackboard && (!tutorChatText || tutorChatText.length < 5)) {
            tutorChatText = "¡Toda la información importante de esta lección está ahora compartida en la pizarra! ¿Comenzamos?";
        }

        const tutorMsgId = `tutor-${Date.now()}`;
        newResponses.push({
            id: tutorMsgId,
            role: 'tutor',
            text: tutorChatText || "¡Entendido! Avancemos.",
            blackboard: tutorBlackboard || undefined
        });

        // 2. INTERVENCIÓN DE CLASSMATE 1 (100% asegurado en cada turno de usuario)
        const persona1 = CLASSMATE_PERSONAS[Math.floor(Math.random() * CLASSMATE_PERSONAS.length)];
        
        // Le damos contexto sobre lo que acaba de responder el tutor
        geminiHistory.push({ role: 'model', text: `[TUTORA]: ${tutorChatText}` });
        
        // Forzamos un turno falso de "user" para romper la continuidad de la IA y que no asuma el rol anterior
        const classmate1History = [...geminiHistory];
        classmate1History.push({ role: 'user', text: `Instrucción del Sistema: La Tutora CoCo acaba de terminar de hablar. Ahora debes actuar estrictamente como el alumno ${persona1.name} y dar tu opinión corta.` });

        const classmateContextParam = `Eres ${persona1.name}, un ESTUDIANTE de esta clase. La tutora acaba de hablar. Responde brevemente SOLO con tu propio diálogo. REGLAS ESTRICTAS:\n1. ERES UN ALUMNO. ESTÁ ESTRICTAMENTE PROHIBIDO EXPLICAR LA CLASE.\n2. NO uses corchetes con tu nombre al principio de tu mensaje ni escribas acciones entre asteriscos.\n3. Opina o duda sobre la Tutora.\n4. REGLA DE ORO: Máximo 2 oraciones. Cállate inmediatamente después de 2 oraciones para no interpretar a otros personajes. NO hables con otros alumnos.`;
        const classmateResponse = await callGemini(apiKey, persona1.prompt + "\n\n" + classmateContextParam, classmate1History);
        
        let classmate1FinalText = "";
        if (classmateResponse && classmateResponse.length > 5 && !classmateResponse.includes("BLACKBOARD") && !classmateResponse.includes("PIZARRA")) {
            classmate1FinalText = sanitizeAgentResponse(classmateResponse);
            newResponses.push({
                id: `classmate1-${Date.now()}`,
                role: 'classmate',
                name: persona1.name,
                text: classmate1FinalText
            });
            geminiHistory.push({ role: 'model', text: `[${persona1.name}]: ${classmate1FinalText}` });
            
            // 3. INTERVENCIÓN DE CLASSMATE 2 (50% de probabilidad de que otro vecino le responda o acote algo)
            if (Math.random() < 0.5) {
                const remainingPersonas = CLASSMATE_PERSONAS.filter(p => p.name !== persona1.name);
                const persona2 = remainingPersonas[Math.floor(Math.random() * remainingPersonas.length)];
                
                const classmate2History = [...geminiHistory];
                classmate2History.push({ role: 'user', text: `Instrucción del Sistema: El vecino ${persona1.name} acaba de opinar. Ahora debes actuar estrictamente como el alumno ${persona2.name} y responderle o acotar algo a la clase.` });

                const classmate2ContextParam = `Eres ${persona2.name}, un ESTUDIANTE. El vecino ${persona1.name} acaba de decir: "${classmate1FinalText}". REGLAS:\n1. ERES UN ALUMNO. ESTÁ ESTRICTAMENTE PROHIBIDO DAR LA CLASE O EXPLICAR MÓDULOS.\n2. Respóndele a tu vecino brevemente.\n3. NO uses etiquetas de nombre ni asteriscos de acciones.`;
                const classmate2Response = await callGemini(apiKey, persona2.prompt + "\n\n" + classmate2ContextParam, classmate2History);
                
                if (classmate2Response && classmate2Response.length > 5 && !classmate2Response.includes("BLACKBOARD")) {
                    newResponses.push({
                        id: `classmate2-${Date.now()}`,
                        role: 'classmate',
                        name: persona2.name,
                        text: sanitizeAgentResponse(classmate2Response)
                    });
                }
            }
        }

        return newResponses;

    } catch (err) {
        console.error("MultiAgent Orchestrator Error:", err);
        throw err;
    }
}
