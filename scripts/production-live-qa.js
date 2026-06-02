const baseUrl = (process.env.QA_LIVE_BASE_URL || 'https://conviveconnect.com').replace(/\/$/, '');

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  passed: false,
  checks: [],
  failures: [],
};

function pass(message, details = {}) {
  report.checks.push({ message, details });
}

function fail(message, details = {}) {
  report.failures.push({ message, details });
}

async function readJson(path) {
  const response = await fetch(`${baseUrl}${path}`, { cache: 'no-store' });
  const data = await response.json().catch(() => null);
  return { response, data };
}

async function readText(path) {
  const response = await fetch(`${baseUrl}${path}`, { cache: 'no-store' });
  const text = await response.text().catch(() => '');
  return { response, text };
}

async function main() {
  const health = await readJson('/api/health');
  if (!health.response.ok || !health.data?.ok) {
    fail(`Health endpoint is not operational: HTTP ${health.response.status}`, health.data || {});
  } else {
    pass('Health endpoint responds', { status: health.data.status });
  }

  if (health.data?.runtime?.productionReady) {
    pass('Production integrations are ready');
  } else {
    fail('Production integrations are incomplete', {
      missingProduction: health.data?.runtime?.missingProduction || [],
    });
  }

  const whatsapp = await readJson('/api/whatsapp/status');
  if (!whatsapp.response.ok) {
    fail(`WhatsApp status endpoint failed: HTTP ${whatsapp.response.status}`);
  } else if (!whatsapp.data?.configured || !whatsapp.data?.webhookConfigured) {
    fail('WhatsApp is not fully configured', {
      configured: Boolean(whatsapp.data?.configured),
      webhookConfigured: Boolean(whatsapp.data?.webhookConfigured),
      requiredEnv: whatsapp.data?.requiredEnv || {},
      webhookUrl: whatsapp.data?.webhookUrl,
    });
  } else {
    pass('WhatsApp is configured', { webhookUrl: whatsapp.data.webhookUrl });
  }

  const sitemap = await readText('/sitemap.xml');
  if (!sitemap.response.ok || !sitemap.text.includes(`${baseUrl}/support`)) {
    fail('Sitemap is missing required public routes', { status: sitemap.response.status });
  } else {
    pass('Sitemap exposes support route');
  }

  const robots = await readText('/robots.txt');
  if (!robots.response.ok || !robots.text.includes(`${baseUrl}/sitemap.xml`)) {
    fail('Robots.txt is missing canonical sitemap', { status: robots.response.status });
  } else {
    pass('Robots.txt points to canonical sitemap');
  }

  report.passed = report.failures.length === 0;
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exit(1);
}

main().catch((error) => {
  fail(error.message);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
});
