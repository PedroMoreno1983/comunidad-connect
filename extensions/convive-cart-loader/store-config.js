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
  ];

  const commonLocationText = [
    'como quieres recibir tu compra',
    'cómo quieres recibir tu compra',
    'elige un metodo de entrega',
    'elige un método de entrega',
    'elige tu modo de entrega',
    'selecciona tu comuna',
    'selecciona una comuna',
    'despacho a domicilio retiro en tienda',
  ];

  const commonEmptyCartLabels = [
    'vaciar carro',
    'vaciar carrito',
    'eliminar todos',
    'eliminar todo',
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
    cartSelectors: [
      'button[aria-label*="carro" i]',
      'a[aria-label*="carro" i]',
      '[data-testid*="cart" i]',
      'header a[href*="cart" i]',
      'header a[href*="carro" i]',
      'header button[class*="cart" i]',
      'header [role="button"][class*="cart" i]',
    ],
    emptyCartSelectors: [
      'button[data-gtm-tag="Vaciar carro"]',
    ],
    emptyCartLabels: commonEmptyCartLabels,
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
   * Mide ~47.000 caracteres y cambia con cada release, asi que se lee en
   * caliente: fijarlo garantizaria que deje de funcionar en la proxima release.
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
   * Lider - verificado contra super.lider.cl (2026-08-16/17, revisado 2026-08-18).
   *
   * Carga la canasta y la tienda devuelve el carro en la MISMA respuesta, que es
   * lo que permite reportar sin adivinar. Detalles en ADAPTADORES.md; los que no
   * son obvios:
   *
   *   * Es un upsert por `usItemId`: fija la cantidad y conserva lo que la
   *     persona ya tenia en el carro.
   *   * `usItemId` es exactamente nuestro `sku`, ceros a la izquierda incluidos.
   *   * `offerId` es otro identificador y tambien es obligatorio.
   *   * Sin `x-o-platform-version` responde 200 pero no carga nada; cambia en
   *     cada release y se lee de `<script id="release-metadata">`.
   *   * `cartId` es opcional: omitiendolo la tienda resuelve o crea el carro.
   *   * `errors` NO decide: una carga correcta puede traer un 500 de otro
   *     servicio. Solo `lineItems` prueba que un producto entro.
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

      /** Envia un grupo y devuelve el carro leido, o null si la tienda no lo devolvio. */
      const send = async group => {
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
                items: group.map(item => ({
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
        // Ni el status ni `errors` sirven: lo unico que prueba que un producto
        // entro es que la tienda lo devuelva en el carro.
        return Array.isArray(lineItems) ? lineItems : null;
      };

      let lineItems = await send(items);

      /*
       * Un solo producto no disponible tumba la respuesta ENTERA: la tienda
       * responde `CART_ITEM_UNAVAILABLE_CODE` con `data: null`, aunque los demas
       * productos del lote SI hayan entrado al carro (verificado el 2026-08-18).
       *
       * Antes eso se leia como "la API no funciono" y la carga caia al recorrido
       * por interfaz, que ademas re-visitaba productos ya agregados: parecia que
       * no se agregaba nada. Ahora, si el lote no devuelve carro, se reintenta
       * producto por producto. Como la operacion es un upsert y cada respuesta
       * trae el carro completo, la ultima lectura buena es el estado real.
       */
      if (!lineItems) {
        for (const item of items) {
          const single = await send([item]);
          if (single) lineItems = single;
        }
      }
      if (!lineItems) return null;

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
      cartApi: liderCartApi,
      /** El adaptador solo existe en super.lider.cl: ahi vive el carro. */
      cartApiHosts: ['super.lider.cl'],
      searchUrl: query => `https://super.lider.cl/search?query=${encodeURIComponent(query)}`,
      addSelectors: [
        '[data-testid*="add-to-cart"]',
        'button[aria-label*="Agregar al carro"]',
        'button[aria-label="Agregar"]',
        'button[class*="add-to-cart"]',
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
        'button[aria-label*="El carro tiene"]',
        '[data-testid*="cart"]',
      ],
      emptyCartLabels: commonEmptyCartLabels,
      blockedText: commonBlockedText,
      locationText: commonLocationText,
    },
    Jumbo: {
      label: 'Jumbo',
      hosts: ['www.jumbo.cl', 'jumbo.cl'],
      searchUrl: query => `https://www.jumbo.cl/busqueda?ft=${encodeURIComponent(query)}`,
      ...cencosud,
      blockedText: commonBlockedText,
      locationText: commonLocationText,
    },
    'Santa Isabel': {
      label: 'Santa Isabel',
      hosts: ['www.santaisabel.cl', 'santaisabel.cl'],
      searchUrl: query => `https://www.santaisabel.cl/busqueda?ft=${encodeURIComponent(query)}`,
      ...cencosud,
      blockedText: commonBlockedText,
      locationText: commonLocationText,
    },
    Unimarc: {
      label: 'Unimarc',
      hosts: ['www.unimarc.cl', 'unimarc.cl'],
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
        // Sin excluir "Agregar", este selector matchea los propios botones
        // `svg[aria-label="Agregar al carrito"]` del listado — 125 en una ficha
        // real — y el contador del carro queda ilegible (verificado 2026-08-24).
        '[aria-label*="carrito" i]:not([aria-label*="Agregar" i])',
        '[class*="Cart"] [class*="quantity"]',
      ],
      emptyCartLabels: commonEmptyCartLabels,
      blockedText: commonBlockedText,
      locationText: commonLocationText,
    },
    Tottus: {
      label: 'Tottus',
      hosts: ['www.tottus.cl', 'tottus.cl'],
      searchUrl: query => `https://www.tottus.cl/tottus-cl/buscar?Ntt=${encodeURIComponent(query)}`,
      addSelectors: [
        // Tottus identifica el boton por ID, no por testid/aria/clase: con los
        // selectores anteriores se encontraban CERO controles en una ficha real
        // (verificado el 2026-08-24) y por eso nunca agregaba nada.
        '#add-to-cart-button',
        'button[id*="add-to-cart"]',
        'button[data-testid*="add-to-cart"]',
        'button[aria-label*="Agregar"]',
        'button[class*="add-to-cart"]',
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
      emptyCartLabels: commonEmptyCartLabels,
      blockedText: commonBlockedText,
      locationText: commonLocationText,
    },
    aCuenta: {
      label: 'aCuenta',
      hosts: ['www.acuenta.cl', 'acuenta.cl'],
      searchUrl: query => `https://www.acuenta.cl/busqueda?ft=${encodeURIComponent(query)}`,
      addSelectors: [
        'button[data-add-button="true"]',
        '[data-testid="detail-cart-quantifier"] button',
        'button[class*="add__remove__product"]',
      ],
      plusSelectors: [
        'button[aria-label="Agregar otro"]',
        'button[data-plus-button="true"]',
        'button[aria-label*="Aumentar"]',
        '[data-testid*="cart-quantifier"] button:last-of-type',
      ],
      quantitySelectors: [
        '[data-testid*="cart-quantifier"] input',
        '[data-testid*="cart-quantifier"] [class*="quantity"]',
      ],
      cartSelectors: [
        '[data-testid="header-cart-button"]',
        '[data-testid*="cart-count"]',
      ],
      emptyCartLabels: commonEmptyCartLabels,
      blockedText: commonBlockedText,
      locationText: commonLocationText,
    },
    Irurzun: {
      label: 'Irurzun',
      hosts: ['irurzun.cl', 'www.irurzun.cl'],
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
        '[data-testid="cart-drawer-trigger"]',
        'button[aria-label="Carrito"]',
      ],
      emptyCartLabels: commonEmptyCartLabels,
      allowHiddenControls: true,
      quantityBeforeAdd: true,
      quantityControlAddsToCart: true,
      blockedText: commonBlockedText,
      locationText: [],
    },
  };

  globalThis.CONVIVE_STORE_CONFIGS = Object.freeze(configs);
})();
