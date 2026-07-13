const { chromium } = require('playwright');

const baseUrl = (process.env.QA_BASE_URL || 'https://conviveconnect.com').replace(/\/$/, '');

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
];

// Public-only routes we can reach without authenticating.
const routes = ['/', '/login', '/support', '/soporte'];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const failures = [];

  for (const viewport of viewports) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      try {
        await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          return doc.scrollWidth - doc.clientWidth;
        });
        if (overflow > 4) {
          failures.push({ route, viewport: viewport.name, overflowPx: overflow });
        }
      } catch (error) {
        failures.push({ route, viewport: viewport.name, error: error.message });
      } finally {
        await page.close();
      }
    }
  }

  await browser.close();
  console.log(JSON.stringify({ passed: failures.length === 0, failures }, null, 2));
  if (failures.length) process.exit(1);
}

main();
