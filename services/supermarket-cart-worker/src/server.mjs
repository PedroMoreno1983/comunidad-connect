import { viewerHtml } from './viewer.mjs';
import crypto from 'node:crypto';
import http from 'node:http';
import httpProxy from 'http-proxy';
import { createDriver, runCartAutomation } from './automation.mjs';
import { InputError, publicStatus, sanitizeSessionRequest, sessionFingerprint } from './stores.mjs';

const PORT = integerEnv('PORT', 4387, 1, 65_535);
const MAX_SESSIONS = integerEnv('MAX_SESSIONS', 3, 1, 3);
const IDLE_MS = integerEnv('SESSION_IDLE_SECONDS', 2_700, 300, 7_200) * 1_000;
const HARD_MS = integerEnv('SESSION_HARD_SECONDS', 5_400, 900, 10_800) * 1_000;
const BODY_LIMIT = 256 * 1024;
const RATE_WINDOW_MS = 60 * 60 * 1_000;
const RATE_LIMIT = 6;

const PUBLIC_URL = requiredUrl('PUBLIC_BASE_URL', { https: true });
const PUBLIC_BASE_PATH = PUBLIC_URL.pathname.replace(/\/+$/, '');
const PUBLIC_ORIGIN = PUBLIC_URL.origin;
const SUPABASE_URL = requiredUrl('SUPABASE_URL', { https: true }).origin;
const SUPABASE_ANON_KEY = requiredEnv('SUPABASE_ANON_KEY');

const slots = [1, 2, 3].slice(0, MAX_SESSIONS).map(number => ({
  id: `browser-${number}`,
  webDriverUrl: `http://browser-${number}:4444/wd/hub`,
  vncUrl: `http://browser-${number}:7900`,
  sessionId: null,
}));
const sessions = new Map();
const userStarts = new Map();
const proxy = httpProxy.createProxyServer({ changeOrigin: true, ws: true });

proxy.on('proxyReq', proxyRequest => {
  proxyRequest.removeHeader('authorization');
  proxyRequest.removeHeader('cookie');
});
proxy.on('proxyReqWs', proxyRequest => {
  proxyRequest.removeHeader('authorization');
  proxyRequest.removeHeader('cookie');
});
proxy.on('error', (_error, _request, response) => {
  if (response && 'writeHead' in response && !response.headersSent) {
    response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('El navegador remoto no respondió.');
  } else if (response && 'destroy' in response) {
    response.destroy();
  }
});

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}.`);
  return value;
}

function requiredUrl(name, options = {}) {
  const value = new URL(requiredEnv(name));
  if (options.https && value.protocol !== 'https:') throw new Error(`${name} debe usar HTTPS.`);
  if (value.username || value.password) throw new Error(`${name} no puede incluir credenciales.`);
  return value;
}

function integerEnv(name, fallback, minimum, maximum) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

function json(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function text(response, status, value) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end(value);
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new InputError('La lista supera el tamaño permitido.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new InputError('El cuerpo JSON no es válido.');
  }
}

function bearerToken(request) {
  const header = request.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function verifyUser(request) {
  const token = bearerToken(request);
  if (!token || token.length > 8_192) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return typeof payload?.id === 'string' && payload.id ? payload.id : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function rateAllowed(userId) {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  const recent = (userStarts.get(userId) || []).filter(timestamp => timestamp >= cutoff);
  if (recent.length >= RATE_LIMIT) return false;
  recent.push(Date.now());
  userStarts.set(userId, recent);
  return true;
}

function viewerToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function sameSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function cookieName(sessionId) {
  return `cc_cart_${sessionId.replaceAll('-', '').slice(0, 20)}`;
}

function cookies(request) {
  return Object.fromEntries(String(request.headers.cookie || '').split(';').flatMap(part => {
    const separator = part.indexOf('=');
    if (separator < 1) return [];
    const key = part.slice(0, separator).trim();
    const raw = part.slice(separator + 1).trim();
    try {
      return [[key, decodeURIComponent(raw)]];
    } catch {
      return [];
    }
  }));
}

function hasViewerAccess(request, session) {
  return sameSecret(cookies(request)[cookieName(session.id)], session.viewerToken);
}

function touch(session) {
  session.expiresAt = Math.min(Date.now() + IDLE_MS, session.hardExpiresAt);
}

function update(session, values) {
  Object.assign(session, values, { updatedAt: Date.now() });
}

function assertOpen(session) {
  if (session.closed || Date.now() >= session.hardExpiresAt) {
    const error = new Error('Sesión cerrada.');
    error.code = 'SESSION_CLOSED';
    throw error;
  }
}

function waitForUser(session, detail) {
  assertOpen(session);
  update(session, { status: 'needs_user', detail });
  if (session.resumeResolve) session.resumeResolve(false);
  return new Promise(resolve => {
    session.resumeResolve = value => {
      session.resumeResolve = null;
      if (value) update(session, { status: 'loading', detail: 'Continuando la carga…' });
      resolve(value);
    };
  });
}

async function disposeDriver(session) {
  const driver = session.driver;
  session.driver = null;
  if (!driver) return;
  await Promise.race([
    driver.quit().catch(() => undefined),
    new Promise(resolve => setTimeout(resolve, 12_000)),
  ]);
}

async function releaseSlot(session) {
  await disposeDriver(session);
  const slot = slots.find(candidate => candidate.id === session.slotId);
  if (slot?.sessionId === session.id) slot.sessionId = null;
}

async function closeSession(session, reason = 'Sesión cerrada.') {
  if (session.closed) return;
  session.closed = true;
  session.resumeResolve?.(false);
  update(session, { status: 'closed', detail: reason });
  await releaseSlot(session);
  sessions.delete(session.id);
}

async function startSession(session, slot) {
  try {
    session.driver = await createDriver(slot.webDriverUrl);
    assertOpen(session);
    await runCartAutomation(session.driver, session, {
      assertOpen: () => assertOpen(session),
      update: values => update(session, values),
      waitForUser: detail => waitForUser(session, detail),
    });
  } catch (error) {
    if (error?.code !== 'SESSION_CLOSED') {
      update(session, {
        status: 'failed',
        detail: 'El navegador no pudo completar la carga. Cierra esta sesión e inténtalo nuevamente.',
      });
    }
    await releaseSlot(session);
  }
}

function existingRetry(userId, fingerprint) {
  const now = Date.now();
  return [...sessions.values()].find(session => (
    !session.closed
    && session.userId === userId
    && session.fingerprint === fingerprint
    && now - session.createdAt < 60_000
  ));
}

function activeForUser(userId) {
  return [...sessions.values()].find(session => !session.closed && session.userId === userId && session.status !== 'failed');
}

function sessionResponse(session) {
  return {
    sessionId: session.id,
    viewerUrl: `${PUBLIC_URL.toString().replace(/\/+$/, '')}/session/${session.id}?token=${encodeURIComponent(session.viewerToken)}`,
    expiresAt: new Date(session.expiresAt).toISOString(),
    plannedCount: session.plannedCount,
    missingItems: session.missingItems,
  };
}

async function slotReady(slot) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await fetch(`${slot.webDriverUrl}/status`, { signal: controller.signal });
    const payload = await response.json();
    return response.ok && payload?.value?.ready === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function pickSlot() {
  const free = slots.filter(candidate => !candidate.sessionId);
  if (free.length === 0) return null;
  const ready = await Promise.all(free.map(slotReady));
  return free[ready.indexOf(true)] || free[0];
}

async function createSession(request, response) {
  const userId = await verifyUser(request);
  if (!userId) return json(response, 401, { error: 'Sesión de Convive inválida o expirada.' });

  let payload;
  try {
    payload = sanitizeSessionRequest(await readJson(request));
  } catch (error) {
    return json(response, error instanceof InputError ? 400 : 500, {
      error: error instanceof InputError ? error.message : 'No se pudo leer la lista.',
    });
  }

  const fingerprint = sessionFingerprint(userId, payload);
  const retry = existingRetry(userId, fingerprint);
  if (retry) return json(response, 200, sessionResponse(retry));

  const existing = activeForUser(userId);
  if (existing) {
    console.log(`[cart] cerrando sesión previa ${existing.id} de usuario ${userId} para iniciar una nueva`);
    await closeSession(existing, 'Reemplazado por nueva compra iniciada.');
  }
  if (!rateAllowed(userId)) {
    return json(response, 429, { error: 'Alcanzaste el límite temporal de aperturas. Intenta nuevamente más tarde.' });
  }

  const slot = await pickSlot();
  if (!slot) {
    return json(response, 503, { error: 'Los tres navegadores están ocupados. Intenta nuevamente en unos minutos.' }, {
      'Retry-After': '60',
    });
  }

  const now = Date.now();
  const session = {
    id: crypto.randomUUID(),
    viewerToken: viewerToken(),
    userId,
    fingerprint,
    slotId: slot.id,
    driver: null,
    resumeResolve: null,
    closed: false,
    createdAt: now,
    updatedAt: now,
    expiresAt: Math.min(now + IDLE_MS, now + HARD_MS),
    hardExpiresAt: now + HARD_MS,
    store: payload.store,
    config: payload.config,
    items: payload.items,
    directCartUrl: payload.directCartUrl,
    plannedCount: payload.plannedCount,
    missingItems: payload.missingItems,
    status: 'starting',
    current: 0,
    total: payload.plannedCount,
    added: 0,
    failed: 0,
    itemName: '',
    detail: `Iniciando navegador seguro para ${payload.store}…`,
  };
  slot.sessionId = session.id;
  sessions.set(session.id, session);
  void startSession(session, slot);
  return json(response, 201, sessionResponse(session));
}

function viewerSession(request, sessionId) {
  const session = sessions.get(sessionId);
  return session && !session.closed && hasViewerAccess(request, session) ? session : null;
}

function safeOrigin(request) {
  const origin = request.headers.origin;
  return !origin || origin === PUBLIC_ORIGIN;
}

function serveViewer(request, response, url, sessionId) {
  const session = sessions.get(sessionId);
  if (!session || session.closed) return text(response, 404, 'La sesión ya no está disponible.');
  const token = url.searchParams.get('token');
  if (token) {
    if (!sameSecret(token, session.viewerToken)) return text(response, 403, 'Enlace de sesión inválido.');
    const maxAge = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1_000));
    response.writeHead(303, {
      'Cache-Control': 'no-store',
      Location: `${PUBLIC_BASE_PATH}/session/${session.id}`,
      'Set-Cookie': `${cookieName(session.id)}=${encodeURIComponent(session.viewerToken)}; Path=${PUBLIC_BASE_PATH}/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
    });
    response.end();
    return;
  }
  if (!hasViewerAccess(request, session)) return text(response, 403, 'La sesión necesita su enlace temporal.');
  touch(session);
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/html; charset=utf-8',
  });
  response.end(viewerHtml(session, PUBLIC_BASE_PATH));
}

function proxyBrowser(request, response, url, sessionId, rest) {
  const session = viewerSession(request, sessionId);
  if (!session) return text(response, 403, 'Acceso de navegador inválido.');
  const slot = slots.find(candidate => candidate.id === session.slotId);
  if (!slot) return text(response, 502, 'Navegador no disponible.');
  touch(session);
  request.url = `${rest || '/'}${url.search}`;
  proxy.web(request, response, { target: slot.vncUrl });
}

async function handleRequest(request, response) {
  const url = new URL(request.url || '/', 'http://worker.local');
  if (url.pathname !== '/health') {
    console.log(`[cart] ${new Date().toISOString()} ${request.method} ${url.pathname}`);
  }
  if (request.method === 'GET' && url.pathname === '/health') {
    const active = slots.filter(slot => slot.sessionId).length;
    return json(response, 200, { ok: true, active, capacity: slots.length });
  }
  if (request.method === 'POST' && url.pathname === '/v1/sessions') return createSession(request, response);

  const viewerMatch = url.pathname.match(/^\/session\/([a-f0-9-]{36})$/);
  if (request.method === 'GET' && viewerMatch) return serveViewer(request, response, url, viewerMatch[1]);

  const statusMatch = url.pathname.match(/^\/session\/([a-f0-9-]{36})\/status$/);
  if (request.method === 'GET' && statusMatch) {
    const session = viewerSession(request, statusMatch[1]);
    if (!session) return json(response, 404, { error: 'Sesión no disponible.' });
    touch(session);
    return json(response, 200, publicStatus(session));
  }

  const actionMatch = url.pathname.match(/^\/session\/([a-f0-9-]{36})\/(resume|close)$/);
  if (request.method === 'POST' && actionMatch) {
    if (!safeOrigin(request)) return json(response, 403, { error: 'Origen no permitido.' });
    const session = viewerSession(request, actionMatch[1]);
    if (!session) return json(response, 404, { error: 'Sesión no disponible.' });
    if (actionMatch[2] === 'resume') {
      session.resumeResolve?.(true);
      touch(session);
      return json(response, 202, { ok: true });
    }
    void closeSession(session, 'Sesión cerrada por el usuario.');
    return json(response, 202, { ok: true }, {
      'Set-Cookie': `${cookieName(session.id)}=; Path=${PUBLIC_BASE_PATH}/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    });
  }

  const browserMatch = url.pathname.match(/^\/browser\/([a-f0-9-]{36})(\/.*)?$/);
  if (request.method === 'GET' && browserMatch) {
    return proxyBrowser(request, response, url, browserMatch[1], browserMatch[2]);
  }
  return json(response, 404, { error: 'Ruta no encontrada.' });
}

const server = http.createServer((request, response) => {
  void handleRequest(request, response).catch(() => {
    if (!response.headersSent) json(response, 500, { error: 'Error interno del navegador seguro.' });
    else response.destroy();
  });
});

server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url || '/', 'http://worker.local');
    const match = url.pathname.match(/^\/browser\/([a-f0-9-]{36})(\/.*)?$/);
    if (!match) return socket.destroy();
    const session = viewerSession(request, match[1]);
    if (!session) return socket.destroy();
    const slot = slots.find(candidate => candidate.id === session.slotId);
    if (!slot) return socket.destroy();
    touch(session);
    request.url = `${match[2] || '/'}${url.search}`;
    proxy.ws(request, socket, head, { target: slot.vncUrl });
  } catch {
    socket.destroy();
  }
});

const expiryTimer = setInterval(() => {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (now >= session.expiresAt || now >= session.hardExpiresAt) {
      void closeSession(session, 'La sesión temporal expiró.');
    }
  }
  for (const [userId, timestamps] of userStarts.entries()) {
    const recent = timestamps.filter(timestamp => timestamp >= now - RATE_WINDOW_MS);
    if (recent.length) userStarts.set(userId, recent);
    else userStarts.delete(userId);
  }
}, 15_000);
expiryTimer.unref();

async function shutdown() {
  clearInterval(expiryTimer);
  server.close();
  await Promise.all([...sessions.values()].map(session => closeSession(session, 'Servicio reiniciado.')));
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`cart-worker listening on ${PORT} with ${slots.length} isolated slots\n`);
});
