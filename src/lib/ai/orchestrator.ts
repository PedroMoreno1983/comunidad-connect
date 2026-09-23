import type { TrainingSectionContext } from '@/lib/types';
import { answerFromTrainingSection, trainingSectionFromCourseContent } from '@/lib/training/sectionFallback';
import { classmateToneGuidance, practicePeersForRole, tutorToneGuidance } from '@/lib/training/tutorGuidance';
import { TUTOR_PROMPT } from './agents/tutor';
import { recordAiEvent } from './telemetry';
import { enforceAiBudget, estimateAiCostCents, estimateTokensFromMessages, estimateTokensFromText, isAiBudgetExceededError, recordAiUsage, type AiBudgetContext } from './budget';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { MemoryService } from '../../ai/memoryService.js';

type MessageRole = 'user' | 'model';
type AgentRole = 'system' | 'tutor' | 'classmate' | 'user';

// La Tutora hace la tarea compleja: enseñar, seguir el contenido del curso, decidir
// la pizarra y las imágenes. Prioriza el modelo con mejor razonamiento y cae a los
// más baratos solo si ese falla (rate limit, etc.).
const DEFAULT_TUTOR_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
];

// Los compañeros IA solo dan una opinión corta (1-2 frases) en personaje: tarea
// simple, así que usan siempre el modelo más barato.
const DEFAULT_CLASSMATE_MODELS = [
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
];

export interface ChatMessage {
    id: string;
    role: AgentRole;
    text: string;
    blackboard?: string;
    name?: string;
}

const HALLUCINATED_SPEAKER_TAG_REGEX =
    /((?:^|\n)\s*)\[([A-Za-z0-9\s_]+)\]:?\s*/gi;

// Etiquetas tipo placeholder que a veces el modelo deja sueltas a mitad de frase
// (no solo al inicio de línea), por lo que se limpian aparte con reemplazos reales.
const LOOSE_USER_TAG_REGEX = /\[USER\]/gi;
const LOOSE_CLASSMATE_TAG_REGEX = /\[CLASSMATE\]/gi;

function sanitizeAgentResponse(text: string, userName?: string) {
    return text
        .replace(HALLUCINATED_SPEAKER_TAG_REGEX, "$1")
        .replace(LOOSE_USER_TAG_REGEX, userName?.trim() || "vecino(a)")
        .replace(LOOSE_CLASSMATE_TAG_REGEX, "tu compañero(a)")
        .trim();
}

function parseModelList(envValue: string | undefined) {
    return envValue
        ?.split(",")
        .map(model => model.trim())
        .filter(Boolean);
}

function getTutorModels() {
    // GEMINI_TRAINING_MODELS queda como override global de compatibilidad (afecta todo);
    // GEMINI_TUTOR_MODELS permite afinar solo la Tutora.
    const configured = parseModelList(process.env.GEMINI_TUTOR_MODELS) || parseModelList(process.env.GEMINI_TRAINING_MODELS);
    return configured?.length ? configured : DEFAULT_TUTOR_MODELS;
}

function getClassmateModels() {
    const configured = parseModelList(process.env.GEMINI_CLASSMATE_MODELS) || parseModelList(process.env.GEMINI_TRAINING_MODELS);
    return configured?.length ? configured : DEFAULT_CLASSMATE_MODELS;
}

function extractGeminiError(text: string) {
    try {
        const data = JSON.parse(text);
        return data?.error?.message || text;
    } catch {
        return text;
    }
}

export async function buildTrainingFallbackTurn(
    _history: ChatMessage[],
    userMessage: string,
    section?: TrainingSectionContext | null,
): Promise<ChatMessage[]> {
    const fromSection = answerFromTrainingSection(section);
    if (fromSection) {
        return [{
            id: `tutor-fallback-${Date.now()}`,
            role: 'tutor',
            text: fromSection.text,
            blackboard: fromSection.blackboard,
        }];
    }

    const shortAnswer = userMessage.trim().length <= 4
        ? "La presentación ya marca el criterio. Separar el hecho, la regla y la acción de tu rol. ¿Qué parte de la sección abierta quieres aplicar?"
        : "Sigo en la sección que tienes en pantalla. Separa el hecho, la regla y la acción de tu rol. ¿Qué decisión tomarías ahí?";

    return [{
        id: `tutor-fallback-${Date.now()}`,
        role: 'tutor',
        text: shortAnswer,
    }];
}

/**
 * Llama a la API nativa de Gemini con el contexto de la clase.
 */
async function callGemini(apiKey: string, systemPrompt: string, history: {role: MessageRole, text: string}[], budget?: Partial<AiBudgetContext>, models: string[] = DEFAULT_TUTOR_MODELS) {
    const formattedHistory = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
    }));

    const body = {
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
        contents: formattedHistory,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1000,
        },
    };

    const errors: string[] = [];

    for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const startedAt = Date.now();
        const promptTokens = estimateTokensFromText(systemPrompt) + estimateTokensFromMessages(history);
        const completionBudget = 1000;

        await enforceAiBudget({
            communityId: budget?.communityId,
            userId: budget?.userId,
            role: budget?.role,
            module: budget?.module || 'training.multi_agent',
            provider: 'gemini',
            model,
            actionType: budget?.actionType || 'chat',
            estimatedPromptTokens: promptTokens,
            estimatedCompletionTokens: completionBudget,
        });
        
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                const data = await res.json();
                const candidate = data?.candidates?.[0];
                const text = (candidate?.content?.parts?.[0]?.text || "").trim();
                if (text) {
                    const completionTokens = data?.usageMetadata?.candidatesTokenCount ?? estimateTokensFromText(text);
                    const actualPromptTokens = data?.usageMetadata?.promptTokenCount ?? promptTokens;
                    await recordAiUsage({
                        communityId: budget?.communityId,
                        userId: budget?.userId,
                        role: budget?.role,
                        module: budget?.module || 'training.multi_agent',
                        provider: 'gemini',
                        model,
                        actionType: budget?.actionType || 'chat',
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
                        metadata: { latencyMs: Date.now() - startedAt },
                    });
                    recordAiEvent({
                        provider: 'gemini',
                        feature: 'training.multi_agent',
                        status: 'success',
                        model,
                        latencyMs: Date.now() - startedAt,
                        promptChars: systemPrompt.length + history.reduce((sum, msg) => sum + msg.text.length, 0),
                        outputChars: text.length,
                    });
                    return text;
                }
                errors.push(`[${model}]: empty response (${candidate?.finishReason || "unknown"})`);
                recordAiEvent({
                    provider: 'gemini',
                    feature: 'training.multi_agent',
                    status: 'error',
                    model,
                    latencyMs: Date.now() - startedAt,
                    error: `empty response (${candidate?.finishReason || "unknown"})`,
                });
            } else {
                const errData = await res.text();
                const error = extractGeminiError(errData).substring(0, 180);
                errors.push(`[${model}]: ${res.status} - ${error}`);
                recordAiEvent({
                    provider: 'gemini',
                    feature: 'training.multi_agent',
                    status: 'error',
                    model,
                    latencyMs: Date.now() - startedAt,
                    error,
                });
            }
        } catch (error) {
            errors.push(`[${model}]: Network Error`);
            recordAiEvent({
                provider: 'gemini',
                feature: 'training.multi_agent',
                status: 'error',
                model,
                latencyMs: Date.now() - startedAt,
                error,
            });
        }
    }

    throw new Error(`All Gemini models failed: ${errors.join(' | ')}`);
}

/**
 * Orquestador Básico Multi-Agente
 * Recibe el input del usuario, llama al Tutor, y aleatoriamente llama a un Classmate.
 */
export async function runMultiAgentTurn(
    apiKey: string,
    history: ChatMessage[],
    userMessage: string,
    courseContent?: string,
    userId?: string,
    communityId?: string,
    userName?: string,
    userRole: 'admin' | 'concierge' = 'concierge',
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

    // Asegurar que el historial comience siempre con "user" para evitar Error 400
    if (geminiHistory.length > 0 && geminiHistory[0].role !== 'user') {
        geminiHistory.unshift({ role: 'user', text: '[USER]: (Inicia la sesión)' });
    }

    // Agregar mensaje actual del usuario (asegurando alternancia)
    if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === 'user') {
        geminiHistory[geminiHistory.length - 1].text += `\n\n[USER]: ${userMessage}`;
    } else {
        geminiHistory.push({ role: 'user', text: `[USER]: ${userMessage}` });
    }

    // --- NOMBRE REAL DEL VECINO Y REGLA ANTI-PLACEHOLDER ---
    // Si el perfil no tiene nombre, authContext cae al email; evitamos saludar con un email crudo.
    const section = trainingSectionFromCourseContent(courseContent);
    const peers = practicePeersForRole(userRole);
    const peerNames = peers.map(peer => peer.name).join(' o ');
    const trimmedUserName = userName?.trim();
    const cleanUserName = trimmedUserName && !trimmedUserName.includes("@") ? trimmedUserName : undefined;
    const userContext = [
        cleanUserName
            ? `La persona en esta capacitación se llama "${cleanUserName}". Dirígete a ella por su nombre cuando le hables directamente.`
            : "No conoces el nombre de quien está en la capacitación; háblale de tú sin inventar un nombre.",
        `REGLA DE FORMATO ABSOLUTA: Nunca escribas placeholders entre corchetes como [USER], [CLASSMATE] o [NOMBRE]. Si te refieres a un compañero de práctica, usa solo estos nombres: ${peerNames}.`
    ].join("\n");

    // --- INTEGRACIÓN DE MEMORIA A LARGO PLAZO ---
    let memoryContext = "";
    if (userId && communityId) {
        try {
            const memories = await MemoryService.getRelevantMemories(communityId, userId, userMessage, 3);
            if (memories && memories.length > 0) {
                memoryContext = "\n\nRECUERDOS DE CAPACITACIONES ANTERIORES:\n" + 
                    memories.map((m: { content: string }) => `- ${m.content}`).join("\n") +
                    "\nUsa esta información para personalizar tu respuesta si es relevante.";
            }
        } catch (e) {
            console.warn("No se pudo obtener la memoria del agente:", e);
        }
    }

    // Gemini exige que si el ultimo no es user (casi imposible aca), o el primero no es user...
    // Pero con el SystemPrompt como 'user' instruction, Gemini suele aceptar si history empieza como model.
    try {
        // La presentación del curso ya está en pantalla. El chat no abre otra.
        const tutorContextParam = [
            "La presentación ya está en pantalla. No abras otra diapositiva.",
            "No uses <pizarra>, no pidas imágenes y no enlaces videos.",
            section?.title?.trim()
                ? `La sección abierta se llama «${section.title.trim()}». Habla solo de esa sección y de la decisión que muestra.`
                : "Habla solo de la sección abierta.",
            "Un párrafo de máximo dos oraciones, en femenino y de tú, y una sola pregunta. No saludes a todos.",
        ].join("\n");

        const tutorCourseContext = courseContent 
            ? `\n\nCONTENIDO DEL CURSO: A continuación tienes el contenido estricto sobre el cual debes basar tu clase hoy. Úsalo como tu fuente principal de verdad:\n${courseContent}\n\n`
            : "";

        const budgetContext = {
            communityId,
            userId,
            role: userRole,
            module: 'training.multi_agent',
            actionType: 'chat' as const,
        };

        const rawTutorResponse = await callGemini(
            apiKey,
            [TUTOR_PROMPT, userContext, tutorToneGuidance(userRole, section), tutorCourseContext, memoryContext, tutorContextParam].filter(Boolean).join('\n\n'),
            geminiHistory,
            budgetContext,
            getTutorModels(),
        );

        const tutorChatText = sanitizeAgentResponse(rawTutorResponse, cleanUserName)
            .replace(/(?:<pizarra>|\[PIZARRA\]|【BLACKBOARD】)[\s\S]*?(?:<\/pizarra>|\[\/PIZARRA\]|【\/BLACKBOARD】|$)/gi, "")
            .replace(/<generar_imagen>[\s\S]*?<\/generar_imagen>/gi, "")
            .trim();

        const tutorMsgId = `tutor-${Date.now()}`;
        newResponses.push({
            id: tutorMsgId,
            role: 'tutor',
            text: tutorChatText || "Seguimos en la sección que tienes en pantalla. ¿Qué decisión tomarías?",
        });

        // 2. INTERVENCIÓN DE CLASSMATE 1 (100% asegurado en cada turno de usuario)
        const persona1 = peers[0];
        if (!persona1) return newResponses;
        
        // Le damos contexto sobre lo que acaba de responder el tutor
        if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === 'model') {
            geminiHistory[geminiHistory.length - 1].text += `\n\n[TUTORA]: ${tutorChatText}`;
        } else {
            geminiHistory.push({ role: 'model', text: `[TUTORA]: ${tutorChatText}` });
        }
        
        // Forzamos un turno falso de "user" para romper la continuidad de la IA y que no asuma el rol anterior
        const classmate1History = [...geminiHistory];
        classmate1History.push({ role: 'user', text: `Instrucción del Sistema: La Tutora CoCo acaba de terminar de hablar sobre la sección proyectada. Ahora debes actuar estrictamente como ${persona1.name} y dar tu opinión corta.` });

        const classmateContextParam = `Eres ${persona1.name}, compañero de práctica de esta capacitación. La presentación ya muestra la sección. La tutora acaba de decir textualmente: "${tutorChatText}". Responde brevemente SOLO con tu propio diálogo. REGLAS ESTRICTAS:\n1. ERES UN COMPAÑERO DE PRÁCTICA. ESTÁ ESTRICTAMENTE PROHIBIDO EXPLICAR LA CLASE.\n2. NO uses corchetes con tu nombre al principio de tu mensaje ni escribas acciones entre asteriscos. Nunca escribas placeholders como [USER] o [CLASSMATE]; si te diriges a quien está en la capacitación, ${cleanUserName ? `llámalo "${cleanUserName}"` : "hazlo sin nombrarlo"}.\n3. Tu comentario debe reaccionar específicamente a lo que la Tutora ACABA de decir arriba, sobre la sección en pantalla. NO cambies de tema.\n4. REGLA DE ORO: Máximo 2 oraciones. Cállate inmediatamente después de 2 oraciones. NO hables con otros compañeros.`;
        let classmateResponse = "";
        try {
            classmateResponse = await callGemini(apiKey, [persona1.prompt, classmateContextParam, classmateToneGuidance(persona1.name, section?.title)].join('\n\n'), classmate1History, budgetContext, getClassmateModels());
        } catch (err) {
            console.warn("Classmate 1 unavailable:", err);
        }

        let classmate1FinalText = "";
        if (classmateResponse && classmateResponse.length > 5 && !classmateResponse.includes("BLACKBOARD") && !classmateResponse.includes("PIZARRA")) {
            classmate1FinalText = sanitizeAgentResponse(classmateResponse, cleanUserName);
            newResponses.push({
                id: `classmate1-${Date.now()}`,
                role: 'classmate',
                name: persona1.name,
                text: classmate1FinalText
            });
            if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === 'model') {
                geminiHistory[geminiHistory.length - 1].text += `\n\n[${persona1.name}]: ${classmate1FinalText}`;
            } else {
                geminiHistory.push({ role: 'model', text: `[${persona1.name}]: ${classmate1FinalText}` });
            }
            
            // 3. INTERVENCIÓN DE CLASSMATE 2 (50% de probabilidad de que otro vecino le responda o acote algo)
            const persona2 = peers[1];
            if (Math.random() < 0.5 && persona2) {
                
                const classmate2History = [...geminiHistory];
                classmate2History.push({ role: 'user', text: `Instrucción del Sistema: ${persona1.name} acaba de opinar sobre la sección proyectada. Ahora debes actuar estrictamente como ${persona2.name} y acotar algo breve.` });

                const classmate2ContextParam = `Eres ${persona2.name}, compañero de práctica. ${persona1.name} acaba de decir: "${classmate1FinalText}". La presentación sigue en la misma sección. REGLAS:\n1. ESTÁ ESTRICTAMENTE PROHIBIDO DAR LA CLASE O EXPLICAR MÓDULOS.\n2. Responde breve, sobre lo que acaba de decir y sobre la sección en pantalla. NO cambies de tema.\n3. NO uses etiquetas de nombre ni asteriscos de acciones. Nunca escribas placeholders como [USER] o [CLASSMATE]; si te diriges a quien está en la capacitación, ${cleanUserName ? `llámalo "${cleanUserName}"` : "hazlo sin nombrarlo"}.`;
                let classmate2Response = "";
                try {
                    classmate2Response = await callGemini(apiKey, [persona2.prompt, classmate2ContextParam, classmateToneGuidance(persona2.name, section?.title)].join('\n\n'), classmate2History, budgetContext, getClassmateModels());
                } catch (err) {
                    console.warn("Classmate 2 unavailable:", err);
                }

                if (classmate2Response && classmate2Response.length > 5 && !classmate2Response.includes("BLACKBOARD")) {
                    newResponses.push({
                        id: `classmate2-${Date.now()}`,
                        role: 'classmate',
                        name: persona2.name,
                        text: sanitizeAgentResponse(classmate2Response, cleanUserName)
                    });
                }
            }
        }

        return newResponses;

    } catch (err) {
        if (isAiBudgetExceededError(err)) throw err;

        console.error("MultiAgent Orchestrator Error:", err);
        recordAiEvent({
            provider: 'system',
            feature: 'training.multi_agent',
            status: 'fallback',
            fallbackUsed: 'auto_tutor_turn',
            error: err,
        });
        return buildTrainingFallbackTurn(history, userMessage, trainingSectionFromCourseContent(courseContent));
    }
}
