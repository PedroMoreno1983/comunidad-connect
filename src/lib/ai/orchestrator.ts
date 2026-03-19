import { TUTOR_PROMPT } from './agents/tutor';
import { CLASSMATE_PROMPT } from './agents/classmate';

type MessageRole = 'user' | 'model';
type AgentRole = 'system' | 'tutor' | 'classmate' | 'user';

interface ChatMessage {
    id: string;
    role: AgentRole;
    text: string;
    blackboard?: string;
}

/**
 * Llama a la API nativa de Gemini con el contexto de la clase.
 */
async function callGemini(apiKey: string, systemPrompt: string, history: {role: MessageRole, text: string}[]) {
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
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

    const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        throw new Error(`Gemini API Error: ${res.status}`);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    return (candidate?.content?.parts?.[0]?.text || "").trim();
}

/**
 * Orquestador Básico Multi-Agente
 * Recibe el input del usuario, llama al Tutor, y aleatoriamente llama a un Classmate.
 */
export async function runMultiAgentTurn(
    apiKey: string,
    history: ChatMessage[],
    userMessage: string
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
        const tutorContextParam = "Recuerda usar 【BLACKBOARD】...【/BLACKBOARD】 para enviar contenido a la pizarra si vas a mostrar diapositivas o preguntas densas.";
        const rawTutorResponse = await callGemini(apiKey, TUTOR_PROMPT + "\n\n" + tutorContextParam, geminiHistory);
        
        let tutorChatText = rawTutorResponse;
        let tutorBlackboard = "";

        // Extraer contenido de la pizarra si el tutor lo envió
        const bbMatch = tutorChatText.match(/【BLACKBOARD】([\\s\\S]*?)【\/BLACKBOARD】/);
        if (bbMatch) {
            tutorBlackboard = bbMatch[1].trim();
            tutorChatText = tutorChatText.replace(/【BLACKBOARD】[\\s\\S]*?【\/BLACKBOARD】/, "").trim();
        }

        const tutorMsgId = `tutor-${Date.now()}`;
        newResponses.push({
            id: tutorMsgId,
            role: 'tutor',
            text: tutorChatText || "¡Entendido! Avancemos.",
            blackboard: tutorBlackboard || undefined
        });

        // 2. DECIDIR SI INTERVIENE EL CLASSMATE (ej: 30% de probabilidad O si estamos al inicio)
        const shouldClassmateSpeak = Math.random() < 0.3 && geminiHistory.length > 2;

        if (shouldClassmateSpeak) {
            // Le damos contexto sobre lo que acaba de responder el tutor
            geminiHistory.push({ role: 'model', text: `[TUTOR]: ${tutorChatText}` });
            
            const classmateContextParam = "El tutor acaba de dar su explicación. Comenta algo breve o haz una pregunta concisa como alumno.";
            const classmateResponse = await callGemini(apiKey, CLASSMATE_PROMPT + "\\n\\n" + classmateContextParam, geminiHistory);
            
            if (classmateResponse && classmateResponse.length > 5 && !classmateResponse.includes("BLACKBOARD")) {
                newResponses.push({
                    id: `classmate-${Date.now()}`,
                    role: 'classmate',
                    text: classmateResponse.replace(/\[CLASSMATE\]:/gi, '').trim()
                });
            }
        }

        return newResponses;

    } catch (err) {
        console.error("MultiAgent Orchestrator Error:", err);
        throw err;
    }
}
