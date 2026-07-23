export const SUPERMARKET_STORES = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'aCuenta', 'Irurzun'] as const;

export const WHOLESALE_STORES = new Set<string>(['aCuenta', 'Irurzun']);

const MAX_REQUESTED_QUANTITY = 500;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatSignature(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const match = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|lt|ml|cc|un|unidad|unidades)\b/);
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
    }))
    .sort((left, right) => (
      right.storeCount - left.storeCount
      || Number(Boolean(right.signature)) - Number(Boolean(left.signature))
      || right.rows.length - left.rows.length
    ))[0]?.rows ?? [];
}

export function buildSupermarketCandidate(row: Record<string, unknown>, requestedTerm: string, requestedQuantity: number) {
  const price = asNumber(row.price);
  const listPrice = asNumber(row.list_price);
  const productUrl = asString(row.product_url);
  const imageUrl = asString(row.image_url);
  const packUnits = Math.max(1, Math.round(asNumber(row.pack_units) || 1));
  const minimumPacks = Math.max(1, Math.round(asNumber(row.minimum_packs) || 1));
  const packs = Math.max(minimumPacks, Math.ceil(requestedQuantity / packUnits));
  const store = asString(row.store);

  return {
    id: asString(row.id),
    requestedTerm,
    name: asString(row.name),
    brand: asString(row.brand),
    quantity: packs,
    requestedQuantity,
    packUnits,
    suppliedQuantity: packs * packUnits,
    price,
    lineTotal: price * packs,
    store,
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
) {
  const comparableByTerm = terms.map(term => ({
    term,
    rows: selectComparableRows(rowsByTerm[term] ?? []),
  }));

  const comparisons = SUPERMARKET_STORES.map(store => {
    const items = comparableByTerm.flatMap(({ term, rows }) => {
      const candidate = rows
        .filter(row => asString(row.store) === store)
        .map(row => buildSupermarketCandidate(
          row,
          term,
          Math.min(MAX_REQUESTED_QUANTITY, Math.max(1, Math.round(requestedQuantities[term] || 1))),
        ))
        .sort((left, right) => left.lineTotal - right.lineTotal || left.suppliedQuantity - right.suppliedQuantity)[0];
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
  return {
    terms,
    recommended,
    bestAvailable: comparisons[0] ?? null,
    comparisons,
  };
}
