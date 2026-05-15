const { chromium } = require('playwright');

const baseUrl = (process.env.QA_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const requireProductionReady = process.env.QA_REQUIRE_PRODUCTION_READY === '1';

const report = {
  passed: false,
  baseUrl,
  failures: [],
  health: null,
};

async function main() {
  const healthRes = await fetch(`${baseUrl}/api/health`, { cache: 'no-store' });
  const health = await healthRes.json().catch(() => null);
  report.health = health;

  if (!healthRes.ok || !health?.ok) {
    report.failures.push(`Health endpoint is not operational: HTTP ${healthRes.status}`);
  }

  if (health?.runtime?.demoEnabled) {
    report.failures.push('Demo mode must be disabled in production mode');
  }

  if (requireProductionReady && !health?.runtime?.productionReady) {
    report.failures.push(`Production integrations are incomplete: ${(health?.runtime?.missingProduction || []).join(', ')}`);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const consoleErrors = [];
  const httpErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().includes('/api/auth/')) {
      httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 30000 });

  const demoAccessCount = await page.getByText(/Acceso demo/i).count();
  const demoAdminCount = await page.getByRole('button', { name: /Administrador/i }).count();
  const realLoginCount = await page.getByRole('button', { name: /^Entrar$/i }).count();

  if (demoAccessCount > 0 || demoAdminCount > 0) {
    report.failures.push('Login still exposes demo access controls');
  }
  if (realLoginCount < 1) {
    report.failures.push('Login does not expose the real credential entry point');
  }

  if (consoleErrors.length) report.failures.push(`Console errors: ${consoleErrors.join(' | ')}`);
  if (httpErrors.length) report.failures.push(`HTTP errors: ${httpErrors.join(' | ')}`);

  await browser.close();

  report.passed = report.failures.length === 0;
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exit(1);
}

main().catch(error => {
  report.failures.push(error.message);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
});
