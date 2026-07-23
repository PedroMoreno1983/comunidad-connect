const STORES = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc'] as const;

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

function mapProduct(row: Record<string, unknown>, requestedTerm: string) {
  const price = asNumber(row.price);
  const listPrice = asNumber(row.list_price);
  const productUrl = asString(row.product_url);
  const imageUrl = asString(row.image_url);

  return {
    id: asString(row.id),
    requestedTerm,
    name: asString(row.name),
    brand: asString(row.brand),
    quantity: 1,
    price,
    store: asString(row.store),
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
) {
  const comparableByTerm = terms.map(term => ({
    term,
    rows: selectComparableRows(rowsByTerm[term] ?? []),
  }));

  const comparisons = STORES.map(store => {
    const items = comparableByTerm.flatMap(({ term, rows }) => {
      const candidate = rows
        .filter(row => asString(row.store) === store)
        .sort((left, right) => asNumber(left.price) - asNumber(right.price))[0];
      return candidate ? [mapProduct(candidate, term)] : [];
    });
    const coveredTerms = new Set(items.map(item => item.requestedTerm));
    const missingTerms = terms.filter(term => !coveredTerms.has(term));

    return {
      store,
      items,
      subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
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
