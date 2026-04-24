/**
 * session-store.js — CoCo Gateway
 *
 * Maneja sesiones para los tres canales:
 *   - Web / Móvil: el usuario ya viene autenticado (JWT)
 *   - WhatsApp: flujo de auth propio por número de teléfono
 *
 * Usa Redis si está disponible, si no cae a memoria (útil en desarrollo).
 * npm install ioredis
 */

let redis = null;

async function getRedis() {
  if (redis) return redis;
  try {
    const { default: Redis } = await import("ioredis");
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
    redis.on("error", () => {
      console.warn("Redis no disponible, usando memoria.");
      redis = null;
    });
    return redis;
  } catch {
    return null;
  }
}

// ── Fallback en memoria ──────────────────────────────────────────────────────
const memStore = new Map();

async function memGet(key) {
  const entry = memStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memStore.delete(key);
    return null;
  }
  return entry.value;
}

async function memSet(key, value, ttlSeconds) {
  memStore.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

async function memDel(key) {
  memStore.delete(key);
}

// ── Capa de abstracción ──────────────────────────────────────────────────────
async function get(key) {
  const r = await getRedis();
  if (r) {
    const raw = await r.get(key);
    return raw ? JSON.parse(raw) : null;
  }
  return memGet(key);
}

async function set(key, value, ttlSeconds = 86400) {
  const r = await getRedis();
  if (r) {
    await r.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } else {
    await memSet(key, value, ttlSeconds);
  }
}

async function del(key) {
  const r = await getRedis();
  if (r) await r.del(key);
  else await memDel(key);
}

// ── Sesiones de chat (Web / Móvil) ──────────────────────────────────────────
// Clave: session:web:{user_id}
// TTL: 24 horas (se renueva con cada mensaje)

export async function getWebSession(userId) {
  return get(`session:web:${userId}`);
}

export async function saveWebSession(userId, data) {
  // data = { session_id, user_context }
  await set(`session:web:${userId}`, {
    ...data,
    last_activity: Date.now(),
  });
}

export async function deleteWebSession(userId) {
  await del(`session:web:${userId}`);
}

// ── Sesiones de WhatsApp ─────────────────────────────────────────────────────
// Clave: session:wa:{waId}  (waId = número e.g. "56912345678")
// TTL: 8 horas (una jornada típica de atención)

export async function getWhatsAppSession(waId) {
  return get(`session:wa:${waId}`);
}

export async function saveWhatsAppSession(waId, data) {
  // data = { session_id, user_context, auth_state }
  await set(`session:wa:${waId}`, {
    ...data,
    last_activity: Date.now(),
  }, 28800); // 8 horas
}

export async function deleteWhatsAppSession(waId) {
  await del(`session:wa:${waId}`);
}

// ── Auth de WhatsApp ─────────────────────────────────────────────────────────
// Flujo: el residente manda su número de depto → el sistema busca si ese
// teléfono está registrado en ComunidadConnect → si sí, lo autentica.
//
// Estado de auth durante el proceso (TTL corto: 10 minutos):
//   pending  → esperando que el usuario ingrese su depto
//   verified → autenticado y listo

export async function getWhatsAppAuth(waId) {
  return get(`auth:wa:${waId}`);
}

export async function setWhatsAppAuth(waId, data) {
  // data = { state: "pending" | "verified", attempts, ... }
  await set(`auth:wa:${waId}`, data, 600); // 10 minutos
}

export async function clearWhatsAppAuth(waId) {
  await del(`auth:wa:${waId}`);
}

// ── Rate limiting simple ─────────────────────────────────────────────────────
// Máximo N mensajes por usuario por minuto

export async function checkRateLimit(key, maxPerMinute = 20) {
  const rlKey = `rl:${key}:${Math.floor(Date.now() / 60000)}`;
  const r = await getRedis();

  if (r) {
    const count = await r.incr(rlKey);
    if (count === 1) await r.expire(rlKey, 60);
    return count <= maxPerMinute;
  }

  // Fallback en memoria
  const current = (await memGet(rlKey)) || 0;
  await memSet(rlKey, current + 1, 60);
  return current < maxPerMinute;
}
