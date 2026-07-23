import type { CartItem } from '@/lib/agentBrain';

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_SEARCH_TERMS = 6;
const SEARCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-CL,es;q=0.9',
  'User-Agent': 'Mozilla/5.0 (compatible; ConviveConnect/1.0; +https://conviveconnect.com)',
};

const STOP_WORDS = new Set([
  'a', 'al', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'los', 'para', 'por', 'un', 'una',
  'comprar', 'compra', 'necesito', 'quiero', 'agrega', 'agregar', 'añade', 'añadir', 'lista',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.,-]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => asRecord(current)?.[key], value);
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scoreMatch(productName: string, query: string): number {
  const normalizedName = normalize(productName);
  const normalizedQuery = normalize(query);
  const tokens = normalizedQuery.split(' ').filter(token => token.length > 1 && !STOP_WORDS.has(token));
  if (tokens.length === 0) return 0;

  const matchedTokens = tokens.filter(token => normalizedName.includes(token)).length;
  if (matchedTokens < tokens.length) return -1;

  let score = matchedTokens * 20;
  if (normalizedName.includes(normalizedQuery)) score += 100;
  if (normalizedName.startsWith(normalizedQuery)) score += 20;
  return score;
}

function pickRelevant(items: CartItem[], query: string): CartItem | undefined {
  return items
    .map((item, index) => ({ item, index, score: scoreMatch(item.name, query) }))
    .filter(candidate => candidate.score >= 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.item;
}

function formatSignature(name: string): string {
  const normalized = normalize(name).replace(/\s+/g, ' ');
  const match = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|lt|ml|cc|un|unidad|unidades)\b/);
  if (!match) return '';
  const unit = match[2] === 'gr' ? 'g' : match[2] === 'lt' ? 'l' : match[2];
  return `${match[1].replace(',', '.')}${unit}`;
}

function pickComparableBest(items: CartItem[]): CartItem | undefined {
  if (items.length === 0) return undefined;
  const groups = new Map<string, CartItem[]>();

  for (const item of items) {
    const signature = formatSignature(item.name);
    const group = groups.get(signature) ?? [];
    group.push(item);
    groups.set(signature, group);
  }

  const comparable = [...groups.values()].sort((left, right) => right.length - left.length)[0] ?? items;
  return [...comparable].sort((left, right) => left.price - right.price)[0];
}

export function extractSupermarketTerms(message: string): string[] {
  const cleaned = message
    .slice(0, 300)
    .replace(/^(?:hola[,.!\s]*)/i, '')
    .replace(/^(?:necesito|quiero|deseo)\s+(?:comprar|agregar|añadir)?\s*:*/i, '')
    .replace(/^(?:comprar|agregar|añadir)\s*:*/i, '')
    .trim();

  const terms = cleaned
    .split(/[,;\n]+|\s+y\s+/i)
    .map(term => term.replace(/^(?:un|una|unos|unas)\s+/i, '').trim())
    .filter(term => term.length >= 2 && term.length <= 80);

  return [...new Set(terms.map(term => normalize(term)))].slice(0, MAX_SEARCH_TERMS);
}

export function parseJumboProducts(html: string): CartItem[] {
  const match = html.match(/<script[^>]+id=["']__REACT_QUERY_STATE__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return [];

  const root = asRecord(JSON.parse(match[1]));
  const queries = asArray(getPath(root, ['dehydratedState', 'queries']));
  const products = queries.flatMap(query => asArray(getPath(query, ['state', 'data', 'products'])));

  return products.flatMap(productValue => {
    const product = asRecord(productValue);
    const item = asRecord(asArray(product?.items)[0]);
    const price = asNumber(item?.price);
    const listPrice = asNumber(item?.listPrice);
    const name = asString(item?.name);
    if (!product || !item || !name || price <= 0 || item.stock === false) return [];

    return [{
      name,
      brand: asString(product.brand),
      quantity: 1,
      price,
      store: 'Jumbo' as const,
      isOffer: listPrice > price,
      originalPrice: listPrice > price ? listPrice : undefined,
    }];
  });
}

export function parseSantaIsabelProducts(html: string): CartItem[] {
  const match = html.match(/window\.__renderData\s*=\s*("(?:\\.|[^"\\])*")/);
  if (!match) return [];

  const serialized = JSON.parse(match[1]);
  if (typeof serialized !== 'string') return [];
  const root = asRecord(JSON.parse(serialized));
  const products = asArray(getPath(root, ['plp', 'plp_products', 'products']));

  return products.flatMap(productValue => {
    const product = asRecord(productValue);
    const item = asRecord(asArray(product?.items)[0]);
    const seller = asRecord(asArray(item?.sellers)[0]);
    const offer = asRecord(seller?.commertialOffer);
    const price = asNumber(offer?.Price);
    const listPrice = asNumber(offer?.ListPrice);
    const name = asString(product?.productName) || asString(item?.name);
    if (!product || !item || !offer || !name || price <= 0 || asNumber(offer.AvailableQuantity) <= 0) return [];

    return [{
      name,
      brand: asString(product.brand),
      quantity: 1,
      price,
      store: 'Santa Isabel' as const,
      isOffer: listPrice > price,
      originalPrice: listPrice > price ? listPrice : undefined,
    }];
  });
}

function collectLiderItems(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(collectLiderItems);
  const record = asRecord(value);
  if (!record) return [];
  if (record['@type'] === 'ItemList') {
    return asArray(record.itemListElement)
      .map(element => asRecord(asRecord(element)?.item))
      .filter((item): item is Record<string, unknown> => item !== null);
  }
  return Object.values(record).flatMap(collectLiderItems);
}

export function parseLiderProducts(html: string): CartItem[] {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const products = scripts.flatMap(script => {
    try {
      return collectLiderItems(JSON.parse(script[1]));
    } catch {
      return [];
    }
  });

  return products.flatMap(product => {
    const offer = asRecord(product.offers);
    const price = asNumber(offer?.price);
    const name = asString(product.name);
    if (product['@type'] !== 'Product' || !name || price <= 0) return [];

    return [{
      name,
      brand: asString(asRecord(product.brand)?.name) || asString(product.brand),
      quantity: 1,
      price,
      store: 'Lider' as const,
      isOffer: false,
    }];
  });
}

async function fetchRetailerHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: SEARCH_HEADERS,
      signal: controller.signal,
      next: { revalidate: 1_800 },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function liderSlug(query: string): string {
  return normalize(query).replace(/\s+/g, '-');
}

async function searchOneRetailer(store: CartItem['store'], query: string): Promise<CartItem | undefined> {
  if (store === 'Jumbo') {
    const html = await fetchRetailerHtml(`https://www.jumbo.cl/busqueda?ft=${encodeURIComponent(query)}`);
    return pickRelevant(parseJumboProducts(html), query);
  }
  if (store === 'Santa Isabel') {
    const html = await fetchRetailerHtml(`https://www.santaisabel.cl/busqueda?ft=${encodeURIComponent(query)}`);
    return pickRelevant(parseSantaIsabelProducts(html), query);
  }
  if (store === 'Lider') {
    const html = await fetchRetailerHtml(`https://super.lider.cl/v/${liderSlug(query)}`);
    return pickRelevant(parseLiderProducts(html), query);
  }
  return undefined;
}

export async function searchLiveSupermarkets(message: string) {
  const terms = extractSupermarketTerms(message);
  if (terms.length === 0) {
    return { items: [] as CartItem[], message: 'Indica uno o más productos para buscar precios reales.' };
  }

  const stores: CartItem['store'][] = ['Jumbo', 'Santa Isabel', 'Lider'];
  const results = await Promise.all(terms.map(async term => {
    const settled = await Promise.allSettled(stores.map(store => searchOneRetailer(store, term)));
    const candidates = settled.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
    return pickComparableBest(candidates);
  }));

  const items = results.filter((item): item is CartItem => item !== undefined);
  const storeNames = [...new Set(items.map(item => item.store))];
  const coverage = storeNames.length > 0 ? ` Fuentes con resultados: ${storeNames.join(', ')}.` : '';

  return {
    items,
    message: items.length > 0
      ? `Precios consultados en las páginas públicas de los supermercados.${coverage}`
      : 'No fue posible encontrar esos productos en las fuentes disponibles.',
  };
}
