export type GroupItemInput = { term: string; quantity: number };
export type GroupSettlementContribution = { userId: string; term: string; quantity: number };
export type GroupSettlementBasketItem = { requestedTerm: string; lineTotal: number };

function normalizeTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function parseGroupShoppingList(value: string): GroupItemInput[] {
  const consolidated = new Map<string, number>();
  for (const [index, rawEntry] of value.slice(0, 1_500).split(/[,;\n]+/).entries()) {
    let entry = rawEntry
      .trim()
      .replace(/^[-*•]\s*/, '')
      .replace(/^\d+[.)]\s+/, '');
    if (index === 0) {
      entry = entry
        .replace(/^(?:hola[,.!\s]*)/i, '')
        .replace(/^(?:necesito|quiero|deseo)\s+(?:comprar|agregar|añadir)?\s*:*/i, '')
        .replace(/^(?:comprar|agregar|añadir|lista(?:\s+de\s+compras)?)\s*:*/i, '')
        .trim();
    }
    if (/\d{4,}\s*$/.test(entry)) continue;
    if (!entry) continue;

    let quantity = 1;
    let rawTerm = entry;
    const leadingQuantity = entry.match(/^(\d{1,3})\s*(?:x|unidades?|uds?|u)?\s+(.+)$/i)
      || entry.match(/^(\d{1,3})\s*[xX]\s*(.+)$/);
    const trailingQuantity = entry.match(/^(.+?)\s+[xX]\s*(\d{1,3})(?:\s*(?:unidades?|uds?|u))?\s*$/i)
      || entry.match(/^(.+?)\s*\((\d{1,3})\)\s*$/)
      || entry.match(/^(.+?)\s+(\d{1,3})(?:\s*(?:unidades?|uds?|u))?\s*$/i);

    if (leadingQuantity) {
      quantity = Number(leadingQuantity[1]);
      rawTerm = leadingQuantity[2];
    } else if (trailingQuantity) {
      quantity = Number(trailingQuantity[2]);
      rawTerm = trailingQuantity[1];
    }

    const term = normalizeTerm(rawTerm);
    if (term.length < 2 || quantity < 1 || quantity > 500) continue;
    consolidated.set(term, Math.min(500, (consolidated.get(term) || 0) + quantity));
  }
  return [...consolidated.entries()]
    .slice(0, 30)
    .map(([term, quantity]) => ({ term, quantity }));
}

export function allocateGroupCosts(
  contributions: GroupSettlementContribution[],
  basketItems: GroupSettlementBasketItem[],
  fallbackUserId: string,
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const basketItem of basketItems) {
    const lineTotal = Math.max(0, Math.round(basketItem.lineTotal));
    if (lineTotal === 0) continue;
    const relevant = contributions.filter(item => (
      item.term === basketItem.requestedTerm && item.quantity > 0
    ));
    const requestedQuantity = relevant.reduce((sum, item) => sum + item.quantity, 0);
    if (requestedQuantity === 0) {
      totals[fallbackUserId] = (totals[fallbackUserId] || 0) + lineTotal;
      continue;
    }

    const shares = relevant.map(item => {
      const exact = lineTotal * item.quantity / requestedQuantity;
      return {
        userId: item.userId,
        amount: Math.floor(exact),
        fraction: exact - Math.floor(exact),
      };
    });
    let remainder = lineTotal - shares.reduce((sum, share) => sum + share.amount, 0);
    shares.sort((left, right) => right.fraction - left.fraction || left.userId.localeCompare(right.userId));
    for (let index = 0; remainder > 0; index += 1, remainder -= 1) {
      shares[index % shares.length].amount += 1;
    }
    for (const share of shares) {
      totals[share.userId] = (totals[share.userId] || 0) + share.amount;
    }
  }

  return totals;
}
