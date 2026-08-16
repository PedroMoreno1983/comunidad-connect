import { buildResilientPurchasePlan } from '@/lib/supermarketPurchasePlan';
import { foldAccents, matchAnchor, significantWords } from '@/lib/supermarketText';
import type { SupermarketBasketCandidate, SupermarketMeasurementUnit } from '@/lib/types';


export const SUPERMARKET_STORES = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus', 'aCuenta', 'Irurzun'] as const;

export const WHOLESALE_STORES = new Set<string>(['aCuenta', 'Irurzun']);

const MAX_REQUESTED_COUNT = 500;
const MAX_REQUESTED_MEASUREMENT = 50_000;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function inferredCountPackUnits(name: string, requestedTerm: string): number {
  const normalizedName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const normalizedTerm = requestedTerm
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const explicitPack = normalizedName.match(
    /\bpack(?:\s+de)?(?:\s+(?:latas?|botellas?|unidades?|un))?\s+(\d{1,3})\b(?!\s*(?:ml|cc|g|gr|kg|l|lt)\b)/,
  ) ?? normalizedName.match(
    /\bpack\b(?:\s+[a-z]+){0,6}\s+(\d{1,3})\s*(?:un\.?|unidades?|uds?)\b/,
  ) ?? normalizedName.match(
    /\bpack\b[^0-9]{0,80}\b(\d{1,3})\s*x\s*\d+(?:[.,]\d+)?\s*(?:ml|cc|g|gr|kg|l|lt)\b/,
  );
  if (explicitPack) return Math.max(1, Number(explicitPack[1]));
  if (/\b(?:six pack|sixpack)\b/.test(normalizedName)) return 6;

  // "12 huevos" means twelve units, not twelve trays. Keep this inference
  // narrow when the product name does not explicitly declare a pack, so
  // "2 arroz" still means two products, not units inside a package.
  if (!/\bhuevos?\b/.test(normalizedTerm)) return 1;
  if (/\bdocena\b/.test(normalizedName)) return 12;
  const match = normalizedName.match(/\b(\d{1,3})\s*(?:un\.?|unidades?|uds?)\b/);
  return match ? Math.max(1, Number(match[1])) : 1;
}

type QuantitySelection = { packs: number; suppliedQuantity: number };

export function normalizeRequestedQuantity(
  value: number,
  unit: SupermarketMeasurementUnit | undefined,
): number {
  const maximum = unit ? MAX_REQUESTED_MEASUREMENT : MAX_REQUESTED_COUNT;
  return Math.min(maximum, Math.max(1, Math.round(value || 1)));
}

function normalizedProductUnit(value: string): SupermarketMeasurementUnit {
  if (value === 'kg') return 'kg';
  if (value === 'g' || value === 'gr') return 'g';
  if (value === 'l' || value === 'lt') return 'l';
  return 'ml';
}

function unitBaseFactor(unit: SupermarketMeasurementUnit): number {
  return unit === 'kg' || unit === 'l' ? 1_000 : 1;
}

function unitDimension(unit: SupermarketMeasurementUnit): 'mass' | 'volume' {
  return unit === 'kg' || unit === 'g' ? 'mass' : 'volume';
}

function parseProductMeasurement(name: string) {
  const normalizedName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const match = normalizedName.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|lt|ml|cc)\b/);
  if (!match) return null;
  return {
    amount: Number(match[1].replace(',', '.')),
    unit: normalizedProductUnit(match[2]),
  };
}

function productMeasurementInBaseUnits(name: string): { dimension: 'mass' | 'volume'; amount: number } | null {
  const measurement = parseProductMeasurement(name);
  if (!measurement) return null;
  return {
    dimension: unitDimension(measurement.unit),
    amount: measurement.amount * unitBaseFactor(measurement.unit),
  };
}

/**
 * A bare category word is not permission to choose the cheapest tiny serving.
 * These defaults mirror what a Chilean household normally means in a shopping
 * list while preserving explicit requests such as "bebida lactea 200 ml".
 */
export function isProductSuitableForRequest(
  name: string,
  requestedTerm: string,
  requestedUnit: SupermarketMeasurementUnit | undefined,
): boolean {
  if (!isProductMeasurementCompatible(name, requestedUnit)) return false;
  const normalizedName = foldAccents(name);
  const normalizedTerm = foldAccents(requestedTerm);
  const measurement = productMeasurementInBaseUnits(name);
  const family = matchAnchor(requestedTerm);

  if (family === 'coca' && /\b(sprite|fanta)\b/.test(normalizedName)) return false;
  if (
    family === 'cerveza'
    && !/\bsin alcohol\b/.test(normalizedTerm)
    && /\b(?:sin alcohol|0(?:[,.]0)?°)\b/.test(normalizedName)
  ) {
    return false;
  }

  if (!requestedUnit && /\bpechuga\b/.test(normalizedTerm) && /\bpollo\b/.test(normalizedTerm)) {
    if (!/\bpechuga\b/.test(normalizedName) || !/\bpollo\b/.test(normalizedName) || /\bpavo\b/.test(normalizedName)) {
      return false;
    }
    if (/\b(apanad|asada|acaramelad|cocida|fiambre|jamon|rebozad)\w*\b/.test(normalizedName)) {
      return false;
    }
    return measurement === null
      || measurement.dimension === 'mass' && measurement.amount >= 500;
  }

  if (requestedUnit || significantWords(requestedTerm).length !== 1) return true;

  if (family === 'carne') {
    return Boolean(
      measurement?.dimension === 'mass'
      && measurement.amount >= 400
      && /\b(vacuno|res)\b/.test(normalizedName),
    );
  }
  if (family === 'longaniza') {
    return Boolean(measurement?.dimension === 'mass' && measurement.amount >= 400);
  }
  if (family === 'pisco') {
    return !/\b(sour|cocktail|coctel|mix|base|ice)\b/.test(normalizedName);
  }
  if (family === 'bebida') {
    if (/\b(lactea|vegetal|isotonica|energetica|polvo|vino|cerveza|alcohol)\b/.test(normalizedName)) {
      return false;
    }
    return Boolean(measurement?.dimension === 'volume' && measurement.amount >= 1_000);
  }
  if (family === 'leche') {
    if (/\b(avena|almendra|soya|coco|vegetal|manzana|frutilla|chocolate|platano|vainilla|sabor|bebida lactea|polvo)\b/.test(normalizedName)) {
      return false;
    }
    return Boolean(measurement?.dimension === 'volume' && measurement.amount >= 900);
  }
  return true;
}

export function isProductMeasurementCompatible(
  name: string,
  requestedUnit: SupermarketMeasurementUnit | undefined,
): boolean {
  if (!requestedUnit) return true;
  const measurement = parseProductMeasurement(name);
  return measurement !== null
    && measurement.amount > 0
    && unitDimension(measurement.unit) === unitDimension(requestedUnit);
}

export function calculateProductQuantity(
  name: string,
  requestedQuantity: number,
  requestedUnit: SupermarketMeasurementUnit | undefined,
  packUnits: number,
  minimumPacks = 1,
): QuantitySelection {
  if (requestedUnit) {
    const measurement = parseProductMeasurement(name);
    if (measurement && unitDimension(measurement.unit) === unitDimension(requestedUnit)) {
      const productInRequestedUnits = measurement.amount
        * unitBaseFactor(measurement.unit)
        / unitBaseFactor(requestedUnit);
      if (productInRequestedUnits > 0) {
        const packs = Math.max(minimumPacks, Math.ceil(requestedQuantity / productInRequestedUnits));
        return {
          packs,
          suppliedQuantity: Number((packs * productInRequestedUnits).toFixed(3)),
        };
      }
    }
  }

  const packs = Math.max(minimumPacks, Math.ceil(requestedQuantity / packUnits));
  return { packs, suppliedQuantity: packs * packUnits };
}
function formatSignature(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const match = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|lt|ml|cc)\b/)
    ?? normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(un|unidad|unidades)\b/);
  if (!match) return '';
  const unit = match[2] === 'gr' ? 'g' : match[2] === 'lt' ? 'l' : match[2];
  return `${match[1].replace(',', '.')}${unit}`;
}

function selectComparableRows(rows: Record<string, unknown>[]) {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const signature = formatSignature(asString(row.name));
    const group = groups.get(signature) ?? [];
    group.push(row);
    groups.set(signature, group);
  }

  return [...groups.entries()]
    .map(([signature, group]) => ({
      signature,
      rows: group,
      storeCount: new Set(group.map(row => asString(row.store))).size,
      relevance: Math.max(...group.map(row => asNumber(row.match_relevance))),
    }))
    .sort((left, right) => (
      right.storeCount - left.storeCount
      || right.relevance - left.relevance
      || Number(Boolean(right.signature)) - Number(Boolean(left.signature))
      || right.rows.length - left.rows.length
    ))[0]?.rows ?? [];
}

function selectStoreRows(
  rows: Record<string, unknown>[],
  comparableRows: Record<string, unknown>[],
  store: string,
): Record<string, unknown>[] {
  const storeRows = rows.filter(row => asString(row.store) === store);
  const comparableStoreRows = comparableRows.filter(row => asString(row.store) === store);
  // Prefer the presentation shared by the most stores so totals remain
  // comparable. If this store does not sell that exact format, keep its best
  // valid option instead of incorrectly declaring the whole product missing.
  return comparableStoreRows.length > 0 ? comparableStoreRows : storeRows;
}

export function buildSupermarketCandidate(
  row: Record<string, unknown>,
  requestedTerm: string,
  requestedQuantity: number,
  requestedUnit?: SupermarketMeasurementUnit,
) {
  const price = asNumber(row.price);
  const listPrice = asNumber(row.list_price);
  const productUrl = asString(row.product_url);
  const imageUrl = asString(row.image_url);
  const packUnits = Math.max(
    1,
    Math.round(asNumber(row.pack_units) || 1),
    inferredCountPackUnits(asString(row.name), requestedTerm),
  );
  const minimumPacks = Math.max(1, Math.round(asNumber(row.minimum_packs) || 1));
  const selection = calculateProductQuantity(
    asString(row.name),
    requestedQuantity,
    requestedUnit,
    packUnits,
    minimumPacks,
  );
  const store = asString(row.store);
  const matchRelevance = asNumber(row.match_relevance);

  return {
    id: asString(row.id),
    requestedTerm,
    name: asString(row.name),
    brand: asString(row.brand),
    quantity: selection.packs,
    requestedQuantity,
    requestedUnit,
    packUnits,
    suppliedQuantity: selection.suppliedQuantity,
    price,
    lineTotal: price * selection.packs,
    store,
    matchRelevance,
    channelType: asString(row.channel_type) || (WHOLESALE_STORES.has(store) ? 'wholesale' : 'retail'),
    originalPrice: listPrice > price ? listPrice : undefined,
    isOffer: listPrice > price,
    checked: false,
    productUrl: productUrl || undefined,
    imageUrl: imageUrl || undefined,
    fetchedAt: asString(row.last_seen_at),
  };
}

export function buildBasketComparison(
  terms: string[],
  rowsByTerm: Record<string, Record<string, unknown>[]>,
  requestedQuantities: Record<string, number> = {},
  requestedUnits: Record<string, SupermarketMeasurementUnit | undefined> = {},
) {
  const comparableByTerm = terms.map(term => {
    const requestedUnit = requestedUnits[term];
    const rows = (rowsByTerm[term] ?? []).filter(row => isProductSuitableForRequest(
      asString(row.name),
      term,
      requestedUnit,
    ));
    return {
      term,
      rows,
      comparableRows: requestedUnit ? rows : selectComparableRows(rows),
    };
  });

  const comparisons = SUPERMARKET_STORES.map(store => {
    const items = comparableByTerm.flatMap(({ term, rows, comparableRows }) => {
      const candidate = selectStoreRows(rows, comparableRows, store)
        .filter(row => isProductSuitableForRequest(
          asString(row.name),
          term,
          requestedUnits[term],
        ))
        .map(row => buildSupermarketCandidate(
          row,
          term,
          normalizeRequestedQuantity(requestedQuantities[term] || 1, requestedUnits[term]),
          requestedUnits[term],
        ))
        .sort((left, right) => (
          right.matchRelevance - left.matchRelevance
          || left.lineTotal - right.lineTotal
          || left.suppliedQuantity - right.suppliedQuantity
        ))[0];
      return candidate ? [candidate] : [];
    });
    const coveredTerms = new Set(items.map(item => item.requestedTerm));
    const missingTerms = terms.filter(term => !coveredTerms.has(term));

    return {
      store,
      channelType: WHOLESALE_STORES.has(store) ? 'wholesale' : 'retail',
      items,
      subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
      coveredCount: items.length,
      requestedCount: terms.length,
      coveragePercent: terms.length > 0 ? Math.round(items.length * 100 / terms.length) : 0,
      missingTerms,
      complete: missingTerms.length === 0 && terms.length > 0,
      fetchedAt: items.map(item => item.fetchedAt).filter(Boolean).sort().at(0),
    };
  }).filter(basket => basket.coveredCount > 0)
    .sort((left, right) => (
      Number(right.complete) - Number(left.complete)
      || right.coveredCount - left.coveredCount
      || left.subtotal - right.subtotal
    ));

  const recommended = comparisons.find(basket => basket.complete) ?? null;
  const purchasePlan = buildResilientPurchasePlan(terms, comparisons as SupermarketBasketCandidate[]);
  return {
    terms,
    recommended,
    bestAvailable: comparisons[0] ?? null,
    comparisons,
    purchasePlan,
  };
}
