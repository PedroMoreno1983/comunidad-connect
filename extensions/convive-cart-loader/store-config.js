(() => {
  const commonBlockedText = [
    'robot or human',
    'robot o humano',
    'confirma que eres humano',
    'confirm that you are human',
    'activate and hold',
    'verificacion de seguridad',
    'verificación de seguridad',
    'security verification',
    'verificacion de seguridad en curso',
    'verificación de seguridad en curso',
    'un momento',
  ];

  const commonLocationText = [
    'como quieres recibir tu compra',
    'cómo quieres recibir tu compra',
    'como te gustaria recibir tu pedido',
    'cómo te gustaría recibir tu pedido',
    'como quieres recibir tu pedido',
    'cómo quieres recibir tu pedido',
    'elige un metodo de entrega',
    'elige un método de entrega',
    'elige tu modo de entrega',
    'elige un modo de entrega',
    'selecciona tu comuna',
    'selecciona una comuna',
    'selecciona tu tienda',
    'despacho a domicilio retiro en tienda',
  ];

  const commonOutOfStockText = [
    'justo se agoto',
    'justo se agotó',
    'agotado',
    'producto agotado',
    'sin stock',
    'no disponible',
    'temporalmente no disponible',
    'producto temporalmente fuera de stock',
    'out of stock',
    'no hay stock',
    'no encontramos resultados',
    'este producto no se encuentra disponible',
  ];

  const cencosud = {
    addSelectors: [
      'button[data-cnstrc-btn="add_to_cart"]',
      'button.product-add-cart[aria-label="Agregar"]',
    ],
    plusSelectors: [
      'button.product-change-quantity-btn.add',
      'button[aria-label="Agregar otro"]',
    ],
    quantitySelectors: [
      '.product-control input[type="number"]',
      '.product-control [data-quantity]',
    ],
    cartSelectors: ['button[aria-label*="carro de compras"]'],
  };

  function readCookie(name) {
    const prefix = `${name}=`;
    const hit = String(document.cookie || '').split('; ').find(part => part.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : '';
  }

  /**
   * Documento de la mutacion, sacado del bundle publico del propio sitio.
   *
   * Orchestra solo acepta sus propios documentos: una mutacion minima nuestra,
   * con las mismas variables y cabeceras, responde
   * `400 {"code":400,"message":"Something went wrong while processing the query."}`.
   * El documento mide ~47.000 caracteres y cambia con cada release, asi que se
   * lee en caliente en vez de fijarlo aca: fijarlo garantizaria que la carga
   * deje de funcionar en la proxima release de Lider.
   */
  async function liderMutationDocument() {
    const src = [...document.querySelectorAll('script[src]')]
      .map(script => script.src)
      .find(url => url.includes('_app-'));
    if (!src) return '';

    const response = await fetch(src);
    if (!response.ok) return '';
    const source = await response.text();

    const start = source.indexOf('mutation updateItems');
    if (start < 0) return '';
    const delimiter = source[start - 1];
    const BACKSLASH = 92;
    for (let index = start; index < source.length; index += 1) {
      if (source[index] === delimiter && source.charCodeAt(index - 1) !== BACKSLASH) {
        return source.slice(start, index);
      }
    }
    return '';
  }

  /**
   * Lider - verificado el 2026-08-17 contra super.lider.cl.
   *
   * Carga la canasta completa en UNA llamada y la tienda devuelve el carro en
   * la misma respuesta, que es lo que permite reportar sin adivinar. Detalles
   * completos en ADAPTADORES.md; los que no son obvios:
   *
   *   * La operacion es un upsert por `usItemId`: fija la cantidad del producto
   *     y conserva lo que la persona ya tenia en el carro.
   *   * `usItemId` es exactamente nuestro `sku`, ceros a la izquierda incluidos.
   *   * `offerId` es otro identificador y tambien es obligatorio.
   *   * Sin `x-o-platform-version` responde 200 pero no carga nada; el valor
   *     cambia en cada release y se lee de `<script id="release-metadata">`.
   *   * `cartId` es opcional: omitiendolo la tienda resuelve o crea el carro.
   *   * `errors` puede venir con un 500 de otro servicio y el carro quedar
   *     perfecto igual. Solo `lineItems` decide.
   */
  const liderCartApi = {
    async load(items) {
      const cartId = readCookie('cartId');

      const metadata = document.getElementById('release-metadata');
      if (!metadata) return null;
      let appVersion = '';
      try {
        appVersion = String(JSON.parse(metadata.textContent).appVersion || '');
      } catch {
        return null;
      }
      if (!appVersion) return null;

      const query = await liderMutationDocument();
      if (!query) return null;

      const response = await fetch('/orchestra/graphql', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-APOLLO-OPERATION-NAME': 'updateItems',
          'x-o-gql-query': 'mutation updateItems',
          'x-o-platform-version': appVersion,
          'x-o-platform': 'rweb',
          'x-o-bu': 'LIDER-CL',
          'x-o-mart': 'B2C',
          'x-o-vertical': 'OD',
          'x-o-segment': 'oaoh',
          'x-o-ccm': 'server',
          WM_MP: 'true',
        },
        body: JSON.stringify({
          query,
          variables: {
            input: {
              ...(cartId ? { cartId } : {}),
              items: items.map(item => ({
                offerId: String(item.offerId),
                quantity: item.quantity,
                usItemId: String(item.sku),
                salesUnit: 'EACH',
                additionalInfo: {},
                name: item.name,
              })),
              enableLiquorBox: false,
              skipPolicyCheck: false,
              cartLeanMode: false,
              enableCartSplitClarity: false,
              features: ['lmpdel'],
            },
          },
        }),
      });

      const payload = await response.json().catch(() => null);
      const lineItems = payload?.data?.updateItems?.lineItems;
      // Ni el status ni `errors` sirven para decidir: lo unico que prueba que
      // un producto entro es que la tienda lo devuelva en el carro.
      if (!Array.isArray(lineItems)) return null;

      const landed = new Map();
      for (const lineItem of lineItems) {
        const usItemId = String(lineItem?.product?.usItemId || '');
        const quantity = Number(lineItem?.quantity) || 0;
        if (usItemId && quantity > 0) landed.set(usItemId, quantity);
      }
      return landed;
    },
  };

  const configs = {
    Lider: {
      label: 'Lider',
      hosts: ['super.lider.cl', 'www.lider.cl', 'lider.cl'],
      cartUrl: 'https://super.lider.cl/cart',
      cartApi: liderCartApi,
      /** El adaptador solo existe en super.lider.cl: ahi vive el carro. */
      cartApiHosts: ['super.lider.cl'],
      // La URL antigua www.lider.cl/supermercado/search ahora redirige a la
      // home y pierde la busqueda. La busqueda vive en super.lider.cl/search.
      searchUrl: query => `https://super.lider.cl/search?query=${encodeURIComponent(query)}`,
      addSelectors: [
        'button[data-automation-id="add-to-cart"]',
        'button[data-testid*="add-to-cart"]',
        'button[aria-label*="Agregar al carro"]',
        'button[aria-label*="Agregar"]',
        'button[class*="add-to-cart"]',
        'button[class*="AddToCart"]',
        'button[data-tl-id*="add-to-cart"]',
        'button.product-add-cart',
      ],
      plusSelectors: [
        'button[aria-label*="Aumentar"]',
        'button[aria-label*="Agregar otro"]',
        'button[data-testid*="increment"]',
        'button[data-automation-id*="increment"]',
      ],
      quantitySelectors: [
        'input[aria-label*="Cantidad"]',
        '[data-testid*="quantity"] input',
        '[data-automation-id*="quantity"]',
      ],
      cartSelectors: [
        'button[aria-label*="El carro tiene"]',
        'button[aria-label*="carro"]',
        '[data-testid*="cart"]',
        'a[href*="/cart"]',
        'header a[href*="cart"] span',
      ],
      blockedText: commonBlockedText,
      locationText: commonLocationText,
    },
    Jumbo: {
      label: 'Jumbo',
      hosts: ['www.jumbo.cl', 'jumbo.cl'],
      cartUrl: 'https://www.jumbo.cl/checkout/#/cart',
      searchUrl: query => `https://www.jumbo.cl/busqueda?ft=${encodeURIComponent(query)}`,
      ...cencosud,
      blockedText: commonBlockedText,
      locationText: commonLocationText,
    },
    'Santa Isabel': {
      label: 'Santa Isabel',
      hosts: ['www.santaisabel.cl', 'santaisabel.cl'],
      cartUrl: 'https://www.santaisabel.cl/checkout/#/cart',
      searchUrl: query => `https://www.santaisabel.cl/busqueda?ft=${encodeURIComponent(query)}`,
      ...cencosud,
      blockedText: commonBlockedText,
      locationText: commonLocationText,
    },
    Unimarc: {
      label: 'Unimarc',
      hosts: ['www.unimarc.cl', 'unimarc.cl'],
      // El sitio nuevo de Unimarc no tiene pagina de carro (/checkout da 404):
      // el carro vive en el icono del header. Al terminar llevamos a la home,
      // donde el badge muestra los productos cargados.
      cartUrl: 'https://www.unimarc.cl/',
      searchUrl: query => `https://www.unimarc.cl/search?q=${encodeURIComponent(query)}&suggestions=true`,
      addSelectors: [
        '[aria-label="Agregar"]',
        'svg[aria-label="Agregar al carrito"]',
        '[class*="ShelfAddToCart_addToCart"]',
      ],
      plusSelectors: [
        'button[aria-label="Agregar otro"]',
        '[aria-label*="Aumentar"]',
        'svg[aria-label*="Agregar al carrito"]',
        '[class*="ShelfAddToCart"] [aria-label="Agregar"]',
      ],
      quantitySelectors: [
        '[class*="ShelfAddToCart"] input',
        '[class*="ShelfAddToCart"] [class*="quantity"]',
      ],
      cartSelectors: [
        '[aria-label*="carrito"]',
        '[class*="Cart"] [class*="quantity"]',
      ],
      blockedText: commonBlockedText,
      locationText: commonLocationText,
    },
    Tottus: {
      label: 'Tottus',
      hosts: ['www.tottus.cl', 'tottus.cl'],
      cartUrl: 'https://www.tottus.cl/tottus-cl/carro',
      searchUrl: query => `https://www.tottus.cl/tottus-cl/buscar?Ntt=${encodeURIComponent(query)}`,
      addSelectors: [
        // El boton real de compra es `add-to-cart-button`; `add-to-cart` a secas
        // tambien calza con el contador "0 un" y haria clic en el lugar equivocado.
        'button[class*="add-to-cart-button"]',
        'button[data-testid*="add-to-cart"]',
        'button[aria-label*="Agregar"]',
        'button[class*="AddToCart"]',
      ],
      plusSelectors: [
        'button[aria-label*="Aumentar"]',
        'button[aria-label*="Agregar otro"]',
        'button[data-testid*="increment"]',
      ],
      quantitySelectors: [
        'input[aria-label*="Cantidad"]',
        '[data-testid*="quantity"] input',
      ],
      cartSelectors: [
        '[data-testid*="cart"]',
        'button[aria-label*="carro"]',
      ],
      blockedText: commonBlockedText,
      locationText: commonLocationText,
    },
    aCuenta: {
      label: 'aCuenta',
      hosts: ['www.acuenta.cl', 'acuenta.cl'],
      cartUrl: 'https://www.acuenta.cl/cart',
      searchUrl: query => `https://www.acuenta.cl/busqueda?ft=${encodeURIComponent(query)}`,
      // Sin modo de entrega elegido, aCuenta redirige la busqueda a la home.
      // Con este texto el loader abre el selector y pausa para que la persona
      // lo complete una vez; despues queda guardado en su navegador.
      deliveryOpenerText: 'elige un modo de entrega',
      addSelectors: [
        'button[data-add-button="true"]',
        'button[data-automation-id="add-to-cart"]',
        '[data-testid="detail-cart-quantifier"] button',
        'button[class*="add__remove__product"]',
        'button[class*="AddToCart"]',
        'button[class*="add-to-cart"]',
        'button[aria-label*="Agregar"]',
        'button.product-add-cart',
      ],
      plusSelectors: [
        'button[aria-label="Agregar otro"]',
        'button[data-plus-button="true"]',
        'button[aria-label*="Aumentar"]',
        '[data-testid*="cart-quantifier"] button:last-of-type',
        'button[data-automation-id*="increment"]',
      ],
      quantitySelectors: [
        '[data-testid*="cart-quantifier"] input',
        '[data-testid*="cart-quantifier"] [class*="quantity"]',
        '[data-automation-id*="quantity"]',
      ],
      cartSelectors: [
        '[data-testid="header-cart-button"]',
        '[data-testid*="cart-count"]',
        'button[aria-label*="carro"]',
        'button[aria-label*="cart"]',
        'button[aria-label*="Carrito"]',
        '[class*="header__cart"]',
        '[class*="CartButton"]',
        'a[href*="/cart"]',
      ],
      blockedText: commonBlockedText,
      locationText: commonLocationText,
    },
    Irurzun: {
      label: 'Irurzun',
      hosts: ['irurzun.cl', 'www.irurzun.cl'],
      cartUrl: 'https://irurzun.cl/cart/',
      searchUrl: query => `https://irurzun.cl/search?q=${encodeURIComponent(query)}`,
      addSelectors: [
        'button.sticky-add-to-cart__button',
        'button[data-testid="standalone-add-to-cart"]',
        'button[name="add"].add-to-cart-button',
      ],
      plusSelectors: [
        'button[aria-label="Agregar otro"]',
        'button[name="plus"]',
        'button.quantity-plus',
      ],
      quantitySelectors: [
        'input[name="quantity"]',
      ],
      cartSelectors: [
        '[data-testid="cart-bubble"]',
        '.cart-bubble__text-count',
        '[data-testid="cart-drawer-trigger"]',
        'button[aria-label="Carrito"]',
      ],
      allowHiddenControls: true,
      quantityBeforeAdd: true,
      quantityControlAddsToCart: true,
      blockedText: commonBlockedText,
      locationText: [],
    },
  };

  globalThis.CONVIVE_STORE_CONFIGS = Object.freeze(configs);
})();
