const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const extensionPath = path.resolve(__dirname, '..', 'extensions', 'convive-cart-loader');
const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), 'convive-cart-loader-'));

async function main() {
  const context = await chromium.launchPersistentContext(profilePath, {
    headless: true,
    channel: 'chromium',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    await context.route('https://conviveconnect.com/**', route => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html>
        <html>
          <body>
            <h1>Convive test</h1>
            <script>
              window.cartProgress = [];
              window.addEventListener('message', event => {
                if (event.data?.type === 'CONVIVE_CART_LOADER_PROGRESS') {
                  window.cartProgress.push(event.data.payload);
                }
              });
            </script>
          </body>
        </html>`,
    }));

    await context.route('https://super.lider.cl/**', route => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html>
        <html>
          <body>
            <main>
              <h1>Producto Lider test</h1>
              <button
                type="button"
                data-testid="add-to-cart"
                onclick="this.dataset.clicked='yes'; this.textContent='Agregado'"
              >
                Agregar al carro
              </button>
            </main>
          </body>
        </html>`,
    }));

    const source = await context.newPage();
    await source.goto('https://conviveconnect.com/resident/supermercado');
    await source.waitForTimeout(500);

    const extensionReady = await source.evaluate(() => new Promise(resolve => {
      const listener = event => {
        if (event.data?.type === 'CONVIVE_CART_LOADER_READY') {
          window.removeEventListener('message', listener);
          resolve(true);
        }
      };
      window.addEventListener('message', listener);
      window.postMessage({
        source: 'convive-connect',
        type: 'CONVIVE_CART_LOADER_PING',
      }, window.location.origin);
      window.setTimeout(() => resolve(false), 3000);
    }));
    if (!extensionReady) throw new Error('La extensión no respondió al ping de Convive.');

    await source.evaluate(() => {
      window.postMessage({
        source: 'convive-connect',
        type: 'CONVIVE_CART_LOADER_START',
        payload: {
          version: 1,
          store: 'Lider',
          createdAt: new Date().toISOString(),
          items: [
            {
              id: 'milk',
              name: 'Leche test',
              requestedTerm: 'leche',
              quantity: 1,
              productUrl: 'https://super.lider.cl/ip/leche-test',
            },
            {
              id: 'rice',
              name: 'Arroz test',
              requestedTerm: 'arroz',
              quantity: 1,
              productUrl: 'https://super.lider.cl/ip/arroz-test',
            },
          ],
        },
      }, window.location.origin);
    });

    await source.waitForFunction(
      () => window.cartProgress.some(progress => progress.status === 'completed'),
      null,
      { timeout: 20000 },
    );
    const progress = await source.evaluate(() => window.cartProgress.at(-1));
    if (progress.added !== 2 || progress.failed !== 0 || progress.total !== 2) {
      throw new Error(`Progreso final inválido: ${JSON.stringify(progress)}`);
    }
    const retailerTabs = context.pages().filter(page => page.url().startsWith('https://super.lider.cl/')).length;
    if (retailerTabs !== 1) {
      throw new Error(`Se esperaba una sola pestaña de Lider, se encontraron ${retailerTabs}.`);
    }

    console.log(JSON.stringify({
      passed: true,
      extensionReady,
      retailerTabs,
      progress,
    }, null, 2));
  } finally {
    await context.close();
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(profilePath, { recursive: true, force: true });
  });
