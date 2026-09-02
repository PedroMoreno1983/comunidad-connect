import 'server-only';

import { foldAccents } from '@/lib/supermarketText';
import type {
  SupermarketCartHandoff,
  SupermarketCartHandoffItem,
  SupermarketStore,
} from '@/lib/types';

const VTEX_STORES: Partial<Record<SupermarketStore, string>> = {
  Jumbo: 'https://jumbo.vtexcommercestable.com.br',
  'Santa Isabel': 'https://santaisabel.vtexcommercestable.com.br',
  Unimarc: 'https://unimarc.vtexcommercestable.com.br',
};

const MAX_URL_LENGTH = 7_500;
const FETCH_TIMEOUT_MS = 10_000;
const LOOKUP_CONCURRENCY = 8;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((entry): entry is Record<string, unknown> => entry !== null)
    : [];
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json', 'Accept-Language': 'es-CL,es;q=0.9' },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function productWords(value: string): string[] {
  return foldAccents(value).split(/[^a-z0-9]+/).filter(word => word.length > 1);
}

function nameScore(expected: string, candidate: string): number {
  const wanted = productWords(expected);
  if (wanted.length === 0) return 0;
  const actual = new Set(productWords(candidate));
  return wanted.filter(word => actual.has(word)).length / wanted.length;
}

function vtexSlug(productUrl: string | undefined): string | null {
  if (!productUrl) return null;
  try {
    const path = new URL(productUrl).pathname.replace(/^\/+|\/+$/g, '');
    if (path.endsWith('/p')) return path;
    const product = path.match(/(?:^|\/)product\/([^/]+)$/i);
    return product ? `${product[1]}/p` : null;
  } catch {
    return null;
  }
}

function availableVtexOffers(products: Record<string, unknown>[], expectedName: string) {
  return products.flatMap(product => {
    const productName = text(product.productName);
    return records(product.items).flatMap(item => {
      const sku = text(item.itemId);
      const name = text(item.nameComplete) || productName;
      return records(item.sellers).flatMap(seller => {
        const offer = asRecord(seller.commertialOffer);
        if (!sku || number(offer?.AvailableQuantity) <= 0 || number(offer?.Price) <= 0) return [];
        return [{
          sku,
          seller: text(seller.sellerId) || '1',
          name,
          score: nameScore(expectedName, name),
          price: number(offer?.Price),
        }];
      });
    });
  }).sort((left, right) => right.score - left.score || left.price - right.price);
}

async function resolveVtexItem(
  base: string,
  item: SupermarketCartHandoffItem,
): Promise<{ sku: string; seller: string; quantity: number; name: string } | null> {
  const sku = text(item.sku);
  if (sku) {
    const products = records(await fetchJson(
      `${base}/api/catalog_system/pub/products/search?fq=skuId:${encodeURIComponent(sku)}`,
    ));
    const exact = availableVtexOffers(products, item.name)
      .find(offer => offer.sku === sku);
    if (exact) return { ...exact, quantity: item.quantity };
  }

  const slug = vtexSlug(item.productUrl);
  if (slug) {
    const products = records(await fetchJson(
      `${base}/api/catalog_system/pub/products/search/${slug}`,
    ));
    const offer = availableVtexOffers(products, item.name)[0];
    if (offer && offer.score >= 0.5) return { ...offer, quantity: item.quantity };
  }

  const products = records(await fetchJson(
    `${base}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(item.name)}&_from=0&_to=19`,
  ));
  const offer = availableVtexOffers(products, item.name)[0];
  return offer && offer.score >= 0.5 ? { ...offer, quantity: item.quantity } : null;
}

async function resolveInChunks<T, R>(
  values: T[],
  resolve: (value: T) => Promise<R>,
): Promise<R[]> {
  const output: R[] = [];
  for (let index = 0; index < values.length; index += LOOKUP_CONCURRENCY) {
    output.push(...await Promise.all(values.slice(index, index + LOOKUP_CONCURRENCY).map(resolve)));
  }
  return output;
}

function buildVtexUrl(
  base: string,
  resolved: Array<{ sku: string; seller: string; quantity: number; name: string }>,
) {
  const params = new URLSearchParams();
  const included: string[] = [];
  for (const item of resolved) {
    const next = new URLSearchParams(params);
    next.append('sku', item.sku);
    next.append('qty', String(item.quantity));
    next.append('seller', item.seller);
    next.set('sc', '1');
    next.set('redirect', 'true');
    const candidate = `${base}/checkout/cart/add?${next.toString()}`;
    if (candidate.length > MAX_URL_LENGTH) break;
    params.delete('sc');
    params.delete('redirect');
    params.append('sku', item.sku);
    params.append('qty', String(item.quantity));
    params.append('seller', item.seller);
    included.push(item.name);
  }
  params.set('sc', '1');
  params.set('redirect', 'true');
  return {
    url: included.length ? `${base}/checkout/cart/add?${params.toString()}` : null,
    included,
  };
}

async function resolveShopifyVariant(item: SupermarketCartHandoffItem) {
  if (!item.productUrl) return null;
  try {
    const url = new URL(item.productUrl);
    if (url.hostname !== 'irurzun.cl' && url.hostname !== 'www.irurzun.cl') return null;
    const product = asRecord(await fetchJson(`${url.origin}${url.pathname.replace(/\/+$/, '')}.js`));
    const variants = records(product?.variants);
    const wanted = text(item.sku);
    const variant = variants.find(entry => (
      text(entry.id) === wanted || text(entry.sku) === wanted || text(entry.barcode) === wanted
    )) ?? variants.find(entry => entry.available !== false) ?? variants[0];
    const id = text(variant?.id);
    return id ? { id, quantity: item.quantity, name: item.name } : null;
  } catch {
    return null;
  }
}

export function supportsDirectCartHandoff(store: string): boolean {
  return store === 'Irurzun' || Object.prototype.hasOwnProperty.call(VTEX_STORES, store);
}

export async function prepareDirectCartHandoff(
  store: string,
  items: SupermarketCartHandoffItem[],
): Promise<SupermarketCartHandoff> {
  if (store === 'Irurzun') {
    const resolved = await resolveInChunks(items, resolveShopifyVariant);
    const available = resolved.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const included: typeof available = [];
    for (const entry of available) {
      const next = [...included, entry];
      const url = `https://irurzun.cl/cart/${next.map(item => `${encodeURIComponent(item.id)}:${item.quantity}`).join(',')}`;
      if (url.length > MAX_URL_LENGTH) break;
      included.push(entry);
    }
    const includedNames = new Set(included.map(entry => entry.name));
    return {
      supported: included.length > 0,
      store,
      mode: 'direct_url',
      cartUrl: included.length
        ? `https://irurzun.cl/cart/${included.map(item => `${encodeURIComponent(item.id)}:${item.quantity}`).join(',')}`
        : undefined,
      plannedCount: included.length,
      missingItems: items.filter(item => !includedNames.has(item.name)).map(item => item.name),
      reason: included.length ? undefined : 'Irurzun no confirmó variantes disponibles para esta lista.',
    };
  }

  const base = VTEX_STORES[store as SupermarketStore];
  if (base) {
    const resolved = await resolveInChunks(items, item => resolveVtexItem(base, item));
    const available = resolved.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const built = buildVtexUrl(base, available);
    const includedNames = new Set(built.included);
    return {
      supported: Boolean(built.url),
      store,
      mode: 'direct_url',
      cartUrl: built.url ?? undefined,
      plannedCount: built.included.length,
      missingItems: items.filter(item => !includedNames.has(item.name)).map(item => item.name),
      reason: built.url ? undefined : `${store} no confirmó SKU y stock para esta lista.`,
    };
  }

  return {
    supported: false,
    store,
    mode: 'managed_webview',
    plannedCount: 0,
    missingItems: [],
    reason: 'Esta cadena necesita la sesión administrada de la app móvil.',
  };
}
