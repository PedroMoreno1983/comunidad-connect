import { buildResilientPurchasePlan } from '@/lib/supermarketPurchasePlan';
import { foldAccents, matchAnchor, productIntent, productMatchScore, significantWords } from '@/lib/supermarketText';
import type {
  SupermarketBasketCandidate,
  SupermarketMeasurementUnit,
  SupermarketPricingBasis,
  SupermarketStorePolicy,
  SupermarketVolumePromo,
} from '@/lib/types';


/**
 * Cadenas que se comparan y se muestran al vecino. Reducirla oculta una cadena
 * de toda la pantalla: comparacion, tarjetas y carga de carro.
 */
export const SUPERMARKET_STORES = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'aCuenta'] as const;

/**
 * Cadenas que el scraper nocturno sigue recorriendo y guardando, pero que hoy
 * no se muestran. El pipeline de ingesta es Python y no lee esta constante, asi
 * que sus precios siguen al dia y volver a mostrarlas es moverlas de lista.
 *
 * Tottus: Cloudflare interpone un desafio humano alrededor del segundo producto
 * al cargar el carro desde el VPS, reproducible tres de tres veces. Pausar la
 * navegacion no lo evito. El carro directo tampoco esta soportado.
 *
 * Irurzun queda fuera del flujo de compra por decision de producto.
 */
export const HIDDEN_SUPERMARKET_STORES = ['Tottus', 'Irurzun'] as const;

/**
 * aCuenta se ofrece como mayorista. Irurzun sigue clasificada igual en filas
 * que el scraper guarda, pero no entra a la compra ni a la comparación.
 */
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
  if (!/\b(?:huevos?|marraquetas?)\b/.test(normalizedTerm)) return 1;
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
  const unit = value.toLowerCase();
  if (unit === 'kg' || unit.startsWith('kilo')) return 'kg';
  if (unit === 'g' || unit === 'gr' || unit.startsWith('gram')) return 'g';
  if (unit === 'l' || unit === 'lt' || unit.startsWith('litr')) return 'l';
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
  const match = normalizedName.match(/\b(\d+(?:[.,]\d+)?)\s*(kilogramos?|kilos?|kg|gramos?|gr|g|litros?|lt|l|ml|cc)\b/);
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
    amount: Math.round(measurement.amount * unitBaseFactor(measurement.unit)),
  };
}

export function matchesRequestedPackageSize(name: string, requestedTerm: string): boolean {
  const count = (value: string) => foldAccents(value).match(/\b(\d+)\s*(?:un(?:idades?)?|uds?|rollos?)\b/);
  const requestedCount = count(requestedTerm);
  if (requestedCount) {
    const actualCount = count(name);
    if (!actualCount || Number(actualCount[1]) !== Number(requestedCount[1])) return false;
  }
  const requested = productMeasurementInBaseUnits(requestedTerm);
  if (!requested) return true;
  const actual = productMeasurementInBaseUnits(name);
  return actual !== null && actual.dimension === requested.dimension && actual.amount === requested.amount;
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

  // Database search can return every word separately, including a different
  // food that merely mentions the requested ingredient in its description.
  if (productMatchScore(requestedTerm, name) < 0) return false;

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

  // "Carne molida" en Chile es vacuno. Sin esta guarda, "Carne Molida Pollo"
  // ganaba por precio aunque el pedido no mencionara pollo (lista de Pedro).
  if (
    /\bcarne\b/.test(normalizedTerm)
    && /\bmolid[oa]s?\b/.test(normalizedTerm)
    && !/\b(?:pollo|pavo|cerdo)\b/.test(normalizedTerm)
    && /\b(?:pollo|pavo|cerdo)\b/.test(normalizedName)
    && !/\b(?:vacuno|res|vacuna)\b/.test(normalizedName)
  ) {
    return false;
  }

  // "Mantequilla" en la lista es lácteo. Al mismo gramaje, la de maní ganaba por precio.
  if (
    /\bmantequilla\b/.test(normalizedTerm)
    && !/\bmani\b/.test(normalizedTerm)
    && /\bmani\b/.test(normalizedName)
  ) {
    return false;
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

/** A count of fresh produce cannot safely be converted into kilos of a bag. */
export function needsProduceQuantityReview(
  name: string,
  requestedTerm: string,
  requestedQuantity: number,
  requestedUnit: SupermarketMeasurementUnit | undefined,
): boolean {
  if (requestedQuantity <= 1 || requestedUnit || productIntent(requestedTerm) !== 'fresh_produce') return false;
  if (/\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|un|unidad|unidades)\b/.test(foldAccents(requestedTerm))) return false;
  return productMeasurementInBaseUnits(name)?.dimension === 'mass'
    && !/\b\d+\s*(?:un|unidad|unidades)\b/.test(foldAccents(name));
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
/**
 * Formato declarado en el nombre ("1l", "200g", "6un"). Vacio cuando el nombre
 * no lo dice, que es distinto de tenerlo en cero.
 */
export function formatSignature(name: string): string {
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

/**
 * Una promoción revisada hace más de esto respecto del último precio visto se
 * considera desconocida: la fila la refrescó un scraper que no mira badges.
 */
const PROMO_CHECK_MAX_LAG_MS = 36 * 60 * 60 * 1000;

function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/**
 * Lee la promoción por volumen guardada en la fila (issue #96).
 * `checked` es falso cuando el scraper nunca revisó el badge o lo revisó en una
 * pasada anterior al precio vigente; en ese caso el total queda "estimado".
 */
export function readVolumePromo(
  row: Record<string, unknown>,
  unitPrice: number,
): { promo?: SupermarketVolumePromo; checked: boolean } {
  const checkedAt = parseTime(row.promo_checked_at);
  const seenAt = parseTime(row.last_seen_at);
  const checked = checkedAt !== null && (seenAt === null || seenAt - checkedAt <= PROMO_CHECK_MAX_LAG_MS);
  if (!checked) return { checked: false };
  const minQuantity = Math.round(asNumber(row.promo_min_qty));
  const totalPrice = Math.round(asNumber(row.promo_total_price));
  if (minQuantity < 2 || totalPrice <= 0 || unitPrice <= 0 || totalPrice >= minQuantity * unitPrice) {
    return { checked: true };
  }
  const label = asString(row.promo_label).trim();
  const group = asString(row.promo_group).trim();
  return {
    checked: true,
    promo: {
      minQuantity,
      totalPrice,
      label: label || undefined,
      group: group || undefined,
    },
  };
}

/**
 * Total de una línea con promoción por volumen: bloques completos a precio de
 * promoción y el resto a precio normal. Nunca devuelve más que precio × cantidad.
 */
export function volumePromoLineTotal(
  unitPrice: number,
  quantity: number,
  promo?: SupermarketVolumePromo,
): number {
  const regular = unitPrice * quantity;
  if (!promo || promo.minQuantity < 2 || quantity < promo.minQuantity) return regular;
  const blocks = Math.floor(quantity / promo.minQuantity);
  const rest = quantity - blocks * promo.minQuantity;
  return Math.min(regular, blocks * promo.totalPrice + rest * unitPrice);
}

type PromoLine = {
  price: number;
  quantity: number;
  lineTotal: number;
  volumePromo?: SupermarketVolumePromo;
  promoSavings?: number;
};

/**
 * "Combina N x $P": productos distintos con la misma clave de promoción suman
 * unidades para completar bloques. Las unidades que sobran se cobran a precio
 * normal empezando por las más caras, para no prometer más ahorro del real.
 * Solo reemplaza los totales de línea si el grupo sale más barato que por
 * separado.
 */
export function applyCombinedVolumePromos<T extends PromoLine>(items: T[]): T[] {
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const promo = item.volumePromo;
    if (!promo?.group) return;
    const key = `${promo.group}|${promo.minQuantity}|${promo.totalPrice}`;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });

  const result = [...items];
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    const promo = items[indexes[0]].volumePromo as SupermarketVolumePromo;
    const units = indexes.reduce((sum, index) => sum + items[index].quantity, 0);
    const blocks = Math.floor(units / promo.minQuantity);
    if (blocks === 0) continue;
    let restUnits = units - blocks * promo.minQuantity;
    const byPriceDesc = [...indexes].sort((left, right) => items[right].price - items[left].price);
    const restByIndex = new Map<number, number>();
    for (const index of byPriceDesc) {
      const take = Math.min(restUnits, items[index].quantity);
      restByIndex.set(index, take);
      restUnits -= take;
    }
    const promoUnitPrice = promo.totalPrice / promo.minQuantity;
    const raw = indexes.map(index => {
      const rest = restByIndex.get(index) ?? 0;
      return (items[index].quantity - rest) * promoUnitPrice + rest * items[index].price;
    });
    const groupTotal = blocks * promo.totalPrice
      + indexes.reduce((sum, index) => sum + (restByIndex.get(index) ?? 0) * items[index].price, 0);
    const separateTotal = indexes.reduce((sum, index) => sum + items[index].lineTotal, 0);
    if (groupTotal >= separateTotal) continue;

    // Redondeo a pesos sin perder ni ganar un peso en el total del grupo.
    const rounded = raw.map(value => Math.round(value));
    const drift = groupTotal - rounded.reduce((sum, value) => sum + value, 0);
    rounded[rounded.length - 1] += drift;
    indexes.forEach((index, position) => {
      const item = items[index];
      const lineTotal = rounded[position];
      result[index] = {
        ...item,
        lineTotal,
        promoSavings: Math.max(0, item.price * item.quantity - lineTotal),
      };
    });
  }
  return result;
}

function selectComparableRows(rows: Record<string, unknown>[]) {
  const formatRows = selectFormatRows(rows);
  // Mismo GTIN en 2+ tiendas: es el mismo producto y gana al formato por
  // nombre. Las tiendas sin ese GTIN (Jumbo hoy) conservan su formato común.
  const sameProductRows = rows.filter(row => row.same_product === true);
  const sameStores = new Set(sameProductRows.map(row => asString(row.store)));
  if (sameStores.size < 2) return formatRows;
  return [
    ...sameProductRows,
    ...formatRows.filter(row => row.same_product !== true && !sameStores.has(asString(row.store))),
  ];
}

function selectFormatRows(rows: Record<string, unknown>[]) {
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
  const cartReadyRows = store === 'Lider'
    ? storeRows.filter(row => asString(row.sku) && asString(row.offer_id))
    : storeRows;
  const comparableStoreRows = comparableRows.filter(row => (
    asString(row.store) === store
    && (store !== 'Lider' || (asString(row.sku) && asString(row.offer_id)))
  ));
  // Prefer the presentation shared by the most stores so totals remain
  // comparable. If this store does not sell that exact format, keep its best
  // valid option instead of incorrectly declaring the whole product missing.
  return comparableStoreRows.length > 0 ? comparableStoreRows : cartReadyRows;
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
  const { promo: volumePromo, checked: promoChecked } = readVolumePromo(row, price);
  const lineTotal = volumePromoLineTotal(price, selection.packs, volumePromo);

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
    lineTotal,
    volumePromo,
    promoChecked,
    promoSavings: price * selection.packs - lineTotal,
    store,
    sku: asString(row.sku) || undefined,
    offerId: asString(row.offer_id) || undefined,
    salesUnit: asString(row.sales_unit) || undefined,
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
  storePolicies: SupermarketStorePolicy[] = [],
) {
  const minimumByStore = new Map(storePolicies.flatMap(policy => (
    typeof policy.minimumOrder === 'number' && Number.isFinite(policy.minimumOrder) && policy.minimumOrder > 0
      ? [[policy.store, policy.minimumOrder] as const]
      : []
  )));
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
        ) && !needsProduceQuantityReview(
          asString(row.name), term, requestedQuantities[term] || 1, requestedUnits[term],
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
    const pricedItems = applyCombinedVolumePromos(items);
    const coveredTerms = new Set(pricedItems.map(item => item.requestedTerm));
    const missingTerms = terms.filter(term => !coveredTerms.has(term));
    const subtotal = pricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const pricingBasis: SupermarketPricingBasis = pricedItems.length > 0 && pricedItems.every(item => item.promoChecked)
      ? 'promo_aware'
      : 'unit_price';
    const minimumOrder = minimumByStore.get(store);
    const belowMinimum = pricedItems.length > 0 && minimumOrder !== undefined && subtotal + 0.5 < minimumOrder;

    return {
      store,
      channelType: WHOLESALE_STORES.has(store) ? 'wholesale' : 'retail',
      items: pricedItems,
      subtotal,
      coveredCount: pricedItems.length,
      requestedCount: terms.length,
      coveragePercent: terms.length > 0 ? Math.round(pricedItems.length * 100 / terms.length) : 0,
      missingTerms,
      complete: missingTerms.length === 0 && terms.length > 0,
      fetchedAt: pricedItems.map(item => item.fetchedAt).filter(Boolean).sort().at(0),
      pricingBasis,
      promoSavings: pricedItems.reduce((sum, item) => sum + (item.promoSavings ?? 0), 0),
      minimumOrder,
      belowMinimum,
      shortfall: belowMinimum && minimumOrder !== undefined ? minimumOrder - subtotal : undefined,
    };
  }).sort((left, right) => (
      Number(right.complete) - Number(left.complete)
      || right.coveredCount - left.coveredCount
      // Una canasta que la tienda no deja cursar no se recomienda por sobre
      // una que sí, aunque sea más barata (issue #96, causa 2).
      || Number(left.belowMinimum) - Number(right.belowMinimum)
      || left.subtotal - right.subtotal
    ));

  // La comparacion es un producto de las cadenas activas, no una lista de resultados
  // positivos. Conservamos tambien las tiendas sin coincidencias para que la UI
  // pueda distinguir "sin datos vigentes" de "no fue comparada". Solo las
  // canastas con productos participan de la recomendacion y del plan.
  const availableComparisons = comparisons.filter(basket => basket.coveredCount > 0);
  const recommended = availableComparisons.find(basket => basket.complete) ?? null;
  const purchasePlan = buildResilientPurchasePlan(
    terms,
    availableComparisons as SupermarketBasketCandidate[],
  );
  return {
    terms,
    recommended,
    bestAvailable: availableComparisons[0] ?? null,
    comparisons,
    purchasePlan,
  };
}
