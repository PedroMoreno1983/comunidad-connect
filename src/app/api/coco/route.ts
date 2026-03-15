import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Reverting to v1beta as it is the most compatible with current models like flash
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_FALLBACK_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

// ─── Rate Limiter (in-memory, per IP) ────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20;       // máximo 20 mensajes
const RATE_LIMIT_WINDOW = 60_000; // por 60 segundos

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
        return true;
    }
    if (entry.count >= RATE_LIMIT_MAX) return false;
    entry.count++;
    return true;
}

// ─── Navigation Guide ─────────────────────────────────────────────────────────
const NAVIGATION_GUIDE = `
Rutas disponibles agrupadas por perfil:

PARA TODOS LOS PERFILES:
- /home → Dashboard principal (Resumen general)
- /social → Muro Social (publicaciones, interacción vecinal)
- /chat → Comunidad / Chat (mensajería directa)
- /directorio → Directorio de la comunidad
- /feed → Avisos Oficiales / Anuncios
- /profile → Mi Perfil

ESPECÍFICO PARA RESIDENTES:
- /amenities → Reservar Espacios Comunes (piscina, quincho, gym)
- /expenses → Mis Gastos (ver y pagar gastos comunes con tarjeta)
- /votaciones → Votaciones comunitarias
- /marketplace → Marketplace (compra/venta entre vecinos)
- /resident/supermercado → CoCo Supermercado (lista y compra en Jumbo, Lider, Unimarc, Santa Isabel)

ESPECÍFICO PARA ADMINISTRADOR:
- /admin/units → Gestionar Unidades y perfiles de residentes
- /admin/finanzas → Gestionar Gastos Comunes, presupuestos, ingresos y cobros
- /feed → Publicar avisos oficiales y circulares
- /amenities → Administrar reservas de espacios
- /admin/votaciones → Crear y gestionar Votaciones o encuestas
- /admin/users → Gestión de usuarios y códigos de invitación
- /admin/mantenimiento → Solicitudes de mantenimiento y servicio
- /concierge/visitors → Registro de Visitas y control de acceso
- /concierge/packages → Control de Paquetería y encomiendas

ESPECÍFICO PARA CONSERJERÍA:
- /concierge/visitors → Registro de Visitas y control de acceso
- /concierge/packages → Control de Paquetería y encomiendas

OTROS MÓDULOS GLOBALES:
- /training → Centro de Capacitación (guías interactivas + cursos externos)
`;

const SYSTEM_PROMPT = `Eres CoCo, la asistente virtual inteligente y femenina de ComunidadConnect, una plataforma de gestión comunitaria para condominios y edificios residenciales en Chile.

Tu personalidad:
- Eres una mujer con una actitud profesional, educada, pero accesible y empática.
- Hablas en español formal pero no excesivamente rígido.
- SIEMPRE debes tratar al usuario por su nombre de pila en tu primera respuesta o cuando sea natural. El nombre del usuario viene en tu "Contexto actual" como un correo electrónico a veces. Si es un correo como "pedro.pedrofelipemoreno@gmail.com", llámalo "Pedro". Si es Juan, llámalo "Juan".
- Usa emojis de manera moderada para mantener la cordialidad.
- Eres concisa pero explicas bien lo que se te pide.

Tu misión:
1. Orientar a los residentes sobre cómo usar la plataforma
2. Responder dudas sobre funcionalidades
3. Navegar al usuario a las páginas correctas
4. Ayudar con el onboarding de nuevos usuarios

${NAVIGATION_GUIDE}

Reglas de navegación:
- Si el usuario pregunta cómo hacer algo o quiere ir a una sección, incluye al FINAL de tu respuesta exactamente este formato en una línea separada:
  NAVEGAR:/ruta
- Solo incluye navegación cuando sea claramente útil
- No inventes rutas que no estén en la lista

Funcionalidades Clave y Explicación por PERFIL:
Si el usuario es "admin":
- Puede cobrar gastos, emitir multas, subir comprobantes, configurar la base de datos de departamentos, aprobar/rechazar reservas, y enviar alertas masivas. Los módulos están en su panel de administración.
Si el usuario es "concierge" (Conserje):
- Puede anotar patentes, registrar visitas, recibir paquetería de vecinos, apuntar rondas nocturnas o incidentes. Todo esto en las secciones de conserjería.
Si el usuario es "resident" (Residente):
- Todo trata sobre su departamento y comunidad: pagos online de GC, reservar el quincho en el calendario, votar en la asamblea, vender cosas en marketplace, y relacionarse humanamente.

Instrucciones Críticas de Explicación:
- NUNCA sugieras al usuario ir al "Centro de Capacitación". Tu deber es darles las instrucciones escritas paso a paso directamente aquí en este chat para responder su duda.
- Sé servicial y resolutiva.

Instrucciones Marketplace:
- Si el usuario pregunta por el Marketplace, explícale que puede ir al módulo en el menú izquierdo y ahí podrá vender y comprar artículos libremente con sus vecinos mediante publicaciones. Y ofrécete a llevarlo directamente escribiendo NAVEGAR:/marketplace al final.

Agente de Supermercado "CoCo Supermercado":
- ComunidadConnect cuenta con una funcionalidad integrada de compras llamada "CoCo Supermercado". Si el usuario pide hacer una lista de supermercado o comprar cosas:
  1. Explícale que existe el módulo CoCo Supermercado donde puede hablar con un asistente especializado.
  2. Ofrécete a llevarlo directamente escribiendo NAVEGAR:/resident/supermercado al final.

Si no sabes algo, di honestamente que no tienes esa información y no envíes nunca a capacitaciones.
`;

// ─── Input Validation ─────────────────────────────────────────────────────────
function sanitizeString(value: unknown, maxLength: number): string {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maxLength);
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    // 1. Rate Limit
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? req.headers.get("x-real-ip")
        ?? "unknown";

    if (!checkRateLimit(ip)) {
        return NextResponse.json(
            { reply: "Estoy recibiendo demasiados mensajes en este momento. Por favor espera un minuto e intenta de nuevo. 😊" },
            { status: 429 }
        );
    }

    // 2. No API key configured
    if (!GEMINI_API_KEY) {
        return NextResponse.json(
            { reply: "CoCo no está configurada. Falta GEMINI_API_KEY en las variables de entorno." },
            { status: 200 }
        );
    }

    try {
        const body = await req.json();

        // 3. Input validation & sanitization
        const message = sanitizeString(body.message, 1000);
        const currentPage = sanitizeString(body.currentPage, 100);
        const userName = sanitizeString(body.userName, 80);
        const userRole = sanitizeString(body.userRole, 20);

        if (!message) {
            return NextResponse.json(
                { reply: "Por favor envía un mensaje para que pueda ayudarte. 😊" },
                { status: 400 }
            );
        }

        // 4. Validate role to prevent injection via userRole
        const validRoles = ["admin", "resident", "concierge"];
        const safeRole = validRoles.includes(userRole) ? userRole : "resident";

        const contextNote = `El usuario se llama "${userName}", tiene rol "${safeRole}", y está actualmente en la página "${currentPage}".`;

        const geminiBody = {
            contents: [
                {
                    role: "user",
                    parts: [{ text: `${SYSTEM_PROMPT}\n\nContexto actual: ${contextNote}\n\nUsuario dice: ${message}` }],
                },
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 400,
            },
        };

        const models = [
            "gemini-1.5-flash",
            "gemini-pro",
            "gemini-1.5-flash-latest",
            "gemini-ultra"
        ];
        
        let res: Response | null = null;
        let data: any = null;
        let finalModel = "";

        for (const model of models) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            try {
                const attemptRes = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(geminiBody),
                });
                
                const attemptData = await attemptRes.json();
                
                if (attemptRes.ok) {
                    res = attemptRes;
                    data = attemptData;
                    finalModel = model;
                    break;
                } else {
                    console.warn(`[CoCo API] Model ${model} failed with ${attemptRes.status}:`, attemptData?.error?.message);
                    // Continue to next model
                }
            } catch (e) {
                console.error(`[CoCo API] Fetch failed for ${model}:`, e);
            }
        }

        if (!res || !res.ok) {
            return NextResponse.json(
                { reply: "Lo siento, mis servicios de IA (Google Gemini) no están disponibles en este momento (404/Config). Por favor verifica tu API Key. 🛠️" },
                { status: 200 }
            );
        }

        const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // 5. Extract navigation command if present and validate it
        const navMatch = rawText.match(/NAVEGAR:(\/[a-zA-Z0-9/_-]+)/);
        const navigate = navMatch ? navMatch[1] : undefined;
        const reply = rawText.replace(/NAVEGAR:\/[a-zA-Z0-9/_-]+/g, "").trim();

        return NextResponse.json({ reply, navigate }, { status: 200 });

    } catch (err) {
        console.error("CoCo API error:", err);
        return NextResponse.json(
            { reply: "Tuve un problema al procesar tu solicitud. Inténtalo de nuevo. 😊" },
            { status: 500 }
        );
    }
}
