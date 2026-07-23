const crypto = require('node:crypto');
const { chromium } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { loadEnvFile } = require('./load-env');

loadEnvFile();

const baseUrl = process.env.QA_BASE_URL || 'http://localhost:3012';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const report = { passed: false, checks: [], screenshots: [], failures: [] };

function assert(condition, message, details = {}) {
  if (!condition) throw Object.assign(new Error(message), { details });
  report.checks.push({ message, details });
}

function luminance([red, green, blue]) {
  const normalized = [red, green, blue].map(value => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return normalized[0] * 0.2126 + normalized[1] * 0.7152 + normalized[2] * 0.0722;
}

function parseRgb(value) {
  const channels = value.match(/\d+(?:\.\d+)?/g);
  if (!channels || channels.length < 3) throw new Error(`Color no reconocido: ${value}`);
  return channels.slice(0, 3).map(Number);
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(parseRgb(foreground)), luminance(parseRgb(background)));
  const darker = Math.min(luminance(parseRgb(foreground)), luminance(parseRgb(background)));
  return (lighter + 0.05) / (darker + 0.05);
}

async function main() {
  if (!supabaseUrl || !serviceKey) throw new Error('Faltan credenciales Supabase para QA visual.');
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = crypto.randomUUID().slice(0, 8);
  const cleanup = { userIds: [], communityIds: [], orderIds: [] };
  let browser;

  try {
    const communityId = crypto.randomUUID();
    cleanup.communityIds.push(communityId);
    const community = await admin.from('communities').insert({
      id: communityId,
      name: `Supermarket UI QA ${runId}`,
      subscription_status: 'active',
    }).select('id,resident_code').single();
    if (community.error || !community.data) throw community.error || new Error('No se creó la comunidad QA.');

    const password = `Visual-${runId}!2026`;
    const users = [];
    for (const definition of [
      { email: `super-ui-owner-${runId}@qa.convive.local`, name: 'Organizador QA' },
      { email: `super-ui-neighbor-${runId}@qa.convive.local`, name: 'Vecina QA' },
    ]) {
      const created = await admin.auth.admin.createUser({
        email: definition.email,
        password,
        email_confirm: true,
        user_metadata: {
          name: definition.name,
          invite_code: community.data.resident_code,
        },
      });
      if (created.error || !created.data.user) throw created.error || new Error('No se creó el usuario QA.');
      cleanup.userIds.push(created.data.user.id);
      users.push({ ...definition, id: created.data.user.id });
    }

    const authCheck = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const directSignIn = await authCheck.auth.signInWithPassword({
      email: users[0].email,
      password,
    });
    assert(!directSignIn.error, 'Temporary QA credentials authenticate directly', { error: directSignIn.error?.message });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: 'es-CL',
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const session = directSignIn.data.session;
    if (!session) throw new Error('Supabase no devolvió sesión para el usuario QA.');
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
      secure: false,
      sameSite: 'Lax',
    })));
    await context.addInitScript(({ key, value }) => {
      window.localStorage.setItem(key, value);
    }, { key: storageKey, value: serializedSession });

    const page = await context.newPage();
    const renderErrors = [];
    page.on('pageerror', error => renderErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') renderErrors.push(message.text());
    });
    await page.goto(`${baseUrl}/resident/supermercado`, { waitUntil: 'networkidle' });
    if (new URL(page.url()).pathname.includes('/login')) {
      throw new Error('La sesión temporal QA no fue aceptada por el middleware local.');
    }

    await page.waitForTimeout(3_000);
    if (await page.getByRole('tab', { name: /Comparar mi lista/i }).count() === 0) {
      const bodyText = (await page.locator('body').innerText()).slice(0, 800);
      await page.screenshot({ path: 'C:\\tmp\\supermarket-ui-diagnostic.png', fullPage: true });
      throw Object.assign(new Error('La vista de Supermercado no mostró sus modos de compra.'), {
        details: { url: page.url(), bodyText, renderErrors },
      });
    }
    assert(await page.getByRole('tab', { name: /Comprar en comunidad/i }).isVisible(), 'Both purchase modes are visible');
    assert(await page.getByText('Tu lista completa,', { exact: false }).isVisible(), 'The personal shopping hero is visible');

    const colors = await page.getByText('sin productos ocultos.', { exact: false }).evaluate(element => {
      const section = element.closest('section');
      return {
        foreground: getComputedStyle(element).color,
        background: section ? getComputedStyle(section).backgroundColor : 'rgb(255,255,255)',
      };
    });
    const contrastRatio = contrast(colors.foreground, colors.background);
    assert(contrastRatio >= 4.5, 'Hero accent meets readable contrast', { contrastRatio, ...colors });

    const products = [
      '2 arroz',
      'leche',
      'huevos x 12',
      'aceite',
      'pan 2',
      'tomates',
      'cebolla 3',
      'papas',
      'detergente',
      'papel higiénico 2',
      'café',
      'azúcar',
      'sal',
      'yogurt 6',
      'avena',
    ];
    await page.locator('#shopping-list').fill(products.join('\n'));
    await page.getByRole('button', { name: 'Comparar lista' }).click();
    await page.getByText(/Encontramos \d+ de 15 productos/).waitFor({ timeout: 90_000 });
    assert(await page.getByText(/Encontramos \d+ de 15 productos/).isVisible(), 'Coverage reports all fifteen requests');
    assert(await page.getByText(/^Pediste:/).count() === 15, 'All fifteen requested rows remain visible');
    assert((await page.locator('#shopping-list').inputValue()).includes('avena'), 'The original list remains editable after comparison');

    const desktopPath = 'C:\\tmp\\supermarket-ui-desktop.png';
    await page.screenshot({ path: desktopPath, fullPage: true });
    report.screenshots.push(desktopPath);

    await page.getByRole('tab', { name: /Comprar en comunidad/i }).click();
    await page.getByRole('heading', { name: /Una lista común/i }).waitFor();
    assert(new URL(page.url()).searchParams.get('mode') === 'group', 'Community mode has a shareable URL state');
    assert(await page.getByText('Crea y comparte').isVisible(), 'Community flow explains how to invite and participate');

    const title = `Compra visual ${runId}`;
    await page.getByLabel('Nombre').fill(title);
    await page.getByLabel('Tu lista inicial').fill('arroz 2');
    await page.getByRole('button', { name: 'Crear compra' }).click();
    await page.getByRole('heading', { name: title }).waitFor({ timeout: 30_000 });

    const order = await admin.from('supermarket_group_orders')
      .select('id')
      .eq('community_id', communityId)
      .eq('title', title)
      .single();
    if (order.error || !order.data) throw order.error || new Error('No se recuperó la compra QA.');
    cleanup.orderIds.push(order.data.id);

    await page.getByRole('article').filter({ hasText: title }).getByRole('button', { name: 'Invitar' }).click();
    await page.waitForTimeout(300);
    const sharedText = await page.evaluate(() => navigator.clipboard.readText());
    assert(
      sharedText.includes(`mode=group&order=${order.data.id}`),
      'Invitation copies a direct link to the exact group order',
    );

    const member = await admin.from('supermarket_group_order_members').upsert({
      order_id: order.data.id,
      community_id: communityId,
      user_id: users[1].id,
    }, { onConflict: 'order_id,user_id' });
    const contribution = await admin.from('supermarket_group_order_items').upsert({
      order_id: order.data.id,
      community_id: communityId,
      user_id: users[1].id,
      requested_term: 'leche',
      quantity: 3,
    }, { onConflict: 'order_id,user_id,requested_term' });
    if (member.error || contribution.error) throw member.error || contribution.error;

    const selectedItems = [
      {
        requestedTerm: 'arroz',
        requestedQuantity: 2,
        name: 'Arroz QA',
        store: 'Lider',
        price: 1500,
        quantity: 2,
        packUnits: 1,
        suppliedQuantity: 2,
        lineTotal: 3000,
      },
      {
        requestedTerm: 'leche',
        requestedQuantity: 3,
        name: 'Leche QA',
        store: 'Lider',
        price: 1333,
        quantity: 3,
        packUnits: 1,
        suppliedQuantity: 3,
        lineTotal: 4000,
      },
    ];
    const locked = await admin.from('supermarket_group_orders').update({
      status: 'locked',
      selected_store: 'Lider',
      selected_total: 7000,
      selected_channel_type: 'retail',
      retailer_url: 'https://super.lider.cl',
      selected_items: selectedItems,
    }).eq('id', order.data.id);
    if (locked.error) throw locked.error;

    await page.reload({ waitUntil: 'networkidle' });
    const orderCard = page.locator(`#group-order-${order.data.id}`);
    await orderCard.getByText('Quién paga cuánto').waitFor();
    assert(await orderCard.getByText('Organizador QA', { exact: true }).first().isVisible(), 'Settlement names the organizer');
    assert(await orderCard.getByText('Vecina QA', { exact: true }).first().isVisible(), 'Settlement names the invited participant');
    assert(await orderCard.getByText('Debe pagar a Organizador QA').isVisible(), 'Settlement identifies who receives payment');
    assert(await orderCard.getByText('$3.000', { exact: true }).isVisible() && await orderCard.getByText('$4.000', { exact: true }).isVisible(), 'Settlement displays exact participant amounts');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    assert(dimensions.scrollWidth <= dimensions.viewportWidth + 1, 'Mobile layout has no horizontal overflow', dimensions);
    const mobilePath = 'C:\\tmp\\supermarket-ui-mobile.png';
    await page.screenshot({ path: mobilePath, fullPage: true });
    report.screenshots.push(mobilePath);

    report.passed = true;
  } finally {
    if (browser) await browser.close();
    for (const orderId of cleanup.orderIds) {
      await admin.from('supermarket_group_orders').delete().eq('id', orderId);
    }
    for (const userId of cleanup.userIds) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
    if (cleanup.communityIds.length) {
      await admin.from('communities').delete().in('id', cleanup.communityIds);
    }
  }
}

main()
  .then(() => console.log(JSON.stringify(report, null, 2)))
  .catch(error => {
    report.failures.push({ message: error.message, details: error.details || {} });
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  });
