// Authenticated regression checks against a local build or QA_BASE_URL.
// Comparison/seals fixtures exercise the UI; history and total APIs remain live.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { loadEnvFile } = require('./load-env');
loadEnvFile();
const baseUrl = process.env.QA_BASE_URL || 'http://localhost:3012';
const checks = [];

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const communityId = crypto.randomUUID();
  let userId;
  let browser;
  try {
    const community = await admin.from('communities').insert({ id: communityId, name: 'Supermarket integrity QA', subscription_status: 'active' }).select('resident_code').single();
    if (community.error) throw community.error;
    const email = `super-integrity-${crypto.randomUUID()}@qa.convive.local`;
    const password = crypto.randomUUID() + '!Qa7';
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'Integridad QA', invite_code: community.data.resident_code } });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    const session = JSON.stringify(login.data.session);
    const encoded = `base64-${Buffer.from(session).toString('base64url')}`;
    const storageKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const chunks = encoded.match(/.{1,3180}/g);
    await context.addCookies(chunks.map((value, index) => ({ name: chunks.length === 1 ? storageKey : `${storageKey}.${index}`, value, url: baseUrl, sameSite: 'Lax' })));
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: session });
    const api = async (path, method = 'GET', data) => {
      const response = await context.request.fetch(`${baseUrl}/api/supermarket/${path}`, { method, data });
      return { status: response.status(), body: await response.json() };
    };
    assert.equal((await api('history', 'PATCH', { enabled: true })).status, 200);
    assert.equal((await api('history', 'POST', { terms: [{ term: 'leche' }] })).status, 400);
    checks.push('Live API rejects unconfirmed comparison writes');
    const legacy = await admin.from('supermarket_purchase_history').insert([
      { user_id: userId, term: 'legacy milk', created_at: '2026-08-01T12:00:00Z' },
      { user_id: userId, term: 'legacy milk', created_at: '2026-08-02T12:00:00Z' },
    ]);
    if (legacy.error) throw legacy.error;
    assert.deepEqual((await api('history')).body.suggestions, []);
    checks.push('Live history ignores legacy comparisons');
    for (const items of [Array.from({ length: 61 }, () => ({ sku: '111151', quantity: 1 })), [{ sku: '111151', quantity: 100 }], [{ quantity: 1 }]]) {
      assert.equal((await api('real-total', 'POST', { store: 'Jumbo', items })).status, 400);
    }
    checks.push('Live total API rejects truncation and invalid quantities');
    const total = await api('real-total', 'POST', { store: 'Jumbo', items: [{ sku: '111151', quantity: 1 }] });
    assert.equal(total.body.complete, true, JSON.stringify(total.body));
    assert.ok(total.body.total > 0);
    const missing = await api('real-total', 'POST', { store: 'Jumbo', items: [{ sku: '999999999999', quantity: 1 }] });
    assert.equal(missing.body.complete, false);
    assert.equal(missing.body.total, undefined);
    checks.push('Live retailer total succeeds for a real SKU and refuses an unavailable SKU');

    const page = await context.newPage();
    const renderErrors = [];
    page.on('pageerror', error => renderErrors.push(error.message));
    let quantity = 1;
    await page.route(`${baseUrl}/api/supermarket`, async route => {
      const item = { id: 'qa-item', name: 'Producto QA', brand: 'QA', store: 'Jumbo', sku: '111151', price: 2150, quantity, requestedTerm: 'producto QA', requestedQuantity: quantity, requestedUnit: 'un', packUnits: 1, suppliedQuantity: quantity, lineTotal: 2150 * quantity, available: true, source: 'catalog', checked: false };
      await route.fulfill({ json: {
        items: [item], requestedItems: [{ term: item.requestedTerm, quantity, unit: 'un' }], sources: [{ store: 'Jumbo', status: 'ok' }],
        basketOptions: [{ store: 'Jumbo', channelType: 'retail', items: [item], complete: true, coveredCount: 1, requestedCount: 1, subtotal: item.lineTotal, missingTerms: [] }],
      } });
    });
    await page.goto(`${baseUrl}/resident/supermercado`, { waitUntil: 'domcontentloaded' });
    await page.locator('#shopping-list').fill('producto QA');
    await page.getByRole('button', { name: 'Comparar lista', exact: true }).click();
    const record = page.getByRole('button', { name: 'Ya compré esta canasta', exact: true });
    await expect(record).toBeVisible({ timeout: 30000 });
    assert.equal((await admin.from('supermarket_purchase_history').select('id').eq('user_id', userId).eq('confirmed', true)).data.length, 0);
    checks.push('UI comparison does not record a purchase');
    await record.click();
    await expect(page.getByRole('button', { name: 'Compra registrada', exact: true })).toBeDisabled();
    const saved = await admin.from('supermarket_purchase_history').select('term,store,confirmed').eq('user_id', userId).eq('confirmed', true);
    assert.equal(saved.data.length, 1);
    assert.equal(saved.data[0].store, 'Jumbo');
    checks.push('UI explicit confirmation persists the selected purchase');
    await page.getByRole('button', { name: 'Ver total real', exact: true }).click();
    await expect(page.getByText(/Subtotal consultado en Jumbo:/)).toBeVisible({ timeout: 20000 });
    quantity = 2;
    await page.getByRole('button', { name: 'Comparar lista', exact: true }).click();
    await expect(record).toBeVisible();
    await expect(page.getByText(/Subtotal consultado en Jumbo:/)).toHaveCount(0);
    checks.push('A new basket in the same store hides the previous total');
    await page.route(`${baseUrl}/api/supermarket/seals`, route => route.fulfill({ json: { supported: true, seals: {} } }));
    await page.getByRole('button', { name: 'Ver sellos', exact: true }).click();
    await expect(page.getByText('Sin información de sellos', { exact: true })).toBeVisible();
    await expect(page.getByText('Sin sellos informados por la tienda', { exact: true })).toHaveCount(0);
    checks.push('Missing seals data is rendered as unknown');
    await page.getByRole('button', { name: 'Dejar de recordar mis compras', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Activar', exact: true })).toBeVisible();
    const remaining = await admin.from('supermarket_purchase_history').select('id').eq('user_id', userId);
    assert.equal(remaining.data.length, 0);
    assert.equal((await api('history')).body.enabled, false);
    checks.push('UI disabling memory deletes stored rows and persists opt-out');
    assert.deepEqual(renderErrors, []);
    console.log(JSON.stringify({ passed: true, baseUrl, checks }, null, 2));
  } finally {
    if (browser) await browser.close();
    if (userId) {
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error) throw deleted.error;
    }
    const deleted = await admin.from('communities').delete().eq('id', communityId);
    if (deleted.error) throw deleted.error;
  }
}
main().catch(error => { console.error(JSON.stringify({ passed: false, checks, error: error.message })); process.exitCode = 1; });
