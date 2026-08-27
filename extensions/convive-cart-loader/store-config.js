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
    // Estas frases viven TANTO en el modal real de comuna/despacho COMO en el
    // widget permanente del header ("Despacho a domicilio · Retiro en tienda").
    // El cargador solo debe pausar si el overlay cubre el centro de la pantalla
    // (ver page-signals.js). Escanear cualquier drawer/modal las dispara en
    // TODAS las tiendas y congela la carga en el producto 1.
    //
    // Tottus sí bloquea la ficha con "Ingresa tu ubicacion" (verificado
    // 2026-08-24). Esa ventana es un modal centrado, no el widget del header.
    'ingresa tu ubicacion',
    'ingresa tu ubicación',
    'ingresa tu direccion',
    'ingresa tu dirección',
    'selecciona tu ubicacion',
    'selecciona tu ubicación',
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
   * Documento GraphQL del bundle publico. Orchestra rechaza uno inventado.
   *
   * El marcador ya no vive solo en `_app-*.js`: en 1.3.1 se buscaba únicamente
   * esa URL y, si el fetch al CDN fallaba (sin host_permission) o el documento
   * se había movido de chunk, la API devolvía null y toda la canasta caía al
   * clic de interfaz. Se prueba `_app-` primero y después los chunks de página.
   */
  function extractGraphqlDocument(source, marker) {
    const start = source.indexOf(marker);
    if (start < 0) return '';
    const delimiter = source[start - 1];
    if (delimiter !== '"' && delimiter !== "'" && delimiter !== '`') return '';
    for (let index = start; index < source.length; index += 1) {
      if (source[index] !== delimiter) continue;
      let slashes = 0;
      for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) slashes += 1;
      if (slashes % 2 === 0) return source.slice(start, index);
    }
    return '';
  }

  function liderScriptUrls() {
    const scripts = [...document.querySelectorAll('script[src]')]
      .map(script => script.src)
      .filter(url => typeof url === 'string' && url.includes('/_next/static/chunks/'));
    const score = url => (
      url.includes('_app-') ? 0
        : /\/pages\/(cart|ip|search)/i.test(url) ? 1
          : 2
    );
    return [...new Set(scripts)].sort((left, right) => score(left) - score(right)).slice(0, 8);
  }

  const liderGraphqlCache = new Map();

  async function liderGraphqlDocument(marker) {
    const cached = liderGraphqlCache.get(marker);
    if (cached) return cached;
    for (const src of liderScriptUrls()) {
      try {
        const response = await fetch(src, { credentials: 'omit' });
        if (!response.ok) continue;
        const source = await response.text();
        for (const candidate of ['mutation updateItems', 'query getCart']) {
          if (liderGraphqlCache.has(candidate)) continue;
          const document = extractGraphqlDocument(source, candidate);
          if (document) liderGraphqlCache.set(candidate, document);
        }
        if (liderGraphqlCache.get(marker)) return liderGraphqlCache.get(marker);
      } catch {
        // El siguiente chunk puede tener el documento.
      }
    }
    return '';
  }

  function liderUsItemId(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.length >= 14 ? digits : digits.padStart(14, '0');
  }

  function harvestOfferPairs(node, offers) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(child => harvestOfferPairs(child, offers));
      return;
    }
    const usItemId = liderUsItemId(node.usItemId);
    const offerId = String(node.offerId || '').trim();
    if (usItemId && offerId && !offers.has(usItemId)) offers.set(usItemId, offerId);
    Object.values(node).forEach(child => harvestOfferPairs(child, offers));
  }

  function harvestLiderOffers() {
    const offers = new Map();
    const script = document.getElementById('__NEXT_DATA__');
    try {
      harvestOfferPairs(JSON.parse(script?.textContent || 'null'), offers);
    } catch {
      // Sin __NEXT_DATA__ parseable se sigue con el offerId del catálogo.
    }
    return offers;
  }

  function harvestLiderOffersFromHtml(html) {
    const offers = new Map();
    const match = String(html || '').match(/<script[^>]*id=["']?__NEXT_DATA__["']?[^>]*>([\s\S]*?)<\/script>/i);
    if (!match) return offers;
    try {
      harvestOfferPairs(JSON.parse(match[1]), offers);
    } catch {
      // HTML de ficha sin JSON usable.
    }
    return offers;
  }

  function liderProductUrl(value, sku) {
    try {
      if (value) {
        const url = new URL(String(value), 'https://super.lider.cl');
        if (url.hostname === 'www.lider.cl' || url.hostname === 'lider.cl') {
          url.hostname = 'super.lider.cl';
        }
        if (url.hostname === 'super.lider.cl' && url.pathname.includes('/ip/')) {
          return url.toString();
        }
      }
    } catch {
      // Caemos a la ficha por sku.
    }
    return sku ? `https://super.lider.cl/ip/producto/${sku}` : '';
  }

  async function prepareLiderItems(items) {
    const harvested = harvestLiderOffers();
    const list = Array.isArray(items) ? items : [];
    const prepared = list.map(item => {
      const sku = liderUsItemId(item.sku);
      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        sku,
        offerId: String(item.offerId || harvested.get(sku) || '').trim(),
        productUrl: typeof item.productUrl === 'string' ? item.productUrl : '',
      };
    });
    const missing = prepared.filter(item => item.sku && !item.offerId);
    for (const item of missing.slice(0, 8)) {
      const url = liderProductUrl(item.productUrl, item.sku);
      if (!url) continue;
      try {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) continue;
        harvestLiderOffersFromHtml(await response.text()).forEach((offerId, sku) => {
          if (!harvested.has(sku)) harvested.set(sku, offerId);
        });
        item.offerId = harvested.get(item.sku) || item.offerId;
      } catch {
        // Sigue con el resto: el recorrido por interfaz cubre este SKU.
      }
    }
    return prepared.map(item => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      sku: item.sku,
      offerId: item.offerId || harvested.get(item.sku) || '',
    }));
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
    async load(items, options = {}) {
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

      const query = await liderGraphqlDocument('mutation updateItems');
      if (!query) return null;

      const orchestraHeaders = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-o-platform-version': appVersion,
        'x-o-platform': 'rweb',
        'x-o-bu': 'LIDER-CL',
        'x-o-mart': 'B2C',
        'x-o-vertical': 'OD',
        'x-o-segment': 'oaoh',
        'x-o-ccm': 'server',
        WM_MP: 'true',
      };

      const send = async (group, operation, document, variables) => {
        const response = await fetch('/orchestra/graphql', {
          method: 'POST',
          credentials: 'include',
          headers: {
            ...orchestraHeaders,
            'X-APOLLO-OPERATION-NAME': operation,
            'x-o-gql-query': operation === 'updateItems' ? 'mutation updateItems' : `query ${operation}`,
          },
          body: JSON.stringify({ query: document, variables }),
        });
        return response.json().catch(() => null);
      };

      const sendItems = async group => {
        const payload = await send(group, 'updateItems', query, {
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
        });
        const lineItems = payload?.data?.updateItems?.lineItems;
        return Array.isArray(lineItems) ? lineItems : null;
      };

      if (options.replace === true) {
        const getCartQuery = await liderGraphqlDocument('query getCart');
        if (!getCartQuery) return null;
        const cartPayload = await send([], 'getCart', getCartQuery, {
          cartInput: cartId ? { cartId } : {},
        });
        // 2026-08-27: la operación se llama getCart, pero el campo raíz es `cart`.
        const cartNode = cartPayload?.data?.cart
          || cartPayload?.data?.getCart?.cart
          || cartPayload?.data?.getCart;
        const currentLines = Array.isArray(cartNode?.lineItems) ? cartNode.lineItems : null;
        if (!Array.isArray(currentLines)) return null;
        const keep = new Set(items.map(item => liderUsItemId(item.sku)));
        const toClear = currentLines.flatMap(line => {
          const sku = liderUsItemId(line?.product?.usItemId || line?.usItemId);
          const offerId = String(line?.product?.offerId || line?.offerId || '').trim();
          if (!sku || keep.has(sku)) return [];
          return [{
            sku,
            offerId,
            quantity: 0,
            name: String(line?.product?.name || line?.name || sku),
          }];
        }).filter(item => item.offerId);
        if (toClear.length > 0) {
          const cleared = await sendItems(toClear);
          if (!cleared) return null;
        }
      }

      let lineItems = await sendItems(items);

      /*
       * Un solo producto no disponible tumba la respuesta ENTERA: la tienda
       * responde `CART_ITEM_UNAVAILABLE_CODE` con `data: null`, aunque los demas
       * productos del lote SI hayan entrado al carro (verificado el 2026-08-18).
       */
      if (!lineItems) {
        for (const item of items) {
          const single = await sendItems([item]);
          if (single) lineItems = single;
        }
      }
      if (!lineItems) return null;

      const landed = new Map();
      for (const lineItem of lineItems) {
        const usItemId = liderUsItemId(lineItem?.product?.usItemId || lineItem?.usItemId);
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
      prepareItems: prepareLiderItems,
      /** El adaptador solo existe en super.lider.cl: ahi vive el carro. */
      cartApiHosts: ['super.lider.cl'],
      searchUrl: query => `https://super.lider.cl/search?query=${encodeURIComponent(query)}`,
      addSelectors: [
        // 2026-08-27: el PDP hidrata un <div data-testid=add-to-cart-skeleton>
        // que matcheaba [data-testid*="add-to-cart"] y se clicaba de inmediato.
        'button[data-automation-id="add-to-cart"]',
        'button[aria-label*="Agregar al carro"]',
        '[data-testid="add-to-cart-section"] button',
        '[data-testid*="add-to-cart"]:not([data-testid*="skeleton"])',
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
        'button[data-automation-id="cart-button-header"]',
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
        'button[data-testid*="add-to-cart"]:not([data-testid*="skeleton"])',
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
        'button[data-automation-id="add-to-cart"]',
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
