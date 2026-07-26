import type { CartItem } from '@/lib/agentBrain';
import { buildSelectionReason } from '@/lib/supermarketText';

export interface ScrapedItem {
  name: string;
  brand: string;
  quantity: number;
  price: number;
  store: 'Jumbo' | 'Lider' | 'Unimarc' | 'Santa Isabel' | 'Tottus';
  isOffer?: boolean;
  originalPrice?: number;
  /** The search query that produced this item. */
  query: string;
  /** requestedTerm para compatibilidad con CartItem */
  requestedTerm?: string;
  /** Public product page URL, when available. */
  productUrl?: string;
  /** Product image URL, when available. */
  imageUrl?: string;
  /** SKU or EAN, when available. */
  sku?: string;
  /** EAN, when available. */
  ean?: string;
  /** Explicación del criterio de selección de marca/presentación. */
  selectionReason?: string;
  /** Cantidad solicitada por el usuario (ej: 5 kilos → 5). */
  userQuantity?: number;
  /** Precio total = price × userQuantity. */
  totalPrice?: number;
}

export interface BasketComparison {
  store: ScrapedItem['store'];
  items: ScrapedItem[];
  subtotal: number;
  coveredCount: number;
  requestedCount: number;
  coveragePercent: number;
  missingTerms: string[];
  complete: boolean;
  /** Tiendas que fallaron al scrapear este término. */
  failedStores?: string[];
}

export interface LiveSearchResult {
  items: ScrapedItem[];
  message: string;
  /** Canasta recomendada (todos los productos de una sola tienda) */
  recommendedBasket?: BasketComparison;
  /** Todas las canastas comparadas */
  basketComparison?: BasketComparison[];
  /** Tiendas con circuit breaker abierto o errores persistentes */
  degradedStores?: string[];
}

export interface QuantityInfo {
  quantity: number;
  unit: string;
  cleanTerm: string;
}

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_SEARCH_TERMS = 20;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_MS = 60_000;

const SEARCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/json',
  'Accept-Language': 'es-CL,es;q=0.9',
  'User-Agent': 'Mozilla/5.0 (compatible; ConviveConnect/1.0; +https://conviveconnect.com)',
};

const STOP_WORDS = new Set([
  'a', 'al', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'los', 'para', 'por', 'un', 'una',
  'comprar', 'compra', 'necesito', 'quiero', 'agrega', 'agregar', 'añade', 'añadir', 'lista',
  'kilos', 'kilo', 'gramos', 'gramo', 'litros', 'litro', 'unidades', 'unidad', 'packs', 'pack',
  'botellas', 'botella', 'latas', 'lata', 'cajas', 'caja', 'bolsas', 'bolsa',
]);

/**
 * Marcas reconocidas en Chile. Se usa para priorizar productos de marca
 * cuando el usuario no especifica una. Private labels tienen score negativo.
 */
const BRAND_TIERS: Record<string, number> = {
  // Tier +30: Marcas nacionales sólidas
  soprole: 30, colun: 30, 'tucapel': 30, carozzi: 30, lucchetti: 30,
  calvo: 30, ideal: 30, cachantun: 30, vital: 30, watts: 30,
  elite: 30, colgate: 30, arroz: 30, 'grano de oro': 30, machefert: 30,
  iansa: 30, lobos: 30, 'super pollo': 30, 'el corral': 30,
  // Tier +15: Marcas internacionales / grandes conocidas
  nestle: 15, maggi: 15, knorr: 15, 'coca-cola': 15, pepsi: 15,
  ariel: 15, omo: 15, 'head & shoulders': 15, pantene: 15,
  // Tier -20: Private labels (se penalizan para evitar "leche Lider" por defecto)
  lider: -20, jumbo: -20, unimarc: -20, tottus: -20, 'first price': -20,
  selecta: -20, economico: -20, 'santa isabel': -20, 'master dog': -20,
  'top house': -20, 'home care': -20,
};

/** Mapa de unidades normalizadas. */
const UNIT_ALIASES: Record<string, string> = {
  kg: 'kg', kilo: 'kg', kilos: 'kg',
  g: 'g', gr: 'g', gramo: 'g', gramos: 'g',
  l: 'l', lt: 'l', litro: 'l', litros: 'l',
  ml: 'ml', cc: 'ml',
  un: 'un', unid: 'un', unidad: 'un', unidades: 'un',
  pack: 'un', packs: 'un',
  botella: 'un', botellas: 'un',
  lata: 'un', latas: 'un',
  caja: 'un', cajas: 'un',
  bolsa: 'un', bolsas: 'un',
};

/** Categorías para sustitutos inteligentes. */
const CATEGORIES: Record<string, string[]> = {
  leche: ['leche', 'leche descremada', 'leche semidescremada', 'leche entera', 'leche en polvo', 'bebida lactea'],
  arroz: ['arroz', 'arroz integral', 'arroz precocido'],
  fideos: ['fideos', 'pasta', 'spaghetti', 'tallarines', 'macarron', 'lasagna'],
  azucar: ['azucar', 'azucar flor', 'azucar morena', 'edulcorante'],
  aceite: ['aceite', 'aceite de oliva', 'aceite vegetal'],
  huevos: ['huevos', 'huevo'],
  pollo: ['pollo', 'pechuga', 'pierna', 'alas'],
  carne: ['carne', 'carne molida', 'vacuno', 'cerdo'],
  atun: ['atun', 'jurel', 'sardina', 'pescado enlatado'],
  pan: ['pan', 'pan molde', 'pan integral', 'tortillas', 'hallulla', 'marraqueta'],
  tomate: ['tomate', 'tomate triturado', 'salsa de tomate'],
  cebolla: ['cebolla', 'cebolla morada'],
  papa: ['papa', 'papas'],
  cafe: ['cafe', 'cafe instantaneo', 'nesCafe'],
  yogurt: ['yogurt', 'yoghurt', 'yogur'],
  queso: ['queso', 'queso rallado', 'queso crema'],
  mantequilla: ['mantequilla', 'margarina'],
  jamon: ['jamon', 'jamonada', 'salame', 'mortadela'],
  salchicha: ['salchicha', 'salchichas', 'longaniza', 'vienesa'],
  bebida: ['coca cola', 'pepsi', 'bebida', 'jugo', 'jugo naranja', 'nectar'],
  agua: ['agua', 'agua mineral'],
  papel: ['papel higienico', 'pañales', 'toalla de papel'],
  detergente: ['detergente', 'jabon en polvo', 'jabon liquido'],
  shampoo: ['shampoo', 'acondicionador', 'pasta dental', 'desodorante'],
  limpieza: ['lavandina', 'suavizante', 'desinfectante', 'cloro'],
};

/** Estado del circuit breaker por tienda. */
const CIRCUIT_BREAKER = new Map<string, { failures: number; lastFailure: number; open: boolean }>();

function checkCircuitBreaker(store: string): boolean {
  const state = CIRCUIT_BREAKER.get(store);
  if (!state) return false;
  if (state.open) {
    if (Date.now() - state.lastFailure > CIRCUIT_BREAKER_RESET_MS) {
      CIRCUIT_BREAKER.delete(store);
      return false;
    }
    return true;
  }
  return false;
}

function recordFailure(store: string): void {
  const state = CIRCUIT_BREAKER.get(store) ?? { failures: 0, lastFailure: 0, open: false };
  state.failures += 1;
  state.lastFailure = Date.now();
  if (state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.open = true;
    console.warn(`[supermarket] Circuit breaker OPEN for ${store}`);
  }
  CIRCUIT_BREAKER.set(store, state);
}

function recordSuccess(store: string): void {
  CIRCUIT_BREAKER.delete(store);
}

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

/** Extrae cantidad, unidad y término limpio de un string como "5 kilos de arroz" */
export function extractQuantity(term: string): QuantityInfo {
  const pattern = /(\d+(?:[.,]\d+)?)\s*(kg|kilo|kilos|g|gr|gramo|gramos|l|lt|litro|litros|ml|cc|un|unid|unidad|unidades|pack|packs|botella|botellas|lata|latas|caja|cajas|bolsa|bolsas)\s+(?:de\s+)?(.+)/i;
  const match = term.match(pattern);
  if (match) {
    const qty = parseFloat(match[1].replace(',', '.'));
    const rawUnit = match[2].toLowerCase();
    const unit = UNIT_ALIASES[rawUnit] || 'un';
    const cleanTerm = match[3].trim();
    return { quantity: Number.isFinite(qty) && qty > 0 ? qty : 1, unit, cleanTerm };
  }
  return { quantity: 1, unit: 'un', cleanTerm: term };
}

/** Detecta si el usuario mencionó una marca explícita en el término. */
function extractExplicitBrand(term: string): { brand: string | null; cleanTerm: string } {
  const normalized = normalize(term);
  const brands = Object.keys(BRAND_TIERS).sort((a, b) => b.length - a.length);
  for (const brand of brands) {
    const nb = normalize(brand);
    if (normalized.includes(nb)) {
      const regex = new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const cleanTerm = term.replace(regex, '').replace(/\s+/g, ' ').trim();
      return { brand: nb, cleanTerm: cleanTerm || term };
    }
  }
  return { brand: null, cleanTerm: term };
}

function brandScore(brand: string, explicitBrand: string | null = null): number {
  if (!brand) return 0;
  const key = normalize(brand);
  if (explicitBrand) {
    if (key === explicitBrand || key.includes(explicitBrand) || explicitBrand.includes(key)) {
      return 1_000_000;
    }
    return -100;
  }
  for (const [tierBrand, score] of Object.entries(BRAND_TIERS)) {
    if (key === tierBrand || key.includes(tierBrand)) return score;
    if (tierBrand.includes(key) && key.length > 2) return score;
  }
  return 0;
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

/**
 * Extrae términos de búsqueda del mensaje del usuario.
 * Ahora detecta cantidades y marcas explícitas.
 */
export function extractSupermarketTerms(message: string): Array<{ term: string; quantity: number; unit: string; explicitBrand: string | null }> {
  const cleaned = message
    .slice(0, 1_500)
    .replace(/^(?:hola[,!.\s]*)/i, '')
    .replace(/^(?:necesito|quiero|deseo)\s+(?:comprar|agregar|añadir)?\s*:*/i, '')
    .replace(/^(?:comprar|agregar|añadir)\s*:*/i, '')
    .trim();

  const rawTerms = cleaned
    .split(/[,;\n]+|\s+y\s+/i)
    .map(term => term.replace(/^(?:un|una|unos|unas)\s+/i, '').trim())
    .filter(term => term.length >= 2 && term.length <= 80);

  const uniqueTerms = [...new Set(rawTerms.map(term => term.toLowerCase()))].slice(0, MAX_SEARCH_TERMS);

  return uniqueTerms.map(term => {
    const qtyInfo = extractQuantity(term);
    const brandInfo = extractExplicitBrand(qtyInfo.cleanTerm);
    return {
      term: normalize(brandInfo.cleanTerm),
      quantity: qtyInfo.quantity,
      unit: qtyInfo.unit,
      explicitBrand: brandInfo.brand,
    };
  }).filter(t => t.term.length >= 2);
}

export function parseJumboProducts(html: string, query: string): ScrapedItem[] {
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
    const images = asArray(item?.images);
    const imageUrl = images.length > 0 ? asString((images[0] as Record<string, unknown>)?.imageUrl) : undefined;
    const productUrl = asString(item?.link) || asString(product?.link)
      || (asString(product?.linkText) ? `/${asString(product?.linkText)}/p` : '');
    if (!product || !item || !name || price <= 0 || item.stock === false) return [];

    return [{
      name,
      brand: asString(product.brand),
      quantity: 1,
      price,
      store: 'Jumbo' as const,
      isOffer: listPrice > price,
      originalPrice: listPrice > price ? listPrice : undefined,
      query,
      productUrl: productUrl ? `https://www.jumbo.cl${productUrl}` : undefined,
      imageUrl,
      sku: asString(item?.itemId) || undefined,
    }];
  });
}

export function parseSantaIsabelProducts(html: string, query: string): ScrapedItem[] {
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
    const images = asArray(item?.images);
    const imageUrl = images.length > 0 ? asString((images[0] as Record<string, unknown>)?.imageUrl) : undefined;
    const productUrl = asString(item?.link) || asString(product?.link)
      || (asString(product?.linkText) ? `/${asString(product?.linkText)}/p` : '');
    if (!product || !item || !offer || !name || price <= 0 || asNumber(offer.AvailableQuantity) <= 0) return [];

    return [{
      name,
      brand: asString(product.brand),
      quantity: 1,
      price,
      store: 'Santa Isabel' as const,
      isOffer: listPrice > price,
      originalPrice: listPrice > price ? listPrice : undefined,
      query,
      productUrl: productUrl ? `https://www.santaisabel.cl${productUrl}` : undefined,
      imageUrl,
      sku: asString(item?.itemId) || undefined,
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

function detectLiderOffer(html: string, productName: string): { isOffer: boolean; originalPrice?: number } {
  const offerPatterns = [
    /oferta/i,
    /\d+%\s*off/i,
    /descuento/i,
    /badge[^>]*offer/i,
    /class=["'][^"']*offer/i,
  ];
  const hasOfferBadge = offerPatterns.some(p => p.test(html));
  return { isOffer: hasOfferBadge };
}

export function parseLiderProducts(html: string, query: string): ScrapedItem[] {
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
    const brand = asString(asRecord(product.brand)?.name) || asString(product.brand);
    const sku = asString(product.sku) || undefined;
    const image = asArray(product.image)[0];
    const imageUrl = typeof image === 'string' ? image : undefined;
    if (product['@type'] !== 'Product' || !name || price <= 0) return [];

    const offerInfo = detectLiderOffer(html, name);
    const listPrice = asNumber(offer?.priceValidUntil ? offer?.price : undefined);
    const productUrl = asString(product.url) || undefined;

    return [{
      name,
      brand,
      quantity: 1,
      price,
      store: 'Lider' as const,
      isOffer: offerInfo.isOffer || listPrice > price,
      originalPrice: listPrice > price ? listPrice : undefined,
      query,
      productUrl,
      sku,
      imageUrl,
    }];
  });
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseChileanPrice(value: string): number {
  const match = decodeHtmlText(value).match(/\$\s*([\d.]+)/);
  if (!match) return 0;
  const parsed = Number(match[1].replace(/\./g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractCardText(card: string, classFragment: string): string {
  const expression = new RegExp(
    `<[^>]+class=["'][^"']*${classFragment}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    'i',
  );
  return decodeHtmlText(card.match(expression)?.[1] ?? '');
}

/**
 * Parser para el buscador actual de Unimarc.
 * La tienda entrega hasta 50 tarjetas SSR por consulta bajo /search?q=.
 */
export function parseUnimarcProducts(html: string, query: string): ScrapedItem[] {
  const nextDataMatch = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (nextDataMatch) {
    try {
      const root = asRecord(JSON.parse(nextDataMatch[1]));
      const queries = asArray(getPath(root, ['props', 'pageProps', 'dehydratedState', 'queries']));
      const products = queries.flatMap(entry => (
        asArray(getPath(entry, ['state', 'data', 'availableProducts']))
      ));
      if (products.length > 0) {
        return products.flatMap(productValue => {
          const product = asRecord(productValue);
          if (!product) return [];
          const seller = asRecord(asArray(product.sellers)[0]);
          const price = asNumber(seller?.price);
          const listPrice = asNumber(seller?.listPrice);
          const availableQuantity = asNumber(seller?.availableQuantity);
          const name = asString(product.name) || asString(product.nameComplete);
          const rawSlug = asString(product.slug) || asString(product.detailUrl);
          const slug = rawSlug.replace(/^\/+/, '').replace(/\/p\/?$/, '');
          const imageUrl = asArray(product.images).find(
            (value): value is string => typeof value === 'string',
          );
          if (!name || price <= 0 || availableQuantity <= 0) return [];

          return [{
            name,
            brand: asString(product.brand),
            quantity: 1,
            price,
            store: 'Unimarc' as const,
            isOffer: listPrice > price,
            originalPrice: listPrice > price ? listPrice : undefined,
            query,
            productUrl: slug ? `https://www.unimarc.cl/product/${slug}` : undefined,
            imageUrl,
            sku: asString(product.itemId) || asString(product.sku) || undefined,
            ean: asString(product.ean) || undefined,
          }];
        });
      }
    } catch {
      // Continúa al parser de tarjetas como respaldo ante cambios parciales.
    }
  }

  const starts = [...html.matchAll(/<section[^>]+id=["']shelf__vertical--[^"']+["'][^>]*>/gi)]
    .map(match => match.index)
    .filter((index): index is number => typeof index === 'number');

  return starts.flatMap((start, index) => {
    const card = html.slice(start, starts[index + 1] ?? html.length);
    const name = extractCardText(card, 'Shelf_nameProduct');
    const brand = extractCardText(card, 'Shelf_brandText');
    const href = card.match(/<a[^>]+href=["']([^"']*\/product\/[^"']+)["']/i)?.[1];
    const imageUrl = card.match(/<img[^>]+class=["'][^"']*Shelf_defaultImgStyle[^"']*["'][^>]+src=["']([^"']+)["']/i)?.[1]
      ?? card.match(/<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*Shelf_defaultImgStyle/i)?.[1];
    const priceEntries = [...card.matchAll(
      /<p[^>]+id=["']listPrice__offerPrice--([^"']+)["'][^>]*>([\s\S]*?)<\/p>/gi,
    )].map(match => ({
      id: match[1].toLowerCase(),
      text: decodeHtmlText(match[2]),
      value: parseChileanPrice(match[2]),
    }));
    const discount = priceEntries.find(entry => entry.id.includes('discountprice'));
    const list = priceEntries.find(entry => entry.id.includes('listprice'));
    const simpleDiscount = discount && !/^\d+\s*x\b/i.test(discount.text) ? discount : undefined;
    const price = simpleDiscount?.value || list?.value || 0;
    const originalPrice = simpleDiscount && list && list.value > price ? list.value : undefined;
    if (!name || !href || price <= 0) return [];

    return [{
      name,
      brand,
      quantity: 1,
      price,
      store: 'Unimarc' as const,
      isOffer: Boolean(originalPrice),
      originalPrice,
      query,
      productUrl: href.startsWith('http') ? href : `https://www.unimarc.cl${href}`,
      imageUrl,
    }];
  });
}

/** Parser del endpoint público JSON que usa el buscador de Tottus. */
export function parseTottusProducts(payload: string, query: string): ScrapedItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return [];
  }
  const root = asRecord(parsed);
  const data = asRecord(root?.data) ?? root;
  const products = asArray(data?.results);

  return products.flatMap(productValue => {
    const product = asRecord(productValue);
    if (!product) return [];
    const name = asString(product.displayName);
    const prices = asArray(product.prices).map(asRecord).filter(
      (price): price is Record<string, unknown> => price !== null,
    );
    const current = prices.find(price => price.crossed !== true && asString(price.type) === 'internetPrice')
      ?? prices.find(price => price.crossed !== true);
    const regular = prices.find(price => price.crossed === true || asString(price.type) === 'normalPrice');
    const parsePriceArray = (price: Record<string, unknown> | undefined): number => {
      const value = asArray(price?.price)[0];
      if (typeof value === 'number') return value;
      if (typeof value !== 'string') return 0;
      const parsedPrice = Number(value.replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(parsedPrice) ? parsedPrice : 0;
    };
    const price = parsePriceArray(current);
    const listPrice = parsePriceArray(regular);
    const baseUrl = asString(product.url);
    const sku = asString(product.skuId) || asString(product.offeringId);
    const productUrl = baseUrl && sku && !baseUrl.endsWith(`/${sku}`) ? `${baseUrl}/${sku}` : baseUrl;
    const imageUrl = asArray(product.mediaUrls).find((value): value is string => typeof value === 'string');
    if (!name || price <= 0) return [];

    return [{
      name,
      brand: asString(product.brand),
      quantity: 1,
      price,
      store: 'Tottus' as const,
      isOffer: listPrice > price,
      originalPrice: listPrice > price ? listPrice : undefined,
      query,
      productUrl: productUrl || undefined,
      imageUrl,
      sku: sku || undefined,
    }];
  });
}

async function fetchWithTimeout(url: string): Promise<string> {
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

async function fetchRetailerHtml(url: string, store: ScrapedItem['store']): Promise<string> {
  if (checkCircuitBreaker(store)) {
    throw new Error(`Circuit breaker abierto para ${store}. Reintentando en ${CIRCUIT_BREAKER_RESET_MS / 1000}s.`);
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fetchWithTimeout(url);
      recordSuccess(store);
      return result;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`[supermarket] ${store} attempt ${attempt + 1}/${MAX_RETRIES + 1} failed: ${errorMessage}`);

      if (isLastAttempt) {
        recordFailure(store);
        throw new Error(`${store} no respondió después de ${MAX_RETRIES + 1} intentos: ${errorMessage}`);
      }

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt)));
    }
  }

  throw new Error('Unreachable');
}

function uniqueScrapedItems(items: ScrapedItem[]): ScrapedItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.sku || item.ean || item.productUrl || `${item.store}:${item.name}:${item.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Scrapea TODOS los productos de una tienda para un término de búsqueda. */
export async function searchAllRetailerProducts(
  store: ScrapedItem['store'],
  query: string,
  options: { pages?: number } = {},
): Promise<ScrapedItem[]> {
  const pages = Math.min(2, Math.max(1, Math.round(options.pages ?? 1)));
  try {
    if (store === 'Jumbo') {
      const html = await fetchRetailerHtml(`https://www.jumbo.cl/busqueda?ft=${encodeURIComponent(query)}`, store);
      return parseJumboProducts(html, query);
    }
    if (store === 'Santa Isabel') {
      const html = await fetchRetailerHtml(`https://www.santaisabel.cl/busqueda?ft=${encodeURIComponent(query)}`, store);
      return parseSantaIsabelProducts(html, query);
    }
    if (store === 'Lider') {
      const html = await fetchRetailerHtml(`https://www.lider.cl/supermercado/search?query=${encodeURIComponent(query)}`, store);
      return parseLiderProducts(html, query);
    }
    if (store === 'Unimarc') {
      const payloads = await Promise.all(Array.from({ length: pages }, (_, index) => (
        fetchRetailerHtml(
          `https://www.unimarc.cl/search?q=${encodeURIComponent(query)}&suggestions=true&page=${index + 1}`,
          store,
        )
      )));
      return uniqueScrapedItems(payloads.flatMap(payload => parseUnimarcProducts(payload, query)));
    }
    if (store === 'Tottus') {
      const payloads = await Promise.all(Array.from({ length: pages }, (_, index) => (
        fetchRetailerHtml(
          `https://www.tottus.cl/s/browse/v1/search/cl?Ntt=${encodeURIComponent(query)}&store=to_com&subdomain=tottus&pgid=34&pid=9e635d19-b626-4171-8beb-d92e58c2a417&page=${index + 1}`,
          store,
        )
      )));
      return uniqueScrapedItems(payloads.flatMap(payload => parseTottusProducts(payload, query)));
    }
  } catch (error) {
    console.warn(`[supermarket] Error buscando en ${store} para "${query}":`, error);
  }
  return [];
}

/** Legacy: busca el mejor producto de UNA tienda para UN término. */
async function searchOneRetailer(store: CartItem['store'], query: string): Promise<CartItem | undefined> {
  const items = await searchAllRetailerProducts(store as ScrapedItem['store'], query);
  const best = pickRelevant(items, query);
  if (!best) return undefined;
  return {
    name: best.name,
    brand: best.brand,
    quantity: best.quantity,
    price: best.price,
    store: best.store,
    isOffer: best.isOffer,
    originalPrice: best.originalPrice,
    requestedTerm: query,
  };
}

/** Busca sustitutos por categoría cuando no hay match exacto. */
function findSubstitute(
  products: ScrapedItem[],
  term: string,
  explicitBrand: string | null,
): ScrapedItem | undefined {
  const normalizedTerm = normalize(term);
  let termCategory: string | null = null;
  for (const [category, synonyms] of Object.entries(CATEGORIES)) {
    if (synonyms.some(s => normalizedTerm.includes(normalize(s)))) {
      termCategory = category;
      break;
    }
  }
  if (!termCategory) return undefined;

  const categorySynonyms = CATEGORIES[termCategory];
  const substitutes = products.filter(item => {
    const normalizedName = normalize(item.name);
    return categorySynonyms.some(s => normalizedName.includes(normalize(s)));
  });

  if (substitutes.length === 0) return undefined;

  const scored = substitutes
    .map(item => ({
      item,
      bScore: brandScore(item.brand, explicitBrand),
    }))
    .sort((a, b) => b.bScore - a.bScore || a.item.price - b.item.price);

  return scored[0]?.item;
}

function selectBestForStore(
  items: ScrapedItem[],
  query: string,
  explicitBrand: string | null,
): ScrapedItem | undefined {
  if (items.length === 0) return undefined;

  const scored = items
    .map(item => {
      const relevance = scoreMatch(item.name, query);
      const bScore = brandScore(item.brand, explicitBrand);
      const effectivePrice = item.isOffer && item.originalPrice ? item.price : item.price;
      const compositeScore = relevance * 10 + bScore - (effectivePrice / 100);
      return { item, relevance, compositeScore };
    })
    .filter(s => s.relevance >= 0)
    .sort((a, b) => b.compositeScore - a.compositeScore);

  if (scored.length > 0) return scored[0].item;
  return findSubstitute(items, query, explicitBrand);
}

/**
 * Compara canastas completas por tienda.
 * Para cada término, selecciona el mejor producto disponible en CADA tienda.
 */
export async function buildLiveBasketComparison(message: string): Promise<LiveSearchResult> {
  const termInfos = extractSupermarketTerms(message);
  if (termInfos.length === 0) {
    return { items: [], message: 'Indica uno o más productos para buscar precios reales.' };
  }

  const stores: ScrapedItem['store'][] = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus'];

  const termResults = await Promise.all(
    termInfos.map(async (info) => {
      const allProducts = await Promise.all(
        stores.map(store => searchAllRetailerProducts(store, info.term))
      );
      const productsByStore = new Map<ScrapedItem['store'], ScrapedItem[]>();
      const failedStores: string[] = [];
      stores.forEach((store, idx) => {
        const products = allProducts[idx];
        if (products.length === 0 && checkCircuitBreaker(store)) {
          failedStores.push(store);
        }
        productsByStore.set(store, products);
      });
      return { term: info.term, quantity: info.quantity, unit: info.unit, explicitBrand: info.explicitBrand, productsByStore, failedStores };
    })
  );

  const baskets: BasketComparison[] = stores.map(store => {
    const items: ScrapedItem[] = [];
    const missingTerms: string[] = [];
    const failedForStore: string[] = [];

    for (const { term, quantity, explicitBrand, productsByStore, failedStores } of termResults) {
      const storeProducts = productsByStore.get(store) ?? [];
      const best = selectBestForStore(storeProducts, term, explicitBrand);
      if (best) {
        items.push({
          ...best,
          userQuantity: quantity,
          totalPrice: best.price * quantity,
          selectionReason: buildSelectionReason({
            brand: best.brand,
            explicitBrand,
            optionCount: storeProducts.length,
            store,
            isOffer: best.isOffer,
          }),
        });
      } else {
        missingTerms.push(term);
        if (failedStores.includes(store)) failedForStore.push(store);
      }
    }

    return {
      store,
      items,
      subtotal: items.reduce((sum, item) => sum + (item.totalPrice ?? item.price), 0),
      coveredCount: items.length,
      requestedCount: termInfos.length,
      coveragePercent: termInfos.length > 0 ? Math.round(items.length * 100 / termInfos.length) : 0,
      missingTerms,
      complete: missingTerms.length === 0 && termInfos.length > 0,
      failedStores: [...new Set(failedForStore)].length > 0 ? [...new Set(failedForStore)] : undefined,
    };
  }).filter(basket => basket.coveredCount > 0)
    .sort((left, right) => (
      Number(right.complete) - Number(left.complete)
      || right.coveredCount - left.coveredCount
      || left.subtotal - right.subtotal
    ));

  const bestBasket = baskets[0];

  if (!bestBasket) {
    return { items: [], message: 'No fue posible encontrar esos productos en las fuentes disponibles.' };
  }

  const ready = bestBasket.complete;
  const degradedStores = stores.filter(store => checkCircuitBreaker(store));

  let resultMessage = ready
    ? `🛒 Canasta completa en **${bestBasket.store}** por $${bestBasket.subtotal.toLocaleString('es-CL')}.`
    : `🛒 ${bestBasket.store} cubre ${bestBasket.coveredCount} de ${bestBasket.requestedCount} productos por $${bestBasket.subtotal.toLocaleString('es-CL')}.`;

  if (bestBasket.missingTerms.length > 0) {
    resultMessage += `\n❌ No encontré: ${bestBasket.missingTerms.join(', ')}.`;
  }
  if (degradedStores.length > 0) {
    resultMessage += `\n⚠️ ${degradedStores.join(', ')} no respondió; resultados pueden estar incompletos.`;
  }

  return {
    items: bestBasket.items,
    message: resultMessage,
    recommendedBasket: bestBasket,
    basketComparison: baskets,
    degradedStores: degradedStores.length > 0 ? degradedStores : undefined,
  };
}

/**
 * Legacy compat: busca productos individuales (no agrupa por canasta).
 * Mantiene compatibilidad con código que espera items individuales.
 */
export async function searchLiveSupermarkets(message: string): Promise<LiveSearchResult> {
  const termInfos = extractSupermarketTerms(message);
  if (termInfos.length === 0) {
    return { items: [], message: 'Indica uno o más productos para buscar precios reales.' };
  }

  const stores: ScrapedItem['store'][] = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus'];
  const results = await Promise.all(termInfos.map(async info => {
    const settled = await Promise.allSettled(stores.map(store => searchOneRetailer(store, info.term)));
    const candidates = settled.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
    const selected = pickComparableBest(candidates);
    return selected ? { ...selected, requestedTerm: info.term } : undefined;
  }));

  const items = results.filter(
    (item): item is CartItem & { requestedTerm: string } => item !== undefined,
  );
  const storeNames = [...new Set(items.map(item => item.store))];
  const coverage = storeNames.length > 0 ? ` Fuentes con resultados: ${storeNames.join(', ')}.` : '';

  return {
    items: items.map(i => ({ ...i, query: i.requestedTerm || '' })),
    message: items.length > 0
      ? `Encontré ${items.length} producto(s) en fuentes públicas.${coverage}`
      : 'No encontré resultados en las fuentes disponibles.',
  };
}
