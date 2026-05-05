/**
 * coco-gateway.js — ComunidadConnect (Arquitectura CoCo IA v2)
 *
 * Usa prompt CoT estructurado, parseo XML y Memory Stream (pgvector).
 */

import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import {
  getWebSession, saveWebSession,
  getWhatsAppSession, saveWhatsAppSession,
  getWhatsAppAuth, setWhatsAppAuth, clearWhatsAppAuth,
  checkRateLimit,
} from "./session-store.js";

// Nuevos módulos de Arquitectura IA
import { PROMPT_RESIDENTE, PROMPT_CONSERJE } from "./src/ai/cocoPrompts.js";
import { CoCoParser } from "./src/ai/cocoParser.js";
import { MemoryService } from "./src/ai/memoryService.js";
import { ActionRouter } from "./src/ai/actionRouter.js";

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const API = process.env.COMUNIDAD_API_URL;

// ─────────────────────────────────────────────────────────────────────────────
// NÚCLEO: enviar un mensaje a CoCo, extraer XML y ejecutar
// ─────────────────────────────────────────────────────────────────────────────

async function askCoCo(message, sessionId, userCtx) {
  // 1. Obtener historial de la sesión (Redis/Memoria)
  // Para simplificar, en este ejemplo asumimos que la sesión a corto plazo 
  // se pasaría en 'messages' de Anthropic.
  // Aquí usamos la Memoria a Largo Plazo (pgvector).
  
  const memories = await MemoryService.getRelevantMemories(
    userCtx.community_id,
    userCtx.unit_id || userCtx.id,
    message,
    5
  );
  
  let memoriesText = "";
  if (memories && memories.length > 0) {
    memoriesText = "\n<recuerdos_relevantes>\n" + 
      memories.map(m => `- [Hace un tiempo, Importancia: ${m.importance}/10]: ${m.content}`).join("\n") +
      "\n</recuerdos_relevantes>\n";
  }

  const basePrompt = (userCtx.role === 'admin' || userCtx.role === 'conserje') 
    ? PROMPT_CONSERJE 
    : PROMPT_RESIDENTE;

  const systemPrompt = basePrompt + memoriesText;

  // 2. Llamada a Claude (messages.create estándar)
  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022", // O el modelo que prefieras usar
    max_tokens: 1500,
    temperature: 0.2,
    system: systemPrompt,
    messages: [
      { role: "user", content: message }
    ]
  });

  const rawText = response.content[0].text;

  // 3. Parsear el XML
  const parsed = CoCoParser.parseLLMResponse(rawText, userCtx.role);

  // 4. Ejecutar la acción
  const actionResult = await ActionRouter.executeAction(userCtx.unit_id, parsed, userCtx);

  // 5. Guardar la nueva interacción como un recuerdo
  // En background (no bloqueamos la respuesta)
  MemoryService.addMemory(
    userCtx.community_id,
    userCtx.unit_id || 'unknown',
    userCtx.role,
    `El residente dijo: "${message}". CoCo interpretó: "${parsed.decision.razon_breve}".`
  ).catch(console.error);

  // Devolvemos la respuesta formateada al usuario
  return { 
    response: parsed.respuestaUsuario, 
    sessionId: sessionId || `sess_${Date.now()}` // Mock session id
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT WEB / MÓVIL
// ─────────────────────────────────────────────────────────────────────────────

app.post("/chat", async (req, res) => {
  const { message, user_id, unit_id, role, community_id, token } = req.body;
  if (!message || !user_id) {
    return res.status(400).json({ error: "Faltan parámetros." });
  }

  const allowed = await checkRateLimit(`web:${user_id}`);
  if (!allowed) {
    return res.status(429).json({ error: "Demasiados mensajes. Espera un momento." });
  }

  try {
    const saved = await getWebSession(user_id);
    const userCtx = { id: user_id, unit_id, role, community_id, token, channel: "web" };

    const { response, sessionId } = await askCoCo(
      message,
      saved?.session_id || null,
      userCtx
    );

    await saveWebSession(user_id, { session_id: sessionId, user_context: userCtx });

    res.json({ response, session_id: sessionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "CoCo no disponible. Intenta de nuevo." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK WHATSAPP (Twilio)
// ─────────────────────────────────────────────────────────────────────────────

app.post("/webhook/whatsapp", async (req, res) => {
  const { Body, WaId: waId } = req.body;
  const message = Body?.trim();
  if (!message || !waId) return res.status(400).send();

  const allowed = await checkRateLimit(`wa:${waId}`, 15);
  if (!allowed) {
    return twiml(res, "Demasiados mensajes en poco tiempo. Espera 1 minuto. 🙏");
  }

  try {
    const session = await getWhatsAppSession(waId);

    if (session?.auth_state === "verified") {
      const { response, sessionId } = await askCoCo(
        message,
        session.session_id,
        { ...session.user_context, channel: "whatsapp" }
      );
      await saveWhatsAppSession(waId, { ...session, session_id: sessionId });
      return twiml(res, response);
    }

    const auth = (await getWhatsAppAuth(waId)) || { state: "pending", attempts: 0 };

    if (auth.attempts === 0) {
      await setWhatsAppAuth(waId, { state: "pending", attempts: 1 });
      return twiml(res,
        "👋 Hola, soy *CoCo*, el asistente de tu comunidad.\n\n" +
        "Para ayudarte necesito verificar que eres residente. " +
        "¿Cuál es tu número de depto? (ej: *8B*, *101*, *Casa 3*)"
      );
    }

    const ok = await verifyResident(waId, message);

    if (ok.success) {
      await clearWhatsAppAuth(waId);
      await saveWhatsAppSession(waId, {
        auth_state: "verified",
        session_id: null,
        user_context: {
          unit_id: ok.unit_id,
          role: ok.role,
          community_id: ok.community_id,
          token: ok.token,
        },
      });
      return twiml(res,
        `¡Listo, ${ok.name}! ✅\n` +
        `Soy CoCo, tu asistente en _${ok.community_name}_. ¿En qué te ayudo?`
      );
    }

    const attempts = auth.attempts + 1;
    if (attempts > 3) {
      await clearWhatsAppAuth(waId);
      return twiml(res,
        "No pude verificar tu identidad. Si crees que hay un error, contacta al administrador de tu comunidad."
      );
    }
    await setWhatsAppAuth(waId, { state: "pending", attempts });
    return twiml(res,
      `No encontré ese depto con tu número. Intento ${attempts - 1}/3. ¿Puedes revisar cómo aparece en tu app?`
    );

  } catch (err) {
    console.error("WhatsApp error:", err);
    return twiml(res, "Ocurrió un error. Intenta de nuevo en unos segundos.");
  }
});

async function verifyResident(waId, unitInput) {
  try {
    const resp = await fetch(`${API}/auth/whatsapp-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: `+${waId}`, unit: unitInput }),
    });
    if (!resp.ok) return { success: false };
    return { success: true, ...(await resp.json()) };
  } catch {
    return { success: false };
  }
}

function twiml(res, text) {
  res.set("Content-Type", "text/xml");
  res.send(`<Response><Message>${esc(text)}</Message></Response>`);
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

app.listen(process.env.PORT || 3000, () =>
  console.log(`CoCo Gateway en puerto ${process.env.PORT || 3000}`)
);
