const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const extensionPath = path.resolve(__dirname, '..', 'extensions', 'convive-cart-loader');
const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), 'convive-cart-loader-'));
const stores = [
  {
    name: 'Lider',
    route: 'https://super.lider.cl/**',
    origin: 'https://super.lider.cl',
    productPath: product => `/ip/test/${product}`,
  },
  {
    name: 'Jumbo',
    route: 'https://www.jumbo.cl/**',
    origin: 'https://www.jumbo.cl',
    productPath: product => `/${product}/p`,
  },
  {
    name: 'Santa Isabel',
    route: 'https://www.santaisabel.cl/**',
    origin: 'https://www.santaisabel.cl',
    productPath: product => `/${product}/p`,
  },
  {
    name: 'Unimarc',
    route: 'https://www.unimarc.cl/**',
    origin: 'https://www.unimarc.cl',
    productPath: product => `/product/${product}`,
  },
  {
    name: 'Tottus',
    route: 'https://www.tottus.cl/**',
    origin: 'https://www.tottus.cl',
    productPath: product => `/tottus-cl/articulo/1/${product}/2`,
  },
  {
    name: 'aCuenta',
    route: 'https://www.acuenta.cl/**',
    origin: 'https://www.acuenta.cl',
    productPath: product => `/p/${product}`,
  },
  {
    name: 'Irurzun',
    route: 'https://irurzun.cl/**',
    origin: 'https://irurzun.cl',
    productPath: product => `/products/${product}`,
  },
];

function fixtureHtml(store) {
  return `<!doctype html>
    <html>
      <body>
        <header>
          <button id="fixture-cart" aria-label="El carro tiene 0 productos" onclick="sessionStorage.setItem('convive-cart-opened', 'true')">0</button>
        </header>
        <main>
          <h1>Producto ${store} test</h1>
          <div class="product-control" data-testid="detail-cart-quantifier">
            <button
              type="button"
              data-testid="add-to-cart"
              data-add-button="true"
              aria-label="Agregar"
              onclick="
                const bulkProduct = location.pathname.match(/product-(\\d+)/)?.[0];
                const product = bulkProduct
                  || (location.pathname.includes('milk') ? 'milk' : 'rice');
                sessionStorage.setItem(product, '1');
                document.querySelector('#fixture-cart').textContent = '1';
                document.querySelector('#fixture-cart').setAttribute('aria-label', 'El carro tiene 1 productos');
                const wrapper = this.parentElement;
                this.remove();
                const value = document.createElement('span');
                value.dataset.quantity = '1';
                value.textContent = '1';
                const plus = document.createElement('button');
                plus.type = 'button';
                plus.setAttribute('aria-label', 'Agregar otro');
                plus.textContent = '+';
                plus.onclick = () => {
                  const next = Number(value.dataset.quantity) + 1;
                  value.dataset.quantity = String(next);
                  value.textContent = String(next);
                  sessionStorage.setItem(product, String(next));
                };
                wrapper.append(value, plus);
              "
            >
              Agregar al carro
            </button>
            <input name="quantity" aria-label="Cantidad" value="1" hidden />
          </div>
        </main>
      </body>
    </html>`;
}

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

    for (const store of stores) {
      await context.route(store.route, route => route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: fixtureHtml(store.name),
      }));
    }

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

    const results = [];
    for (const store of stores) {
      await source.evaluate(payload => {
        window.postMessage({
          source: 'convive-connect',
          type: 'CONVIVE_CART_LOADER_START',
          payload,
        }, window.location.origin);
      }, {
        version: 1,
        store: store.name,
        createdAt: new Date().toISOString(),
        items: [
          {
            id: `${store.name}-milk`,
            name: 'Leche test',
            requestedTerm: 'leche',
            quantity: 2,
            productUrl: `${store.origin}${store.productPath('milk')}`,
          },
          {
            id: `${store.name}-rice`,
            name: 'Arroz test',
            requestedTerm: 'arroz',
            quantity: 1,
            productUrl: `${store.origin}${store.productPath('rice')}`,
          },
        ],
      });

      await source.waitForFunction(
        storeName => window.cartProgress.some(progress => (
          progress.store === storeName && progress.status === 'completed'
        )),
        store.name,
        { timeout: 30000 },
      );
      const progress = await source.evaluate(storeName => (
        window.cartProgress.filter(item => item.store === storeName).at(-1)
      ), store.name);
      if (progress.added !== 2 || progress.failed !== 0 || progress.total !== 2) {
        throw new Error(`${store.name} terminó con progreso inválido: ${JSON.stringify(progress)}`);
      }

      const retailerPages = context.pages().filter(page => page.url().startsWith(store.origin));
      if (retailerPages.length !== 1) {
        throw new Error(`${store.name} abrió ${retailerPages.length} pestañas; se esperaba una.`);
      }
      await retailerPages[0].waitForFunction(
        () => sessionStorage.getItem('convive-cart-opened') === 'true',
        null,
        { timeout: 5000 },
      );
      const quantities = await retailerPages[0].evaluate(() => ({
        milk: sessionStorage.getItem('milk'),
        rice: sessionStorage.getItem('rice'),
        cartOpened: sessionStorage.getItem('convive-cart-opened'),
      }));
      if (quantities.milk !== '2' || quantities.rice !== '1' || quantities.cartOpened !== 'true') {
        throw new Error(`${store.name} no conservó cantidades o no abrió el carro: ${JSON.stringify(quantities)}`);
      }
      results.push({ store: store.name, retailerTabs: retailerPages.length, quantities, progress });
    }

    const largeItems = Array.from({ length: 100 }, (_, index) => ({
      id: `bulk-${index + 1}`,
      name: `Producto ${index + 1}`,
      requestedTerm: `producto ${index + 1}`,
      quantity: 1,
      productUrl: `https://www.jumbo.cl/bulk/product-${index + 1}/p`,
    }));
    await source.evaluate(items => {
      window.postMessage({
        source: 'convive-connect',
        type: 'CONVIVE_CART_LOADER_START',
        payload: {
          version: 1,
          store: 'Jumbo',
          createdAt: new Date().toISOString(),
          items,
        },
      }, window.location.origin);
    }, largeItems);
    await source.waitForFunction(
      () => window.cartProgress.some(progress => (
        progress.store === 'Jumbo'
        && progress.total === 100
        && progress.status === 'completed'
      )),
      null,
      { timeout: 240000 },
    );
    const largeProgress = await source.evaluate(() => (
      window.cartProgress.filter(item => item.store === 'Jumbo' && item.total === 100).at(-1)
    ));
    if (largeProgress.added !== 100 || largeProgress.failed !== 0) {
      throw new Error(`La canasta de 100 terminó inválida: ${JSON.stringify(largeProgress)}`);
    }
    const largeRetailerPages = context.pages().filter(page => (
      page.url().startsWith('https://www.jumbo.cl/bulk/')
    ));
    if (largeRetailerPages.length !== 1) {
      throw new Error(`La canasta de 100 abrió ${largeRetailerPages.length} pestañas; se esperaba una.`);
    }
    const lastLargeItem = await largeRetailerPages[0].evaluate(() => (
      sessionStorage.getItem('product-100')
    ));
    if (lastLargeItem !== '1') {
      throw new Error('La canasta de 100 no alcanzó el último producto.');
    }

    console.log(JSON.stringify({
      passed: true,
      extensionReady,
      stores: results,
      largeBasket: {
        retailerTabs: largeRetailerPages.length,
        lastLargeItem,
        progress: largeProgress,
      },
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
