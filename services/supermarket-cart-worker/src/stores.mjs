const MAX_ITEMS = 200;

export const STORE_CONFIGS = Object.freeze({
  Jumbo: {
    hosts: ['www.jumbo.cl', 'jumbo.cl'],
    directHosts: ['jumbo.vtexcommercestable.com.br'],
    cartUrl: 'https://www.jumbo.cl/checkout/#/cart',
    cartMode: 'vtex',
    addSelectors: ['button[data-cnstrc-btn="add_to_cart"]', 'button.product-add-cart[aria-label="Agregar"]', 'button[aria-label*="Agregar" i]'],
    plusSelectors: ['button.product-change-quantity-btn.add', 'button[aria-label="Agregar otro"]', 'button[aria-label*="Aumentar" i]'],
    quantitySelectors: ['.product-control input[type="number"]', '.product-control [data-quantity]'],
    cartSelectors: ['button[aria-label*="carro" i]', 'a[aria-label*="carro" i]', '[data-testid*="cart" i]'],
  },
  'Santa Isabel': {
    hosts: ['www.santaisabel.cl', 'santaisabel.cl'],
    directHosts: ['santaisabel.vtexcommercestable.com.br'],
    cartUrl: 'https://www.santaisabel.cl/checkout/#/cart',
    cartMode: 'vtex',
    addSelectors: ['button[data-cnstrc-btn="add_to_cart"]', 'button.product-add-cart[aria-label="Agregar"]', 'button[aria-label*="Agregar" i]'],
    plusSelectors: ['button.product-change-quantity-btn.add', 'button[aria-label="Agregar otro"]', 'button[aria-label*="Aumentar" i]'],
    quantitySelectors: ['.product-control input[type="number"]', '.product-control [data-quantity]'],
    cartSelectors: ['button[aria-label*="carro" i]', 'a[aria-label*="carro" i]', '[data-testid*="cart" i]'],
  },
  Lider: {
    hosts: ['super.lider.cl', 'www.lider.cl', 'lider.cl'],
    directHosts: [],
    cartUrl: 'https://super.lider.cl/cart',
    cartMode: 'dom',
    addSelectors: ['button[data-automation-id="atc"]', '[data-testid="add-to-cart-section"] button', 'button[data-automation-id="add-to-cart"]', 'button[aria-label*="Agregar al carro" i]', '[data-testid*="add-to-cart"]:not([data-testid*="skeleton"])'],
    plusSelectors: ['button[aria-label*="Aumentar" i]', 'button[aria-label="Agregar otro"]', 'button[data-testid*="increment"]'],
    quantitySelectors: ['input[aria-label*="Cantidad" i]', '[data-testid*="quantity"] input'],
    cartSelectors: ['button[data-automation-id="cart-button-header"]', 'button[aria-label*="carro" i]', '[data-testid*="cart"]'],
  },
  Unimarc: {
    hosts: ['www.unimarc.cl', 'unimarc.cl'],
    directHosts: ['unimarc.vtexcommercestable.com.br'],
    cartUrl: 'https://www.unimarc.cl/cart',
    cartMode: 'vtex',
    addSelectors: ['[aria-label="Agregar"]', 'svg[aria-label="Agregar al carrito"]', '[class*="ShelfAddToCart_addToCart"]'],
    plusSelectors: ['button[aria-label="Agregar otro"]', '[aria-label*="Aumentar" i]', '[class*="ShelfAddToCart"] [aria-label="Agregar"]'],
    quantitySelectors: ['[class*="ShelfAddToCart"] input', '[class*="ShelfAddToCart"] [class*="quantity"]'],
    cartSelectors: ['button[aria-label*="carro" i]', '[aria-label*="carrito" i]:not([aria-label*="Agregar" i])'],
  },
  Tottus: {
    hosts: ['www.tottus.cl', 'tottus.cl'],
    directHosts: [],
    cartUrl: 'https://www.tottus.cl/tottus-cl/basket',
    cartMode: 'dom',
    addSelectors: ['#add-to-cart-button', 'button[id*="add-to-cart"]', 'button[data-testid*="add-to-cart"]:not([data-testid*="skeleton"])', 'button[aria-label*="Agregar" i]'],
    plusSelectors: ['.cart-persist button.add-to-cart-button', 'button[aria-label*="Aumentar" i]', 'button[aria-label="Agregar otro"]', 'button[data-testid*="increment"]'],
    quantitySelectors: ['.cart-persist .count-from-cart', 'input[aria-label*="Cantidad" i]', '[data-testid*="quantity"] input'],
    cartSelectors: ['#testId-UserAction-basket + span', '[class*="UserActions-module_has-count"]', '[data-testid*="cart"]', 'button[aria-label*="carro" i]'],
  },
  aCuenta: {
    hosts: ['www.acuenta.cl', 'acuenta.cl'],
    directHosts: [],
    cartUrl: 'https://www.acuenta.cl/checkout/#/cart',
    cartMode: 'dom',
    openCartSelectors: ['button[data-testid="header-cart-button"]'],
    addSelectors: ['button[data-add-button="true"]', 'button[data-automation-id="add-to-cart"]', '[data-testid="detail-cart-quantifier"] button', 'button[class*="add__remove__product"]'],
    plusSelectors: ['button[aria-label="Agregar otro"]', 'button[data-plus-button="true"]', 'button[aria-label*="Aumentar" i]', '[data-testid*="cart-quantifier"] button:last-of-type'],
    quantitySelectors: ['[data-testid*="cart-quantifier"] input', '[data-testid*="cart-quantifier"] [class*="quantity"]'],
    cartSelectors: ['[data-testid="header-cart-button"]', '[data-testid*="cart-count"]', 'button[aria-label*="carro" i]'],
  },
  Irurzun: {
    hosts: ['irurzun.cl', 'www.irurzun.cl'],
    directHosts: ['irurzun.cl', 'www.irurzun.cl'],
    cartUrl: 'https://irurzun.cl/cart',
    cartMode: 'shopify',
    addSelectors: ['button.sticky-add-to-cart__button', 'button[data-testid="standalone-add-to-cart"]', 'button[name="add"].add-to-cart-button'],
    plusSelectors: ['button[aria-label="Agregar otro"]', 'button[name="plus"]', 'button.quantity-plus'],
    quantitySelectors: ['input[name="quantity"]'],
    cartSelectors: ['[data-testid="cart-drawer-trigger"]', 'button[aria-label="Carrito"]', 'button[aria-label*="carro" i]'],
    quantityBeforeAdd: true,
    quantityControlAddsToCart: true,
  },
});

export class InputError extends Error {}

function text(value, max) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function quantity(value) {
  return Math.min(99, Math.max(1, Math.round(Number(value) || 1)));
}

function exactHttpsUrl(value, hosts) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !hosts.includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function uniqueText(values) {
  return [...new Set(values.map(value => text(value, 240)).filter(Boolean))].slice(0, MAX_ITEMS);
}

export function sanitizeSessionRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Solicitud inválida.');
  const store = text(body.store, 40);
  const config = STORE_CONFIGS[store];
  if (!config) throw new InputError('Supermercado no compatible.');

  const rawItems = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  const missingItems = uniqueText(Array.isArray(body.missingItems) ? body.missingItems : []);
  const rejected = [];
  const items = rawItems.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const name = text(entry.name, 240);
    if (!name) return [];
    const productUrl = exactHttpsUrl(entry.productUrl, config.hosts);
    if (!productUrl) {
      rejected.push(name);
      return [];
    }
    return [{
      id: text(entry.id, 100) || `item-${index + 1}`,
      name,
      requestedTerm: text(entry.requestedTerm, 100) || name,
      quantity: quantity(entry.quantity),
      productUrl,
      sku: text(entry.sku, 80) || undefined,
      offerId: text(entry.offerId, 160) || undefined,
    }];
  });

  const directCartUrl = exactHttpsUrl(body.directCartUrl, config.directHosts);
  if (!directCartUrl && items.length === 0) {
    throw new InputError('No hay fichas válidas para cargar en este supermercado.');
  }
  const requestedPlannedCount = Math.min(MAX_ITEMS, Math.max(0, Math.round(Number(body.plannedCount) || 0)));
  const plannedCount = directCartUrl ? requestedPlannedCount : items.length;
  if (directCartUrl && plannedCount === 0) throw new InputError('El enlace directo no contiene productos confirmados.');

  return {
    store,
    config,
    items,
    directCartUrl,
    plannedCount,
    missingItems: uniqueText([...missingItems, ...rejected]),
  };
}

export function publicStatus(session) {
  return {
    store: session.store,
    status: session.status,
    current: session.current,
    total: session.total,
    added: session.added,
    failed: session.failed,
    detail: session.detail,
    itemName: session.itemName || undefined,
    missingItems: session.missingItems,
    expiresAt: new Date(session.expiresAt).toISOString(),
  };
}
