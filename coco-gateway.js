/**
 * coco-gateway.js — ComunidadConnect
 *
 * npm install @anthropic-ai/sdk express
 * Variables de entorno:
 *   ANTHROPIC_API_KEY
 *   COCO_AGENT_ID          (tras correr setupAgent())
 *   COCO_ENVIRONMENT_ID    (tras correr setupAgent())
 *   COMUNIDAD_API_URL      (ej: https://api.tudominio.com)
 *   REDIS_URL              (opcional)
 *   PORT                   (default 3000)
 */

import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import {
  getWebSession, saveWebSession,
  getWhatsAppSession, saveWhatsAppSession,
  getWhatsAppAuth, setWhatsAppAuth, clearWhatsAppAuth,
  checkRateLimit,
} from "./session-store.js";

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const API = process.env.COMUNIDAD_API_URL;
const BETA = { headers: { "anthropic-beta": "managed-agents-2026-04-01" } };

// ─────────────────────────────────────────────────────────────────────────────
// SETUP — correr UNA SOLA VEZ para registrar el agente en Anthropic
// node --input-type=module <<< "import('./coco-gateway.js').then(m => m.setupAgent())"
// ─────────────────────────────────────────────────────────────────────────────

export async function setupAgent() {
  const agent = await anthropic.beta.agents.create({
    name: "CoCo IA",
    model: "claude-sonnet-4-6",
    system: process.env.COCO_SYSTEM_PROMPT, // contenido de coco-system-prompt.md
    tools: TOOL_DEFINITIONS,
  }, BETA);

  const environment = await anthropic.beta.environments.create({
    name: "coco-prod",
    config: { type: "cloud", networking: { type: "unrestricted" } },
  }, BETA);

  console.log("\n✅ Agente creado. Agrega al .env:\n");
  console.log(`COCO_AGENT_ID=${agent.id}`);
  console.log(`COCO_ENVIRONMENT_ID=${environment.id}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// HERRAMIENTAS
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    name: "get_resident_info",
    description: "Obtiene nombre, depto y comunidad del residente.",
    input_schema: {
      type: "object",
      properties: { unit_id: { type: "string" } },
      required: ["unit_id"],
    },
  },
  {
    name: "get_payment_status",
    description: "Consulta gastos comunes: monto, estado y fecha de vencimiento.",
    input_schema: {
      type: "object",
      properties: {
        unit_id: { type: "string" },
        month: { type: "string", description: "YYYY-MM, opcional" },
      },
      required: ["unit_id"],
    },
  },
  {
    name: "create_claim",
    description: "Registra un reclamo o solicitud de mantención.",
    input_schema: {
      type: "object",
      properties: {
        unit_id: { type: "string" },
        category: {
          type: "string",
          enum: ["MANTENCIÓN", "RUIDO", "ÁREA_COMÚN", "ASCENSOR", "SEGURIDAD", "ESCALACIÓN_URGENTE", "OTRO"],
        },
        description: { type: "string" },
        priority: { type: "string", enum: ["BAJA", "MEDIA", "ALTA", "URGENTE"] },
      },
      required: ["unit_id", "category", "description"],
    },
  },
  {
    name: "get_claim_status",
    description: "Consulta el estado de un reclamo existente.",
    input_schema: {
      type: "object",
      properties: { claim_id: { type: "string" } },
      required: ["claim_id"],
    },
  },
  {
    name: "check_availability",
    description: "Consulta disponibilidad de un espacio común en una fecha.",
    input_schema: {
      type: "object",
      properties: {
        space_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["space_id", "date"],
    },
  },
  {
    name: "create_reservation",
    description: "Reserva un espacio común para el residente.",
    input_schema: {
      type: "object",
      properties: {
        unit_id: { type: "string" },
        space_id: { type: "string" },
        date: { type: "string" },
        start_time: { type: "string" },
        end_time: { type: "string" },
      },
      required: ["unit_id", "space_id", "date", "start_time", "end_time"],
    },
  },
  {
    name: "create_circular",
    description: "Envía una circular a la comunidad. Solo administradores.",
    input_schema: {
      type: "object",
      properties: {
        community_id: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        audience: {
          type: "string",
          enum: ["TODOS", "PROPIETARIOS", "ARRENDATARIOS"],
        },
      },
      required: ["community_id", "title", "body"],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// EJECUCIÓN DE HERRAMIENTAS → llaman a tu API existente
// ─────────────────────────────────────────────────────────────────────────────

async function executeTool(name, input, userCtx) {
  const h = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${userCtx.token}`,
  };
  const call = (path, opts = {}) =>
    fetch(`${API}${path}`, { headers: h, ...opts }).then((r) => r.json());

  switch (name) {
    case "get_resident_info":
      return call(`/residents/${input.unit_id}`);

    case "get_payment_status": {
      const month = input.month || new Date().toISOString().slice(0, 7);
      return call(`/payments/${input.unit_id}?month=${month}`);
    }

    case "create_claim":
      return call("/claims", {
        method: "POST",
        body: JSON.stringify({ ...input, source: "COCO_IA" }),
      });

    case "get_claim_status":
      return call(`/claims/${input.claim_id}`);

    case "check_availability":
      return call(`/spaces/${input.space_id}/availability?date=${input.date}`);

    case "create_reservation":
      return call("/reservations", {
        method: "POST",
        body: JSON.stringify(input),
      });

    case "create_circular":
      if (userCtx.role !== "ADMIN") {
        return { error: "Solo los administradores pueden enviar circulares." };
      }
      return call("/circulars", {
        method: "POST",
        body: JSON.stringify(input),
      });

    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NÚCLEO: enviar un mensaje a CoCo y obtener respuesta
// ─────────────────────────────────────────────────────────────────────────────

async function askCoCo(message, sessionId, userCtx) {
  // Crear sesión nueva si no existe
  if (!sessionId) {
    const session = await anthropic.beta.sessions.create({
      agent: process.env.COCO_AGENT_ID,
      environment_id: process.env.COCO_ENVIRONMENT_ID,
      title: `${userCtx.unit_id} — ${userCtx.channel || "web"}`,
    }, BETA);
    sessionId = session.id;
  }

  // Enviar mensaje
  await anthropic.beta.sessions.events.create(sessionId, {
    events: [{ type: "user.message", content: [{ type: "text", text: message }] }],
  }, BETA);

  // Leer stream + manejar tool calls en tiempo real
  let response = "";
  const stream = await anthropic.beta.sessions.events.stream(sessionId, BETA);

  for await (const event of stream) {
    if (event.type === "agent.message") {
      for (const block of event.content) {
        if (block.type === "text") response += block.text;
      }
    }

    if (event.type === "agent.tool_use") {
      const result = await executeTool(event.name, event.input, userCtx);
      await anthropic.beta.sessions.events.create(sessionId, {
        events: [{
          type: "tool_result",
          tool_use_id: event.id,
          content: JSON.stringify(result),
        }],
      }, BETA);
    }

    if (event.type === "session.status_idle") break;
  }

  return { response, sessionId };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT WEB / MÓVIL
// El usuario ya viene autenticado (JWT verificado por tu middleware)
// POST /chat  →  { message, user_id, unit_id, role, community_id, token }
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
    const userCtx = { unit_id, role, community_id, token, channel: "web" };

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
// POST /webhook/whatsapp
//
// Flujo de auth:
//   Paso 1 — primer mensaje → CoCo pide el número de depto
//   Paso 2 — usuario responde "8B" → verificamos contra tu API
//            (¿ese teléfono está registrado para ese depto?)
//   OK  → sesión autenticada, CoCo atiende normal
//   NOK → hasta 3 intentos, luego bloqueo temporal
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
    // ── ¿Ya está autenticado? ──────────────────────────────────────────────
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

    // ── Flujo de autenticación ─────────────────────────────────────────────
    const auth = (await getWhatsAppAuth(waId)) || { state: "pending", attempts: 0 };

    if (auth.attempts === 0) {
      // Primera vez que escribe → saludar y pedir depto
      await setWhatsAppAuth(waId, { state: "pending", attempts: 1 });
      return twiml(res,
        "👋 Hola, soy *CoCo*, el asistente de tu comunidad.\n\n" +
        "Para ayudarte necesito verificar que eres residente. " +
        "¿Cuál es tu número de depto? (ej: *8B*, *101*, *Casa 3*)"
      );
    }

    // Usuario respondió → verificar en tu API
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

    // Intento fallido
    const attempts = auth.attempts + 1;
    if (attempts > 3) {
      await clearWhatsAppAuth(waId);
      return twiml(res,
        "No pude verificar tu identidad. Si crees que hay un error, " +
        "contacta al administrador de tu comunidad."
      );
    }
    await setWhatsAppAuth(waId, { state: "pending", attempts });
    return twiml(res,
      `No encontré ese depto con tu número. Intento ${attempts - 1}/3. ` +
      "¿Puedes revisar cómo aparece en tu app?"
    );

  } catch (err) {
    console.error("WhatsApp error:", err);
    return twiml(res, "Ocurrió un error. Intenta de nuevo en unos segundos.");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICACIÓN DE RESIDENTE POR WHATSAPP
// Tu API debe tener un endpoint que reciba { phone, unit } y
// devuelva { unit_id, name, role, community_id, community_name, token }
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function twiml(res, text) {
  res.set("Content-Type", "text/xml");
  res.send(`<Response><Message>${esc(text)}</Message></Response>`);
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─────────────────────────────────────────────────────────────────────────────
app.listen(process.env.PORT || 3000, () =>
  console.log(`CoCo Gateway en puerto ${process.env.PORT || 3000}`)
);
