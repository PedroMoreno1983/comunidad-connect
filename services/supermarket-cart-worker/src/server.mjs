import crypto from 'node:crypto';
import http from 'node:http';
import httpProxy from 'http-proxy';
import { createDriver, runCartAutomation } from './automation.mjs';
import { InputError, publicStatus, sanitizeSessionRequest } from './stores.mjs';

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

function sessionFingerprint(userId, payload) {
  return crypto.createHash('sha256').update(JSON.stringify({
    userId,
    store: payload.store,
    directCartUrl: payload.directCartUrl,
    items: payload.items.map(item => [item.id, item.quantity, item.productUrl]),
  })).digest('hex');
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
  if (activeForUser(userId)) {
    return json(response, 409, { error: 'Ya tienes un carro remoto abierto. Ciérralo antes de iniciar otro.' });
  }
  if (!rateAllowed(userId)) {
    return json(response, 429, { error: 'Alcanzaste el límite temporal de aperturas. Intenta nuevamente más tarde.' });
  }

  const slot = slots.find(candidate => !candidate.sessionId);
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

function viewerHtml(session) {
  const vncPath = `${PUBLIC_BASE_PATH.replace(/^\//, '')}/browser/${session.id}/websockify`;
  const vncUrl = `${PUBLIC_BASE_PATH}/browser/${session.id}/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=${encodeURIComponent(vncPath)}`;
  const sessionPath = `${PUBLIC_BASE_PATH}/session/${session.id}`;
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Carro seguro · ${session.store}</title>
  <style>
    :root{color-scheme:light;--ink:#17221d;--muted:#5d6b64;--line:#d9e2dd;--green:#176b45;--cream:#f4f1e8;--white:#fff;--danger:#a2382c}
    *{box-sizing:border-box}html,body{height:100%;margin:0}body{display:grid;grid-template-rows:auto 1fr;background:var(--cream);color:var(--ink);font:15px/1.4 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
    header{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,520px) auto;gap:18px;align-items:center;padding:12px 18px;background:var(--white);border-bottom:1px solid var(--line);box-shadow:0 2px 10px rgba(23,34,29,.08);z-index:2}
    .brand{display:flex;align-items:center;gap:10px;font-weight:800}.brand svg{width:30px;height:30px;color:var(--green)}.store{color:var(--green)}
    .status{min-width:0}.status-row{display:flex;justify-content:space-between;gap:12px;margin-bottom:6px}.detail{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)}progress{display:block;width:100%;height:8px;accent-color:var(--green)}
    .actions{display:flex;gap:8px}button{border:1px solid var(--line);border-radius:10px;padding:9px 12px;background:var(--white);color:var(--ink);font:inherit;font-weight:750;cursor:pointer}button.primary{display:none;border-color:var(--green);background:var(--green);color:#fff}button.danger{color:var(--danger)}button:disabled{cursor:wait;opacity:.6}
    main{min-height:0;padding:10px}iframe{width:100%;height:100%;border:1px solid var(--line);border-radius:14px;background:#e8ece9;box-shadow:0 6px 28px rgba(23,34,29,.10)}
    .privacy{position:fixed;right:22px;bottom:18px;z-index:3;max-width:410px;padding:8px 12px;border-radius:9px;background:rgba(23,34,29,.88);color:#fff;font-size:12px;pointer-events:none}
    @media(max-width:800px){header{grid-template-columns:1fr auto}.status{grid-column:1/-1;grid-row:2}.brand span:first-of-type{display:none}.actions button{padding:8px}.privacy{left:16px;right:16px;bottom:14px}.detail{white-space:normal;max-height:42px}main{padding:6px}}
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 3.5h2l2.2 11.1a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 1.9-1.4L21 8H6"/></svg>
      <span>Carro seguro</span><span class="store">${session.store}</span>
    </div>
    <div class="status" aria-live="polite">
      <div class="status-row"><strong id="state">Iniciando…</strong><span id="counter">0 / ${session.total}</span></div>
      <div id="detail" class="detail">${session.detail}</div>
      <progress id="progress" max="${Math.max(1, session.total)}" value="0"></progress>
    </div>
    <div class="actions">
      <button id="resume" class="primary" type="button">Ya lo resolví · continuar</button>
      <button id="close" class="danger" type="button">Cerrar sesión</button>
    </div>
  </header>
  <main><iframe title="Navegador de compra de ${session.store}" src="${vncUrl}" allow="clipboard-read; clipboard-write"></iframe></main>
  <div class="privacy">Sesión temporal: Convive no registra tus teclas, contraseña ni datos de pago. Revisa productos y cantidades antes de pagar.</div>
  <script>
    const endpoint = ${JSON.stringify(sessionPath)};
    const state = document.querySelector('#state');
    const detail = document.querySelector('#detail');
    const counter = document.querySelector('#counter');
    const progress = document.querySelector('#progress');
    const resume = document.querySelector('#resume');
    const close = document.querySelector('#close');
    const labels = {starting:'Iniciando navegador',loading:'Cargando productos',needs_user:'Necesita tu ayuda',ready:'Carro listo',partial:'Revisión pendiente',failed:'No se pudo completar',closed:'Sesión cerrada'};
    async function refresh(){
      try{
        const response=await fetch(endpoint+'/status',{cache:'no-store'});
        if(!response.ok){state.textContent='Sesión finalizada';detail.textContent='La sesión expiró o se cerró. Vuelve a Convive y carga el carro otra vez.';resume.style.display='none';return;}
        const data=await response.json();
        state.textContent=labels[data.status]||data.status;
        detail.textContent=data.detail||'';
        counter.textContent=String(data.current)+' / '+String(data.total);
        progress.max=Math.max(1,data.total);progress.value=data.current;
        resume.style.display=data.status==='needs_user'?'inline-block':'none';
      }catch{detail.textContent='Reconectando con el navegador seguro…'}
    }
    resume.addEventListener('click',async()=>{resume.disabled=true;await fetch(endpoint+'/resume',{method:'POST'}).catch(()=>null);resume.disabled=false;refresh()});
    close.addEventListener('click',async()=>{close.disabled=true;await fetch(endpoint+'/close',{method:'POST'}).catch(()=>null);window.close();state.textContent='Sesión cerrada';detail.textContent='Ya puedes cerrar esta pestaña.'});
    refresh();setInterval(refresh,1500);
  </script>
</body>
</html>`;
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
  response.end(viewerHtml(session));
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
