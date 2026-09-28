const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { loadEnvFile } = require('./load-env');

loadEnvFile();

const baseUrl = process.env.QA_BASE_URL || 'http://localhost:3012';
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const token = crypto.randomUUID().slice(0, 8);
  const communityId = crypto.randomUUID();
  const email = `super-store-${token}@qa.convive.local`;
  const password = `Store-${token}!2026`;
  let userId;
  let browser;
  try {
    const community = await admin.from('communities').insert({
      id: communityId,
      name: `Supermarket store-first QA ${token}`,
      subscription_status: 'active',
    }).select('resident_code').single();
    if (community.error) throw community.error;
    const created = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { name: 'Residente QA', invite_code: community.data.resident_code },
    });
    if (created.error || !created.data.user) throw created.error || new Error('No se creó el usuario QA.');
    userId = created.data.user.id;
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const signedIn = await auth.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw signedIn.error || new Error('Sin sesión QA.');

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-CL' });
    const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    const serialized = JSON.stringify(signedIn.data.session);
    const encoded = `base64-${Buffer.from(serialized, 'utf8').toString('base64url')}`;
    const chunks = [];
    for (let offset = 0; offset < encoded.length; offset += 3180) chunks.push(encoded.slice(offset, offset + 3180));
    await context.addCookies(chunks.map((value, index) => ({
      name: chunks.length === 1 ? storageKey : `${storageKey}.${index}`,
      value, url: baseUrl, httpOnly: false, secure: false, sameSite: 'Lax',
    })));
    await context.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), { key: storageKey, value: serialized });

    const page = await context.newPage();
    await page.goto(`${baseUrl}/resident/supermercado`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    assert(!page.url().includes('/login'), 'QA session redirected to login');
    await page.getByRole('heading', { name: 'Compra en tu supermercado' }).waitFor();
    assert.equal(await page.getByText('Irurzun').count(), 0, 'Irurzun remains visible');
    const notice = page.getByRole('button', { name: 'Entendido' });
    if (await notice.count()) await notice.click();
    await page.getByRole('button', { name: 'Lider' }).click();
    const milkResponse = page.waitForResponse(response => response.url().includes('/api/supermarket/catalog?') && response.url().includes('q=leche'), { timeout: 30_000 });
    await page.getByRole('searchbox', { name: 'Buscar productos en Lider' }).fill('leche');
    const milkPayload = await (await milkResponse).json();
    assert.equal(milkPayload.products?.length, 24, 'Milk search did not fill the first catalog page');
    assert(milkPayload.hasMore, 'Milk search lost its next page');
    assert(milkPayload.products.some(product => /Leche Natural Entera/i.test(product.name)), 'Ordinary milk is missing from the first page');
    await page.getByText(/Leche Natural Entera/i).first().waitFor({ timeout: 30_000 });
    await page.getByRole('searchbox', { name: 'Buscar productos en Lider' }).fill('pampita');
    await page.getByText(/pan pita/i).first().waitFor({ timeout: 30_000 });
    const card = page.locator('article').filter({ hasText: /pan pita/i }).first();
    assert(await card.locator('img').count() > 0, 'Pan pita lacks product photo');
    assert.match(await card.innerText(), /\$[\d.]+/, 'Pan pita lacks price');
    await card.getByRole('button', { name: 'Agregar' }).click();
    await page.getByRole('heading', { name: 'Tu carro en Lider' }).waitFor();
    assert(await page.getByRole('button', { name: 'Abrir carro asistido en Líder' }).count() > 0, 'Selected cart cannot be transferred');
    await page.getByRole('checkbox', { name: 'Jumbo' }).check();
    const comparisonResponse = page.waitForResponse(response => response.url().endsWith('/api/supermarket') && response.request().method() === 'POST', { timeout: 90_000 });
    await page.getByRole('button', { name: 'Comparar mi carro' }).click();
    const compared = await (await comparisonResponse).json();
    assert(compared.basketOptions?.some(option => option.store === 'Jumbo'), 'Selected supermarket is missing from comparison');
    await page.getByRole('button', { name: 'Revisar productos' }).waitFor({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Revisar productos' }).click();
    await page.getByRole('heading', { name: '4. Revisa y abre el carro en Jumbo' }).waitFor();
    assert(await page.getByRole('button', { name: 'Abrir canasta en Jumbo' }).count() > 0, 'Compared cart cannot be transferred');
    await page.getByRole('button', { name: /Volver a mis productos de Lider/ }).click();
    let handoff;
    await page.route('**/api/supermarket/cart-handoff', async route => {
      handoff = route.request().postDataJSON();
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'QA: no se abre una compra real' }) });
    });
    await page.getByRole('button', { name: 'Abrir carro asistido en Líder' }).click();
    await page.getByText('No se pudo preparar el carro').waitFor();
    assert.equal(handoff.store, 'Lider');
    assert.equal(handoff.items.length, 1);
    assert(handoff.items[0].sku && handoff.items[0].offerId, 'Selected Lider product lost its cart identifiers');
    assert.match(handoff.items[0].name, /pan pita/i);
    assert(await page.getByText('Irurzun').count() === 0, 'Irurzun appeared after comparison');
    await page.screenshot({ path: 'test-results/supermarket-store-first.png', fullPage: true });
    console.log('Store-first supermarket QA passed: store, photo, price, cart, selected comparison, no Irurzun.');
  } finally {
    await browser?.close();
    if (userId) await admin.auth.admin.deleteUser(userId);
    await admin.from('communities').delete().eq('id', communityId);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
