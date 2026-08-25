const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const extensionPath = path.resolve(__dirname, '..', 'extensions', 'convive-cart-loader');
const expectedLoaderVersion = JSON.parse(
  fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'),
).version;
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
  const emptyCartDomUpdate = store === 'Jumbo'
    ? `
               cart.querySelector('[data-cart-count]')?.remove();
               const drawer = document.querySelector('#fixture-cart-drawer');
               const emptyHeading = document.createElement('h2');
               emptyHeading.dataset.emptyCartState = 'true';
               emptyHeading.textContent = 'Tu carro esta vacio';
               drawer.append(emptyHeading);
             `
    : `
               cart.querySelector('[data-cart-count]').textContent = '0';
               document.querySelector('#fixture-cart-drawer').hidden = true;
             `;
  return `<!doctype html>
    <html>
      <body>
        <header>
          <button
            id="fixture-cart"
            aria-label="Carro de compras"
            onclick="
              sessionStorage.setItem('convive-cart-opened', 'true');
              document.querySelector('#fixture-cart-drawer').hidden = false;
            "
          ><span data-cart-count>2</span></button>
        </header>
        <aside id="fixture-cart-drawer" hidden>
          <button
            type="button"
            aria-label="Cerrar"
            onclick="this.parentElement.hidden = true"
          ></button>
          <p>Carro de compras</p>
          <button
            type="button"
            data-gtm-tag="Vaciar carro"
            onclick="document.querySelector('#fixture-empty-confirmation').showModal()"
          >Vaciar carro</button>
        </aside>
        <dialog id="fixture-empty-confirmation">
          <p>¿Quieres vaciar el carro y eliminar todos los productos?</p>
          <button type="button" onclick="this.closest('dialog').close()">Cancelar</button>
          <button
            type="button"
            onclick="
              sessionStorage.setItem('fixture-cart-count', '0');
               sessionStorage.setItem('convive-cart-cleared', 'true');
               const cart = document.querySelector('#fixture-cart');
               ${emptyCartDomUpdate}
               this.closest('dialog').close();
            "
          >Si, vaciar</button>
        </dialog>
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
                const cart = document.querySelector('#fixture-cart');
                 const nextCartCount = Number(sessionStorage.getItem('fixture-cart-count') || '2') + 1;
                 sessionStorage.setItem('fixture-cart-count', String(nextCartCount));
                 let cartCount = cart.querySelector('[data-cart-count]');
                 if (!cartCount) {
                   cartCount = document.createElement('span');
                   cartCount.dataset.cartCount = '';
                   cart.append(cartCount);
                 }
                 cartCount.textContent = String(nextCartCount);
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
                  const cart = document.querySelector('#fixture-cart');
                  const nextCartCount = Number(sessionStorage.getItem('fixture-cart-count') || '2') + 1;
                  sessionStorage.setItem('fixture-cart-count', String(nextCartCount));
                  cart.querySelector('[data-cart-count]').textContent = String(nextCartCount);
                };
                wrapper.append(value, plus);
              "
            >
              Agregar al carro
            </button>
            <input name="quantity" aria-label="Cantidad" value="1" hidden />
          </div>
        </main>
        <script>
          const savedCartCount = sessionStorage.getItem('fixture-cart-count') || '2';
          const cart = document.querySelector('#fixture-cart');
          cart.querySelector('[data-cart-count]').textContent = savedCartCount;
        </script>
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

    const extensionIdentity = await source.evaluate(() => new Promise(resolve => {
      const listener = event => {
        if (event.data?.type === 'CONVIVE_CART_LOADER_READY') {
          window.removeEventListener('message', listener);
          resolve(event.data.payload);
        }
      };
      window.addEventListener('message', listener);
      window.postMessage({
        source: 'convive-connect',
        type: 'CONVIVE_CART_LOADER_PING',
      }, window.location.origin);
      window.setTimeout(() => resolve(null), 3000);
    }));
    if (
      !extensionIdentity
      || extensionIdentity.version !== expectedLoaderVersion
      || !extensionIdentity.capabilities?.includes('cart-baseline-v1')
      || !extensionIdentity.capabilities?.includes('cart-auto-open-v2')
      || !extensionIdentity.capabilities?.includes('cart-ui-complete-v1')
    ) {
      throw new Error(`La extensión no informó una identidad compatible: ${JSON.stringify(extensionIdentity)}`);
    }

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

      try {
        await source.waitForFunction(
          storeName => window.cartProgress.some(progress => (
            progress.store === storeName && progress.status === 'completed'
          )),
          store.name,
          { timeout: 30000 },
        );
      } catch (error) {
        const observed = await source.evaluate(storeName => (
          window.cartProgress.filter(progress => progress.store === storeName)
        ), store.name);
        const retailerPage = context.pages().find(page => page.url().startsWith(store.origin));
        const retailerState = retailerPage ? await retailerPage.evaluate(() => ({
          cartCount: document.querySelector('[data-cart-count]')?.textContent,
          savedCartCount: sessionStorage.getItem('fixture-cart-count'),
           cartCleared: sessionStorage.getItem('convive-cart-cleared'),
           emptyStateText: document.querySelector('[data-empty-cart-state]')?.textContent,
           emptyStateRect: (() => {
             const element = document.querySelector('[data-empty-cart-state]');
             if (!element) return null;
             const rect = element.getBoundingClientRect();
             return { width: rect.width, height: rect.height };
           })(),
           drawerHidden: document.querySelector('#fixture-cart-drawer')?.hidden,
          dialogOpen: document.querySelector('#fixture-empty-confirmation')?.open,
          dialogButtons: [...document.querySelectorAll('#fixture-empty-confirmation button')]
            .map(button => button.textContent?.trim()),
        })) : null;
        throw new Error(
          `${store.name} no completó la carga: ${JSON.stringify({ observed, retailerState })}`,
          { cause: error },
        );
      }
      const progress = await source.evaluate(storeName => (
        window.cartProgress.filter(item => item.store === storeName).at(-1)
      ), store.name);
      if (
        progress.added !== 2
        || progress.failed !== 0
        || progress.total !== 2
        || progress.previousCartCount !== 2
        || progress.currentCartCount !== 3
        || progress.removedCartCount !== 2
        || progress.cartReplaced !== true
      ) {
        throw new Error(`${store.name} terminó con progreso o conteo previo inválido: ${JSON.stringify(progress)}`);
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
        cartCleared: sessionStorage.getItem('convive-cart-cleared'),
      }));
      if (
        quantities.milk !== '2'
        || quantities.rice !== '1'
        || quantities.cartOpened !== 'true'
        || quantities.cartCleared !== 'true'
      ) {
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
    if (
      largeProgress.added !== 100
      || largeProgress.failed !== 0
      || largeProgress.previousCartCount !== 2
      || largeProgress.currentCartCount !== 100
      || largeProgress.removedCartCount !== 2
      || largeProgress.cartReplaced !== true
    ) {
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
      extensionIdentity,
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
