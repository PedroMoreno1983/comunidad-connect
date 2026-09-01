'use client';

import { Capacitor } from '@capacitor/core';
import type {
  SupermarketManagedCartCallbacks,
  SupermarketManagedCartItem,
  SupermarketManagedCartProgress,
  SupermarketManagedCartStartResult,
  SupermarketManagedStoreConfig,
  SupermarketSearchCandidate,
  SupermarketStore,
} from '@/lib/types';

const MANAGED_STORES: Record<SupermarketStore, SupermarketManagedStoreConfig> = {
  Jumbo: {
    hosts: ['www.jumbo.cl', 'jumbo.cl'],
    cartUrl: 'https://www.jumbo.cl/checkout/#/cart',
    apiMode: 'vtex',
    addSelectors: [
      'button[data-cnstrc-btn="add_to_cart"]',
      'button.product-add-cart[aria-label="Agregar"]',
      'button[aria-label*="Agregar" i]',
    ],
    plusSelectors: [
      'button.product-change-quantity-btn.add',
      'button[aria-label="Agregar otro"]',
      'button[aria-label*="Aumentar" i]',
    ],
    quantitySelectors: ['.product-control input[type="number"]', '.product-control [data-quantity]'],
    cartSelectors: ['button[aria-label*="carro" i]', 'a[aria-label*="carro" i]', '[data-testid*="cart" i]'],
  },
  'Santa Isabel': {
    hosts: ['www.santaisabel.cl', 'santaisabel.cl'],
    cartUrl: 'https://www.santaisabel.cl/checkout/#/cart',
    apiMode: 'vtex',
    addSelectors: [
      'button[data-cnstrc-btn="add_to_cart"]',
      'button.product-add-cart[aria-label="Agregar"]',
      'button[aria-label*="Agregar" i]',
    ],
    plusSelectors: [
      'button.product-change-quantity-btn.add',
      'button[aria-label="Agregar otro"]',
      'button[aria-label*="Aumentar" i]',
    ],
    quantitySelectors: ['.product-control input[type="number"]', '.product-control [data-quantity]'],
    cartSelectors: ['button[aria-label*="carro" i]', 'a[aria-label*="carro" i]', '[data-testid*="cart" i]'],
  },
  Lider: {
    hosts: ['super.lider.cl', 'www.lider.cl', 'lider.cl'],
    cartUrl: 'https://super.lider.cl/cart',
    apiMode: 'lider',
    addSelectors: [
      'button[data-automation-id="add-to-cart"]',
      'button[aria-label*="Agregar al carro" i]',
      '[data-testid="add-to-cart-section"] button',
      '[data-testid*="add-to-cart"]:not([data-testid*="skeleton"])',
    ],
    plusSelectors: [
      'button[aria-label*="Aumentar" i]',
      'button[aria-label="Agregar otro"]',
      'button[data-testid*="increment"]',
    ],
    quantitySelectors: ['input[aria-label*="Cantidad" i]', '[data-testid*="quantity"] input'],
    cartSelectors: [
      'button[data-automation-id="cart-button-header"]',
      'button[aria-label*="carro" i]',
      '[data-testid*="cart"]',
    ],
  },
  Unimarc: {
    hosts: ['www.unimarc.cl', 'unimarc.cl'],
    cartUrl: 'https://www.unimarc.cl/cart',
    apiMode: 'vtex',
    addSelectors: [
      '[aria-label="Agregar"]',
      'svg[aria-label="Agregar al carrito"]',
      '[class*="ShelfAddToCart_addToCart"]',
    ],
    plusSelectors: [
      'button[aria-label="Agregar otro"]',
      '[aria-label*="Aumentar" i]',
      '[class*="ShelfAddToCart"] [aria-label="Agregar"]',
    ],
    quantitySelectors: ['[class*="ShelfAddToCart"] input', '[class*="ShelfAddToCart"] [class*="quantity"]'],
    cartSelectors: [
      'button[aria-label*="carro" i]',
      '[aria-label*="carrito" i]:not([aria-label*="Agregar" i])',
    ],
  },
  Tottus: {
    hosts: ['www.tottus.cl', 'tottus.cl'],
    cartUrl: 'https://www.tottus.cl/tottus-cl/cart',
    addSelectors: [
      '#add-to-cart-button',
      'button[id*="add-to-cart"]',
      'button[data-testid*="add-to-cart"]:not([data-testid*="skeleton"])',
      'button[aria-label*="Agregar" i]',
    ],
    plusSelectors: [
      'button[aria-label*="Aumentar" i]',
      'button[aria-label="Agregar otro"]',
      'button[data-testid*="increment"]',
    ],
    quantitySelectors: ['input[aria-label*="Cantidad" i]', '[data-testid*="quantity"] input'],
    cartSelectors: ['[data-testid*="cart"]', 'button[aria-label*="carro" i]'],
  },
  aCuenta: {
    hosts: ['www.acuenta.cl', 'acuenta.cl'],
    cartUrl: 'https://www.acuenta.cl/checkout/#/cart',
    addSelectors: [
      'button[data-add-button="true"]',
      'button[data-automation-id="add-to-cart"]',
      '[data-testid="detail-cart-quantifier"] button',
      'button[class*="add__remove__product"]',
    ],
    plusSelectors: [
      'button[aria-label="Agregar otro"]',
      'button[data-plus-button="true"]',
      'button[aria-label*="Aumentar" i]',
      '[data-testid*="cart-quantifier"] button:last-of-type',
    ],
    quantitySelectors: ['[data-testid*="cart-quantifier"] input', '[data-testid*="cart-quantifier"] [class*="quantity"]'],
    cartSelectors: ['[data-testid="header-cart-button"]', '[data-testid*="cart-count"]', 'button[aria-label*="carro" i]'],
  },
  Irurzun: {
    hosts: ['irurzun.cl', 'www.irurzun.cl'],
    cartUrl: 'https://irurzun.cl/cart',
    apiMode: 'shopify',
    addSelectors: [
      'button.sticky-add-to-cart__button',
      'button[data-testid="standalone-add-to-cart"]',
      'button[name="add"].add-to-cart-button',
    ],
    plusSelectors: ['button[aria-label="Agregar otro"]', 'button[name="plus"]', 'button.quantity-plus'],
    quantitySelectors: ['input[name="quantity"]'],
    cartSelectors: ['[data-testid="cart-drawer-trigger"]', 'button[aria-label="Carrito"]', 'button[aria-label*="carro" i]'],
    quantityBeforeAdd: true,
    quantityControlAddsToCart: true,
  },
};

const BLOCKED_TEXT = [
  'robot or human',
  'robot o humano',
  'confirma que eres humano',
  'confirm that you are human',
  'activate and hold',
  'verificacion de seguridad',
  'verificación de seguridad',
  'security verification',
];

const INTERVENTION_TEXT = [
  'ingresa tu ubicacion',
  'ingresa tu ubicación',
  'ingresa tu direccion',
  'ingresa tu dirección',
  'selecciona tu comuna',
  'selecciona una comuna',
  'como quieres recibir tu compra',
  'cómo quieres recibir tu compra',
  'inicia sesion',
  'inicia sesión',
  'ingresa a tu cuenta',
];

function asStore(value: string): SupermarketStore | null {
  return Object.prototype.hasOwnProperty.call(MANAGED_STORES, value)
    ? value as SupermarketStore
    : null;
}

function validProductUrl(store: SupermarketStore, value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !MANAGED_STORES[store].hosts.includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function managedCartItems(
  storeName: string,
  items: SupermarketSearchCandidate[],
): SupermarketManagedCartItem[] {
  const store = asStore(storeName);
  if (!store) return [];
  return items.flatMap(item => {
    const productUrl = validProductUrl(store, item.productUrl);
    if (!productUrl || !item.name.trim()) return [];
    return [{
      id: item.id,
      name: item.name.trim(),
      requestedTerm: item.requestedTerm.trim(),
      quantity: Math.min(99, Math.max(1, Math.round(item.quantity) || 1)),
      productUrl,
      sku: item.sku?.trim() || undefined,
      offerId: item.offerId?.trim() || undefined,
    }];
  });
}

export function managedCartAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Script ejecutado dentro del WebView de la tienda. Solo recibe selectores y
 * datos serializados; no lee credenciales ni envía cookies a Convive.
 */
export function buildManagedCartItemScript(
  config: SupermarketManagedStoreConfig,
  item: SupermarketManagedCartItem,
  current: number,
  total: number,
): string {
  const payload = JSON.stringify({
    config,
    item,
    current,
    total,
    blockedText: BLOCKED_TEXT,
    interventionText: INTERVENTION_TEXT,
  }).replaceAll('<', '\\u003c');

  return `(() => {
    if (window.__conviveManagedCartRunning) return;
    window.__conviveManagedCartRunning = true;
    const payload = ${payload};
    const config = payload.config;
    const item = payload.item;
    const normalize = value => String(value || '').normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/\\s+/g, ' ').trim();
    const visible = element => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const find = selectors => selectors.flatMap(selector => {
      try { return [...document.querySelectorAll(selector)]; } catch { return []; }
    }).find(visible) || null;
    const label = element => normalize([
      element?.getAttribute?.('aria-label'),
      element?.getAttribute?.('title'),
      element?.textContent,
      element instanceof HTMLInputElement ? element.value : '',
    ].filter(Boolean).join(' '));
    const post = detail => window.mobileApp?.postMessage?.({ detail: {
      source: 'convive-managed-cart',
      ...detail,
    }});
    const sleep = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
    const waitFor = async (factory, timeout = 15000) => {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        const value = factory();
        if (value) return value;
        await sleep(250);
      }
      return null;
    };
    const overlay = (() => {
      document.querySelector('[data-convive-managed-cart]')?.remove();
      const node = document.createElement('aside');
      node.setAttribute('data-convive-managed-cart', 'true');
      node.style.cssText = 'position:fixed;z-index:2147483647;left:12px;right:12px;bottom:12px;padding:14px 16px;border-radius:16px;background:#1f2937;color:white;font:14px/1.4 system-ui,sans-serif;box-shadow:0 12px 36px rgba(0,0,0,.35)';
      node.innerHTML = '<strong style="display:block;margin-bottom:4px">Convive está cargando tu carro</strong>'
        + '<span data-detail></span><button data-resume type="button" style="display:none;margin-top:10px;border:0;border-radius:10px;padding:9px 12px;background:#fff;color:#1f2937;font-weight:700">Ya lo hice, continuar</button>';
      document.documentElement.appendChild(node);
      node.querySelector('[data-resume]')?.addEventListener('click', () => post({ action: 'resume' }));
      return node;
    })();
    const setDetail = value => {
      const detail = overlay.querySelector('[data-detail]');
      if (detail) detail.textContent = value;
    };
    const requireUser = detail => {
      setDetail(detail);
      const resume = overlay.querySelector('[data-resume]');
      if (resume instanceof HTMLElement) resume.style.display = 'inline-block';
      post({ action: 'needs-user', itemId: item.id, detail });
      window.__conviveManagedCartRunning = false;
    };
    const click = element => {
      try {
        const options = { bubbles: true, cancelable: true, view: window };
        element.dispatchEvent(new PointerEvent('pointerdown', options));
        element.dispatchEvent(new MouseEvent('mousedown', options));
        element.dispatchEvent(new PointerEvent('pointerup', options));
        element.dispatchEvent(new MouseEvent('mouseup', options));
      } catch {}
      element.click?.();
    };
    const signature = () => config.quantitySelectors.map(selector => {
      try {
        return [...document.querySelectorAll(selector)].filter(visible)
          .map(element => element instanceof HTMLInputElement ? element.value : label(element)).join('|');
      } catch { return ''; }
    }).join('::');
    const cartSignature = () => config.cartSelectors.map(selector => {
      try { return [...document.querySelectorAll(selector)].filter(visible).map(label).join('|'); }
      catch { return ''; }
    }).join('::');
    const clickExtraQuantity = async start => {
      let clicks = 0;
      for (let index = start; index < item.quantity; index += 1) {
        const plus = await waitFor(() => find(config.plusSelectors), 5000);
        if (!plus) return { complete: false, clicks };
        click(plus);
        clicks += 1;
        await sleep(700);
      }
      return { complete: true, clicks };
    };
    const sameOriginJson = async (url, init) => {
      const response = await fetch(url, { credentials: 'include', ...init });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    };
    const tryShopify = async () => {
      if (config.apiMode !== 'shopify') return false;
      try {
        const productPath = new URL(item.productUrl).pathname.replace(/\\/$/, '');
        const product = await sameOriginJson(productPath + '.js');
        const variants = Array.isArray(product?.variants) ? product.variants : [];
        const wanted = String(item.sku || '');
        const variant = variants.find(entry => (
          String(entry?.id || '') === wanted
          || String(entry?.sku || '') === wanted
          || String(entry?.barcode || '') === wanted
        )) || variants.find(entry => entry?.available !== false) || variants[0];
        if (!variant?.id) return false;
        const before = await sameOriginJson('/cart.js');
        const beforeLine = Array.isArray(before?.items)
          ? before.items.find(entry => String(entry?.variant_id || entry?.id) === String(variant.id))
          : null;
        const beforeQuantity = Number(beforeLine?.quantity) || 0;
        await sameOriginJson('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ items: [{ id: variant.id, quantity: item.quantity }] }),
        });
        const after = await sameOriginJson('/cart.js');
        const line = Array.isArray(after?.items)
          ? after.items.find(entry => String(entry?.variant_id || entry?.id) === String(variant.id))
          : null;
        return (Number(line?.quantity) || 0) >= beforeQuantity + item.quantity;
      } catch { return false; }
    };
    const vtexProducts = async () => {
      const sku = String(item.sku || '').trim();
      if (sku) {
        const bySku = await sameOriginJson('/api/catalog_system/pub/products/search?fq=skuId:' + encodeURIComponent(sku));
        if (Array.isArray(bySku) && bySku.length) return bySku;
      }
      const path = new URL(item.productUrl).pathname.replace(/^\\/+|\\/+$/g, '');
      const productMatch = path.match(/(?:^|\\/)product\\/([^/]+)$/i);
      const slug = path.endsWith('/p') ? path : productMatch ? productMatch[1] + '/p' : '';
      if (!slug) return [];
      const bySlug = await sameOriginJson('/api/catalog_system/pub/products/search/' + slug);
      return Array.isArray(bySlug) ? bySlug : [];
    };
    const tryVtex = async () => {
      if (config.apiMode !== 'vtex') return false;
      try {
        const products = await vtexProducts();
        const offers = products.flatMap(product => (
          Array.isArray(product?.items) ? product.items : []
        )).flatMap(entry => (
          Array.isArray(entry?.sellers) ? entry.sellers.map(seller => ({ entry, seller })) : []
        )).filter(({ seller }) => (
          Number(seller?.commertialOffer?.AvailableQuantity) > 0
          && Number(seller?.commertialOffer?.Price) > 0
        ));
        const offer = offers[0];
        const sku = String(offer?.entry?.itemId || '').trim();
        if (!sku) return false;
        const orderForm = await sameOriginJson('/api/checkout/pub/orderForm');
        const orderFormId = String(orderForm?.orderFormId || '').trim();
        if (!orderFormId) return false;
        const beforeLine = Array.isArray(orderForm?.items)
          ? orderForm.items.find(entry => String(entry?.id) === sku)
          : null;
        const beforeQuantity = Number(beforeLine?.quantity) || 0;
        const updated = await sameOriginJson(
          '/api/checkout/pub/orderForm/' + encodeURIComponent(orderFormId) + '/items?sc=1',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ orderItems: [{
              id: sku,
              quantity: item.quantity,
              seller: String(offer?.seller?.sellerId || '1'),
            }] }),
          },
        );
        const line = Array.isArray(updated?.items)
          ? updated.items.find(entry => String(entry?.id) === sku)
          : null;
        return (Number(line?.quantity) || 0) >= beforeQuantity + item.quantity;
      } catch { return false; }
    };
    void (async () => {
      setDetail('Producto ' + payload.current + ' de ' + payload.total + ': ' + item.name);
      const body = normalize(document.body?.innerText);
      if (payload.blockedText.some(text => body.includes(normalize(text)))) {
        requireUser('La tienda pide una verificación humana. Complétala aquí y continúa.');
        return;
      }
      const center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      const modal = center?.closest?.('[role="dialog"],dialog,[aria-modal="true"],[class*="modal" i]');
      const modalText = normalize(modal?.textContent);
      if (modalText && payload.interventionText.some(text => modalText.includes(normalize(text)))) {
        requireUser('La tienda necesita inicio de sesión, ubicación o despacho. Completa el paso aquí y continúa.');
        return;
      }
      const apiAdded = await tryShopify() || await tryVtex();
      if (apiAdded) {
        const detail = 'Agregado y verificado con cantidad ' + item.quantity + '.';
        setDetail(detail);
        post({ action: 'item-result', itemId: item.id, status: 'added', detail });
        window.__conviveManagedCartRunning = false;
        return;
      }
      const add = await waitFor(() => find(config.addSelectors));
      if (!add) {
        requireUser('No encontramos el botón de agregar. Agrégalo manualmente en esta ficha y continúa.');
        return;
      }
      const beforeCart = cartSignature();
      const beforeQuantity = signature();
      let quantity = { complete: true, clicks: 0 };
      if (config.quantityBeforeAdd) quantity = await clickExtraQuantity(1);
      if (!(config.quantityControlAddsToCart && quantity.clicks > 0)) click(add);
      await sleep(1600);
      const changed = await waitFor(() => {
        const afterCart = cartSignature();
        const afterQuantity = signature();
        return (afterCart && afterCart !== beforeCart) || (afterQuantity && afterQuantity !== beforeQuantity);
      }, 8000);
      if (!changed) {
        requireUser('El sitio recibió el intento, pero no pudimos confirmar el cambio. Revisa el producto y continúa.');
        return;
      }
      if (!config.quantityBeforeAdd) quantity = await clickExtraQuantity(1);
      const detail = quantity.complete
        ? 'Agregado y verificado con cantidad ' + item.quantity + '.'
        : 'Producto agregado; revisa la cantidad antes de pagar.';
      setDetail(detail);
      post({ action: 'item-result', itemId: item.id, status: 'added', detail });
      window.__conviveManagedCartRunning = false;
    })().catch(error => {
      post({
        action: 'item-result',
        itemId: item.id,
        status: 'failed',
        detail: error instanceof Error ? error.message : 'La tienda interrumpió la carga.',
      });
      window.__conviveManagedCartRunning = false;
    });
  })();`;
}

function progress(
  store: SupermarketStore,
  current: number,
  total: number,
  added: number,
  failed: number,
  status: SupermarketManagedCartProgress['status'],
  detail: string,
  itemName?: string,
): SupermarketManagedCartProgress {
  return { store, current, total, added, failed, status, detail, itemName };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Abre una sesión local de la tienda dentro de la app y recorre las fichas.
 * Las cookies permanecen en el dispositivo; Convive nunca recibe la clave ni
 * los datos de pago del supermercado.
 */
export async function openManagedRetailerCart(
  storeName: string,
  candidates: SupermarketSearchCandidate[],
  callbacks: SupermarketManagedCartCallbacks = {},
): Promise<SupermarketManagedCartStartResult> {
  if (!managedCartAvailable()) return { started: false, reason: 'native_required' };
  const store = asStore(storeName);
  if (!store) return { started: false, reason: 'invalid_store' };
  const items = managedCartItems(store, candidates);
  if (items.length === 0) return { started: false, reason: 'empty_cart' };

  try {
    const { InAppBrowser, ToolBarType } = await import('@capgo/capacitor-inappbrowser');
    const config = MANAGED_STORES[store];
    const viewState = { id: '' };
    let current = 0;
    let added = 0;
    let failed = 0;
    let finished = false;

    const report = (value: SupermarketManagedCartProgress) => callbacks.onProgress?.(value);
    const injectCurrent = async (targetId?: string) => {
      if (finished || current >= items.length) return;
      const item = items[current];
      report(progress(store, current + 1, items.length, added, failed, 'loading', `Cargando ${item.name}…`, item.name));
      await InAppBrowser.executeScript({
        id: targetId ?? viewState.id,
        code: buildManagedCartItemScript(config, item, current + 1, items.length),
      });
    };

    const loadedListener = await InAppBrowser.addListener('browserPageLoaded', event => {
      if (finished || (viewState.id && event.id && event.id !== viewState.id)) return;
      void injectCurrent(event.id);
    });
    const messageListener = await InAppBrowser.addListener('messageFromWebview', event => {
      if (viewState.id && event.id && event.id !== viewState.id) return;
      const detail = asRecord(event.detail);
      if (detail?.source !== 'convive-managed-cart') return;
      if (detail.action === 'resume') {
        void injectCurrent(event.id);
        return;
      }
      if (detail.action === 'needs-user') {
        report(progress(
          store,
          current + 1,
          items.length,
          added,
          failed,
          'needs_user',
          typeof detail.detail === 'string' ? detail.detail : 'Completa el paso solicitado en la tienda.',
          items[current]?.name,
        ));
        return;
      }
      if (detail.action !== 'item-result' || detail.itemId !== items[current]?.id) return;
      if (detail.status === 'added') added += 1;
      else failed += 1;
      current += 1;
      if (current >= items.length) {
        finished = true;
        report(progress(
          store,
          items.length,
          items.length,
          added,
          failed,
          'completed',
          failed === 0
            ? `Carro cargado con ${added} productos. Revísalo antes de pagar.`
            : `Carro abierto: ${added} cargados y ${failed} pendientes de revisión.`,
        ));
        void InAppBrowser.setUrl({ id: event.id ?? viewState.id, url: config.cartUrl });
        return;
      }
      void InAppBrowser.setUrl({ id: event.id ?? viewState.id, url: items[current].productUrl });
    });
    const closeListener = await InAppBrowser.addListener('closeEvent', event => {
      if (viewState.id && event.id && event.id !== viewState.id) return;
      if (!finished) {
        report(progress(store, current, items.length, added, failed, 'cancelled', 'La carga se cerró antes de terminar.'));
      }
      void loadedListener.remove();
      void messageListener.remove();
      void closeListener.remove();
    });

    report(progress(store, 0, items.length, 0, 0, 'opening', `Abriendo ${store}…`));
    const opened = await InAppBrowser.openWebView({
      url: items[0].productUrl,
      toolbarType: ToolBarType.NAVIGATION,
      title: `Carro de ${store}`,
      persistWebViewData: true,
      isPresentAfterPageLoad: false,
      openBlankTargetInWebView: true,
      preventDeeplink: false,
    });
    viewState.id = opened.id;
    return { started: true };
  } catch {
    callbacks.onProgress?.(progress(store, 0, items.length, 0, 0, 'error', 'No se pudo abrir el navegador de compra.'));
    return { started: false, reason: 'open_failed' };
  }
}
