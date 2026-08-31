import 'server-only';

import { foldAccents } from '@/lib/supermarketText';
import type {
  SupermarketCheckoutQuote,
  SupermarketCheckoutQuoteItem,
  SupermarketCheckoutQuoteRequestItem,
} from '@/lib/types';

const VTEX_ACCOUNT_BASES: Record<string, string> = {
  Jumbo: 'https://jumbo.vtexcommercestable.com.br',
  'Santa Isabel': 'https://santaisabel.vtexcommercestable.com.br',
  Unimarc: 'https://unimarc.vtexcommercestable.com.br',
};

const LOOKUP_CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 10_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((row): row is Record<string, unknown> => row !== null)
    : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizedProductName(value: string): string {
  return foldAccents(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function productNameScore(expected: string, candidate: string): number {
  const normalizedExpected = normalizedProductName(expected);
  const normalizedCandidate = normalizedProductName(candidate);
  if (!normalizedExpected || !normalizedCandidate) return -1;
  if (normalizedExpected === normalizedCandidate) return 1_000;

  const expectedTokens = normalizedExpected.split(' ').filter(token => token.length > 1);
  const candidateTokens = new Set(normalizedCandidate.split(' ').filter(token => token.length > 1));
  if (expectedTokens.length === 0) return -1;
  const matched = expectedTokens.filter(token => candidateTokens.has(token)).length;
  const coverage = matched / expectedTokens.length;
  return coverage >= 0.8 ? Math.round(coverage * 500) : -1;
}

function productSlug(productUrl: string | undefined): string | null {
  if (!productUrl) return null;
  try {
    const path = new URL(productUrl).pathname.replace(/^\/+|\/+$/g, '');
    if (path.endsWith('/p')) return path;
    // Unimarc ya no usa /p en el storefront; el catálogo VTEX sigue siendo {linkText}/p.
    const unimarc = path.match(/(?:^|\/)product\/([^/]+)\/?$/i);
    return unimarc ? `${unimarc[1]}/p` : null;
  } catch {
    return null;
  }
}

function catalogSkuId(sku: string | undefined): string | null {
  const cleaned = (sku ?? '').trim();
  return /^[A-Za-z0-9_-]{1,40}$/.test(cleaned) ? cleaned : null;
}

async function fetchJson(
  url: string,
  init?: RequestInit,
  allowLookupFailure = false,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'es-CL,es;q=0.9',
        ...(init?.headers ?? {}),
      },
    });
    if (allowLookupFailure && (response.status === 400 || response.status === 404)) return [];
    if (!response.ok) {
      throw new Error(`VTEX respondio HTTP ${response.status}.`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function vtexSearchTerm(value: string): string {
  // El storefront antiguo de Unimarc rechaza `ft=` cuando el texto contiene
  // un porcentaje, aunque venga correctamente codificado como `%25`.
  return value.replace(/[%<>]/g, ' ').replace(/\s+/g, ' ').trim();
}

interface VtexOffer {
  name: string;
  sku: string;
  seller: string;
  price: number;
  listPrice: number;
  score: number;
}

function sellerFrom(seller: Record<string, unknown>): string {
  const id = asString(seller.sellerId).trim();
  return /^\d{1,8}$/.test(id) ? id : '1';
}

function availableOffers(product: Record<string, unknown>, expectedName?: string): VtexOffer[] {
  const productName = asString(product.productName);
  return asRecords(product.items).flatMap(item => {
    const sku = asString(item.itemId);
    const itemName = asString(item.nameComplete) || productName;
    return asRecords(item.sellers).flatMap(seller => {
      const commercialOffer = asRecord(seller.commertialOffer);
      const price = asNumber(commercialOffer?.Price);
      const available = asNumber(commercialOffer?.AvailableQuantity);
      if (!sku || price <= 0 || available <= 0) return [];
      const score = expectedName ? productNameScore(expectedName, itemName) : 1;
      if (score < 0) return [];
      return [{
        score,
        name: itemName,
        sku,
        seller: sellerFrom(seller),
        price,
        listPrice: Math.max(price, asNumber(commercialOffer?.ListPrice)),
      }];
    });
  });
}

function offerFromProduct(
  expectedName: string,
  product: Record<string, unknown>,
): Omit<VtexOffer, 'score'> | null {
  const productName = asString(product.productName);
  if (productNameScore(expectedName, productName) < 0) return null;
  const offers = availableOffers(product, expectedName)
    .sort((left, right) => right.score - left.score || left.price - right.price);
  const offer = offers[0];
  return offer ? { name: offer.name, sku: offer.sku, seller: offer.seller, price: offer.price, listPrice: offer.listPrice } : null;
}

function offerFromSku(
  product: Record<string, unknown>,
  sku: string,
): Omit<VtexOffer, 'score'> | null {
  const match = availableOffers(product).find(offer => offer.sku === sku);
  return match
    ? { name: match.name, sku: match.sku, seller: match.seller, price: match.price, listPrice: match.listPrice }
    : null;
}

function toQuoteItem(
  item: SupermarketCheckoutQuoteRequestItem,
  offer: Omit<VtexOffer, 'score'>,
): SupermarketCheckoutQuoteItem {
  return {
    id: item.id,
    requestedTerm: item.requestedTerm,
    name: offer.name,
    sku: offer.sku,
    seller: offer.seller,
    productUrl: item.productUrl,
    quantity: item.quantity,
    price: offer.price,
    lineTotal: offer.price * item.quantity,
  };
}

async function resolveProduct(
  store: string,
  item: SupermarketCheckoutQuoteRequestItem,
): Promise<SupermarketCheckoutQuoteItem | null> {
  const base = VTEX_ACCOUNT_BASES[store];
  if (!base) return null;

  const skuId = catalogSkuId(item.sku);
  if (skuId) {
    const bySku = asRecords(await fetchJson(
      `${base}/api/catalog_system/pub/products/search?fq=skuId:${skuId}`,
      undefined,
      true,
    ));
    const skuOffer = bySku
      .map(product => offerFromSku(product, skuId))
      .find((offer): offer is NonNullable<typeof offer> => offer !== null);
    if (skuOffer) return toQuoteItem(item, skuOffer);
  }

  const slug = productSlug(item.productUrl);
  let products: Record<string, unknown>[] = [];
  if (slug) {
    products = asRecords(await fetchJson(
      `${base}/api/catalog_system/pub/products/search/${slug}`,
      undefined,
      true,
    ));
  }
  let offers = products.flatMap(product => {
    const offer = offerFromProduct(item.name, product);
    return offer ? [offer] : [];
  });
  if (products.length === 0 || offers.length === 0) {
    products = asRecords(await fetchJson(
      `${base}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(vtexSearchTerm(item.name))}&_from=0&_to=19`,
    ));
    offers = products.flatMap(product => {
      const offer = offerFromProduct(item.name, product);
      return offer ? [offer] : [];
    });
  }

  offers.sort((left, right) => (
    productNameScore(item.name, right.name) - productNameScore(item.name, left.name)
    || left.price - right.price
  ));
  const offer = offers[0];
  if (!offer) return null;

  return toQuoteItem(item, offer);
}

async function resolveProducts(
  store: string,
  items: SupermarketCheckoutQuoteRequestItem[],
): Promise<Array<SupermarketCheckoutQuoteItem | null>> {
  const results: Array<SupermarketCheckoutQuoteItem | null> = [];
  for (let index = 0; index < items.length; index += LOOKUP_CONCURRENCY) {
    const chunk = items.slice(index, index + LOOKUP_CONCURRENCY);
    results.push(...await Promise.all(chunk.map(async item => {
      try {
        return await resolveProduct(store, item);
      } catch {
        // Una busqueda rechazada o intermitente no debe derribar toda la cesta.
        // El termino se informa como faltante y nunca se sustituye a ciegas.
        return null;
      }
    })));
  }
  return results;
}

function simulationLineTotal(item: Record<string, unknown>): number {
  const priceDefinition = asRecord(item.priceDefinition);
  const definitionTotal = asNumber(priceDefinition?.total);
  if (definitionTotal > 0) return definitionTotal / 100;
  const sellingPrice = asNumber(item.sellingPrice);
  const quantity = Math.max(1, asNumber(item.quantity));
  return sellingPrice > 0 ? sellingPrice * quantity / 100 : 0;
}

export function storeSupportsVtexQuote(store: string): boolean {
  return Object.prototype.hasOwnProperty.call(VTEX_ACCOUNT_BASES, store);
}

/**
 * Resolves the retailer SKU and then asks Checkout for a cart simulation. This
 * catches stale catalog identifiers and applies the same public promotions the
 * shopper will see before delivery or account-specific coupons.
 */
export async function quoteVtexBasket(
  store: string,
  requested: SupermarketCheckoutQuoteRequestItem[],
): Promise<SupermarketCheckoutQuote> {
  const base = VTEX_ACCOUNT_BASES[store];
  if (!base) throw new Error(`${store} no publica una cotizacion VTEX verificable.`);

  const resolved = await resolveProducts(store, requested);
  const available = resolved.filter((item): item is SupermarketCheckoutQuoteItem => item !== null);
  const missingTerms = requested.flatMap((item, index) => resolved[index] ? [] : [item.requestedTerm]);
  const catalogSubtotal = requested.reduce((sum, item) => sum + item.catalogLineTotal, 0);

  if (available.length === 0) {
    return {
      store,
      subtotal: 0,
      catalogSubtotal,
      items: [],
      missingTerms,
      quotedAt: new Date().toISOString(),
    };
  }

  const simulation = asRecord(await fetchJson(
    `${base}/api/checkout/pub/orderForms/simulation?sc=1&RnbBehavior=0`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: available.map(item => ({
          id: item.sku,
          quantity: item.quantity,
          seller: item.seller || '1',
        })),
        country: 'CHL',
      }),
    },
  ));
  const simulatedItems = asRecords(simulation?.items);
  const verifiedItems: SupermarketCheckoutQuoteItem[] = [];

  for (const [index, item] of available.entries()) {
    const simulated = simulatedItems.find(candidate => asNumber(candidate.requestIndex) === index);
    const lineTotal = simulated ? simulationLineTotal(simulated) : 0;
    if (
      !simulated
      || asString(simulated.id) !== item.sku
      || asString(simulated.availability) !== 'available'
      || lineTotal <= 0
    ) {
      continue;
    }
    verifiedItems.push({
      ...item,
      price: lineTotal / item.quantity,
      lineTotal,
    });
  }

  if (verifiedItems.length === 0 && available.length > 0) {
    // La simulación a veces rechaza un SKU vigente. Preferimos abrir el carro
    // con lo que el catálogo público ya confirmó en stock, no un checkout vacío.
    verifiedItems.push(...available);
  }

  const verifiedTerms = new Set(verifiedItems.map(item => item.requestedTerm));
  const stillMissing = requested
    .map(item => item.requestedTerm)
    .filter(term => !verifiedTerms.has(term));

  return {
    store,
    subtotal: verifiedItems.reduce((sum, item) => sum + item.lineTotal, 0),
    catalogSubtotal,
    items: verifiedItems,
    missingTerms: [...new Set(stillMissing)],
    quotedAt: new Date().toISOString(),
  };
}
