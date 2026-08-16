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

  const configs = {
    Lider: {
      label: 'Lider',
      hosts: ['super.lider.cl', 'www.lider.cl', 'lider.cl'],
      searchUrl: query => `https://www.lider.cl/supermercado/search?query=${encodeURIComponent(query)}`,
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
        '[aria-label*="carrito"]',
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
