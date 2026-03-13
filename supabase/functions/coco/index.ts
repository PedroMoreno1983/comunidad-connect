import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// CORS headers for browser requests
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Navigation intents — CoCo will include "navigate:/route" in the reply when relevant
const NAVIGATION_GUIDE = `
Rutas disponibles en la app:
- /home → Inicio / Dashboard principal
- /social → Muro Social (publicaciones de vecinos)
- /chat → Comunidad / Chat (mensajes globales y directos)
- /directorio → Directorio de vecinos
- /amenities → Espacios Comunes / Reservas (piscina, quincho, gym, salón, etc.)
- /expenses → Mis Gastos / Gastos Comunes (pagos del condominio)
- /feed → Avisos Oficiales / Anuncios de la administración
- /profile → Mi Perfil (cambiar nombre, foto, contraseña)
- /votaciones → Votaciones / Consultas comunitarias
- /marketplace → Marketplace / Publicar artículos para vender o intercambiar
`;

const SYSTEM_PROMPT = `Eres CoCo, el asistente virtual inteligente de ComunidadConnect, una plataforma de gestión comunitaria para condominios y edificios residenciales en Chile.

Tu personalidad:
- Amable, directo y profesional pero cercano
- Hablas en español chileno (puedes usar "sí po", "bacán", "wena" ocasionalmente para sonar natural)
- Usas emojis con moderación
- Eres conciso — no más de 3-4 oraciones por respuesta

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

Funcionalidades clave para explicar:
- **Gastos Comunes**: Los residentes pueden ver sus cobros pendientes y pagar online con tarjeta
- **Reservas**: Se reservan por hora. Selecciona el espacio, elige fecha en el calendario, elige horario y confirma
- **Muro Social**: Los vecinos pueden publicar texto o fotos, dar like y comentar
- **Mensajes Directos**: En Comunidad → pestaña "Directos" → busca el vecino y escríbele
- **Mi Perfil**: Editar nombre, cambiar foto, resetear contraseña
- **Avisos**: Solo la administración puede crear avisos oficiales
- **Votaciones**: Participar en consultas comunitarias con voto secreto

Si no sabes algo, di honestamente que no tienes esa información y sugiere contactar a la administración.
`;

Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (!GEMINI_API_KEY) {
        return new Response(
            JSON.stringify({ reply: "CoCo no está configurado aún. Falta la GEMINI_API_KEY en las variables de entorno." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
    }

    try {
        const { message, currentPage, userName, userRole } = await req.json();

        const contextNote = `El usuario se llama "${userName}", tiene rol "${userRole}", y está actualmente en la página "${currentPage}".`;

        const body = {
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

        const res = await fetch(GEMINI_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const data = await res.json();

        if (!res.ok) {
            console.error("[CoCo API] Gemini Error:", data.error?.message);
            if (res.status === 429) {
                return new Response(
                    JSON.stringify({ reply: "🤖 Lo siento, el administrador ha alcanzado el límite de consultas a mi motor de IA. Por favor, inténtalo de nuevo más tarde." }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
                );
            }
            return new Response(
                JSON.stringify({ reply: "🤖 Ups, tuve un problema de conexión con mi motor de IA. Inténtalo de nuevo más tarde." }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
            );
        }

        const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Extract navigation command if present
        const navMatch = rawText.match(/NAVEGAR:(\/\S+)/);
        const navigate = navMatch ? navMatch[1] : undefined;
        const reply = rawText.replace(/NAVEGAR:\/\S+/g, "").trim();

        return new Response(
            JSON.stringify({ reply, navigate }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
    } catch (err) {
        console.error("CoCo API error:", err);
        return new Response(
            JSON.stringify({ reply: "🤖 Ups, tuve un problema al procesar tu solicitud." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
    }
});
