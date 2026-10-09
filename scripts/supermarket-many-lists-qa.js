// QA: prueba muchas listas de supermercado desde una cuenta de residente temporal.
// Crea comunidad + residente de prueba, inyecta la sesión en Playwright y envía
// listas variadas a /api/supermarket (la primera a través de la UI real del comparador).
// Uso: node scripts/supermarket-many-lists-qa.js  (requiere dev server y .env.local)
const crypto = require('node:crypto');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { loadEnvFile } = require('./load-env');

loadEnvFile();

const baseUrl = process.env.QA_BASE_URL || 'http://localhost:3000';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const EXPECTED_STORES = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'aCuenta'];

const DEFAULT_LISTS = [
  { name: 'Abarrotes básicos', lines: ['arroz', 'fideos', 'aceite', 'sal', 'azúcar'] },
  { name: 'Cantidades y formatos', lines: ['2 arroz', 'leche x 6', 'huevos x12', 'pan 2'] },
  { name: 'Unidades explícitas', lines: ['1 kg de arroz', '2 litros de leche', '500g de fideos', '1 kilo de tomates'] },
  { name: 'Desayuno', lines: ['café', 'leche', 'pan de molde', 'mantequilla', 'mermelada', 'azúcar', 'té'] },
  { name: 'Almuerzo completo', lines: ['fideos', 'salsa de tomate', 'carne molida', 'cebolla', 'ajo', 'aceite', 'queso rallado'] },
  { name: 'Asado fin de semana', lines: ['carne', 'pollo', 'chorizo', 'carbón', 'papas', 'ensalada', 'bebida', 'pan'] },
  { name: 'Limpieza del hogar', lines: ['detergente', 'cloro', 'papel higiénico', 'esponja', 'limpiapisos', 'lavavajillas'] },
  { name: 'Higiene personal', lines: ['shampoo', 'pasta de dientes', 'jabón', 'desodorante', 'papel higiénico', 'toalla de papel'] },
  { name: 'Frutas y verduras', lines: ['tomates', 'cebolla', 'papas', 'palta', 'manzanas', 'plátanos', 'limones', 'lechuga'] },
  { name: 'Bebestibles', lines: ['coca cola', 'agua mineral', 'jugo de naranja', 'cerveza', 'vino tinto'] },
  { name: 'Bebé y mascota', lines: ['pañales', 'comida de perro', 'comida de gato', 'toallitas húmedas'] },
  { name: 'Productos poco comunes', lines: ['quinoa', 'leche de almendras', 'salsa de soya', 'curry', 'palmitos'] },
  { name: 'Términos ambiguos', lines: ['algo para picar', 'queso', 'pan', 'dulces'] },
  { name: 'Lista grande 30 productos', lines: [
    'arroz', 'fideos', 'aceite', 'sal', 'azúcar', 'harina', 'café', 'té', 'leche', 'huevos',
    'pan de molde', 'mantequilla', 'queso', 'jamón', 'pollo', 'carne molida', 'atún', 'tomates',
    'cebolla', 'papas', 'palta', 'manzanas', 'plátanos', 'limones', 'detergente', 'cloro',
    'papel higiénico', 'shampoo', 'pasta de dientes', 'agua mineral',
  ] },
  { name: 'Lista mensual 40 productos', lines: [
    'arroz', 'fideos', 'aceite', 'sal', 'azúcar', 'harina', 'café', 'té', 'leche', 'huevos',
    'pan de molde', 'mantequilla', 'queso', 'jamón', 'pollo', 'carne molida', 'atún', 'sardinas',
    'tomates', 'cebolla', 'papas', 'palta', 'manzanas', 'plátanos', 'limones', 'lechuga', 'ajo',
    'avena', 'mermelada', 'yogurt', 'detergente', 'cloro', 'papel higiénico', 'shampoo',
    'pasta de dientes', 'jabón', 'agua mineral', 'coca cola', 'jugo de naranja',
  ] },
  { name: 'Lista máxima 50 productos', lines: [
    'arroz', 'fideos', 'aceite', 'sal', 'azúcar', 'harina', 'café', 'té', 'leche', 'huevos',
    'pan de molde', 'mantequilla', 'queso', 'jamón', 'pollo', 'carne molida', 'atún', 'sardinas',
    'tomates', 'cebolla', 'papas', 'palta', 'manzanas', 'plátanos', 'limones', 'lechuga', 'ajo',
    'avena', 'mermelada', 'yogurt', 'detergente', 'cloro', 'papel higiénico', 'shampoo',
    'pasta de dientes', 'jabón', 'agua mineral', 'coca cola', 'jugo de naranja', 'cerveza',
    'vino tinto', 'galletas', 'chocolate', 'mayonesa', 'ketchup', 'mostaza', 'choclo', 'porotos',
    'quinoa', 'leche de almendras',
  ] },
];

const LISTS = process.env.QA_LISTS_FILE
  ? JSON.parse(fs.readFileSync(process.env.QA_LISTS_FILE, 'utf8'))
  : DEFAULT_LISTS;

// Permite correr un subconjunto: LIST_INDICES="14,15" node scripts/supermarket-many-lists-qa.js
const ACTIVE_LISTS = process.env.LIST_INDICES
  ? process.env.LIST_INDICES.split(',').map(i => LISTS[Number(i.trim())]).filter(Boolean)
  : LISTS;

async function main() {
  if (!supabaseUrl || !serviceKey) throw new Error('Faltan credenciales Supabase para QA.');
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = crypto.randomUUID().slice(0, 8);
  const cleanup = { userIds: [], communityIds: [] };
  const report = { passed: false, runId, results: [], failures: [] };
  let browser;

  try {
    const communityId = crypto.randomUUID();
    cleanup.communityIds.push(communityId);
    const community = await admin.from('communities').insert({
      id: communityId,
      name: `Supermarket Lists QA ${runId}`,
      subscription_status: 'active',
    }).select('id,resident_code').single();
    if (community.error || !community.data) throw community.error || new Error('No se creó la comunidad QA.');

    const password = `Lists-${runId}!2026`;
    const email = `super-lists-${runId}@qa.convive.local`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: 'Residente QA Listas', invite_code: community.data.resident_code },
    });
    if (created.error || !created.data.user) throw created.error || new Error('No se creó el residente QA.');
    cleanup.userIds.push(created.data.user.id);

    const authCheck = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const directSignIn = await authCheck.auth.signInWithPassword({ email, password });
    if (directSignIn.error) throw directSignIn.error;
    const session = directSignIn.data.session;
    if (!session) throw new Error('Supabase no devolvió sesión para el residente QA.');

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: 'es-CL',
    });
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    const serializedSession = JSON.stringify(session);
    const encodedSession = `base64-${Buffer.from(serializedSession, 'utf8').toString('base64url')}`;
    const cookieChunks = [];
    for (let offset = 0; offset < encodedSession.length; offset += 3180) {
      cookieChunks.push(encodedSession.slice(offset, offset + 3180));
    }
    await context.addCookies(cookieChunks.map((value, index) => ({
      name: cookieChunks.length === 1 ? storageKey : `${storageKey}.${index}`,
      value,
      url: baseUrl,
      httpOnly: false,
      secure: baseUrl.startsWith('https'),
      sameSite: 'Lax',
    })));
    await context.addInitScript(({ key, value }) => {
      window.localStorage.setItem(key, value);
    }, { key: storageKey, value: serializedSession });

    const page = await context.newPage();
    await page.goto(`${baseUrl}/resident/supermercado/comparador`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    if (new URL(page.url()).pathname.includes('/login')) {
      throw new Error('La sesión del residente QA no fue aceptada; redirigió a /login.');
    }
    try {
      await page.getByRole('heading', { name: /Compara tu compra/i }).waitFor({ timeout: 60_000 });
    } catch (e) {
      const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 1000);
      await page.screenshot({ path: 'C:\\tmp\\supermarket-lists-diagnostic.png', fullPage: true }).catch(() => undefined);
      throw Object.assign(new Error('No apareció el comparador.'), {
        details: { url: page.url(), bodyText },
      });
    }

    const sendListViaApi = async (message) => page.evaluate(async (msg) => {
      const t0 = performance.now();
      const response = await fetch('/api/supermarket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      const ms = Math.round(performance.now() - t0);
      let data = null;
      try { data = await response.json(); } catch { /* body no-JSON */ }
      return { status: response.status, ms, data };
    }, message);

    for (const [index, list] of ACTIVE_LISTS.entries()) {
      const message = list.lines.join('\n');
      const result = { list: list.name, items: list.lines.length, issues: [] };
      let payload;
      try {
        let status;
        let ms;
        if (index === 0) {
          // Primera lista: flujo completo por la UI del comparador
          await page.locator('#shopping-list').fill(message);
          const responsePromise = page.waitForResponse(r => (
            r.url().endsWith('/api/supermarket') && r.request().method() === 'POST'
          ), { timeout: 120_000 });
          await page.getByRole('button', { name: /^Comparar / }).click();
          const uiResponse = await responsePromise;
          status = uiResponse.status();
          payload = await uiResponse.json();
          ms = -1;
        } else {
          ({ status, ms, data: payload } = await sendListViaApi(message));
        }
        result.status = status;
        result.ms = ms;

        if (status !== 200 || !payload) {
          result.issues.push(`HTTP ${status}: ${payload?.error || payload?.message || 'sin cuerpo JSON'}`);
        } else {
          const baskets = payload.basketOptions || [];
          result.stores = baskets.map(b => ({
            store: b.store,
            subtotal: b.subtotal,
            covered: `${b.coveredCount}/${b.requestedCount}`,
            complete: !!b.complete,
          }));
          result.recommendedStore = payload.recommendedStore || null;
          if (process.env.QA_DETAIL === '1') {
            result.recommendedItems = baskets.find(b => b.store === result.recommendedStore)?.items?.map(item => ({
              requestedTerm: item.requestedTerm,
              name: item.name,
              requestedQuantity: item.requestedQuantity,
              requestedUnit: item.requestedUnit,
              quantity: item.quantity,
              lineTotal: item.lineTotal,
            })) || [];
          }
          result.missingTerms = payload.missingTerms || [];
          result.degradedStores = payload.degradedStores || [];
          result.mode = payload.mode;

          // Validaciones
          const storeNames = baskets.map(b => b.store);
          const missing = EXPECTED_STORES.filter(s => !storeNames.includes(s));
          const extra = storeNames.filter(s => !EXPECTED_STORES.includes(s));
          if (missing.length) result.issues.push(`Faltan tiendas en la comparación: ${missing.join(', ')}`);
          if (extra.length) result.issues.push(`Tiendas inesperadas: ${extra.join(', ')}`);
          if (new Set(storeNames).size !== storeNames.length) result.issues.push('Tiendas duplicadas en la comparación');

          const withCoverage = baskets.filter(b => b.coveredCount > 0);
          if (withCoverage.length === 0) result.issues.push('Ninguna tienda cubrió ningún producto');

          for (const b of baskets) {
            for (const item of b.items || []) {
              if (!(item.price > 0)) result.issues.push(`Precio inválido en ${b.store}: ${item.name} (${item.price})`);
              if (item.totalPrice != null && !(item.totalPrice >= item.price)) {
                result.issues.push(`totalPrice < price en ${b.store}: ${item.name}`);
              }
            }
            const subtotalCalc = (b.items || []).reduce((acc, item) => acc + (
              item.lineTotal ?? item.totalPrice ?? (item.price ?? 0) * (item.quantity ?? item.userQuantity ?? 1)
            ), 0);
            if (b.items?.length && b.subtotal != null && Math.abs(subtotalCalc - b.subtotal) > 1) {
              result.issues.push(`Subtotal inconsistente en ${b.store}: reportado ${b.subtotal} vs calculado ${subtotalCalc}`);
            }
          }

          const complete = baskets.filter(b => b.complete).sort((a, b) => a.subtotal - b.subtotal);
          if (complete.length > 0 && result.recommendedStore && result.recommendedStore !== complete[0].store) {
            result.issues.push(`Recomendada ${result.recommendedStore} pero la completa más barata es ${complete[0].store}`);
          }
          if (!result.recommendedStore && withCoverage.length > 0) {
            result.issues.push('No se recomendó ninguna tienda pese a haber cobertura');
          }
        }
      } catch (error) {
        result.issues.push(`Excepción: ${error.message}`);
      }
      result.ok = result.issues.length === 0;
      if (!result.ok && payload) {
        const fs = require('node:fs');
        fs.mkdirSync('C:/tmp', { recursive: true });
        fs.writeFileSync(
          `C:/tmp/payload-${list.name.replace(/[^a-z0-9]+/gi, '_')}.json`,
          JSON.stringify(payload, null, 2),
        );
      }
      report.results.push(result);
      console.error(`[${index + 1}/${ACTIVE_LISTS.length}] ${list.name}: ${result.ok ? 'OK' : 'ISSUES'}`);
    }

    report.passed = report.results.every(r => r.ok);
  } finally {
    if (browser) await browser.close();
    for (const userId of cleanup.userIds) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
    if (cleanup.communityIds.length) {
      await admin.from('communities').delete().in('id', cleanup.communityIds);
    }
  }

  return report;
}

main()
  .then(report => {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.passed ? 0 : 1);
  })
  .catch(error => {
    console.error(JSON.stringify({ passed: false, failures: [{ message: error.message }] }, null, 2));
    process.exit(1);
  });
