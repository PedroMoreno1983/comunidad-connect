export type GroupItemInput = { term: string; quantity: number };

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
  for (const rawEntry of value.slice(0, 1_500).split(/[,;\n]+/)) {
    const entry = rawEntry.trim();
    if (/\d{4,}\s*$/.test(entry)) continue;
    if (!entry) continue;
    const quantityMatch = entry.match(/(?:^|\s)(?:x\s*)?(\d{1,3})(?:\s*(?:unidades?|uds?|u))?\s*$/i);
    const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
    const rawTerm = quantityMatch ? entry.slice(0, quantityMatch.index).trim() : entry;
    const term = normalizeTerm(rawTerm.replace(/^\d{1,3}\s*[xX]\s*/, ''));
    if (term.length < 2 || quantity < 1 || quantity > 500) continue;
    consolidated.set(term, Math.min(500, (consolidated.get(term) || 0) + quantity));
  }
  return [...consolidated.entries()]
    .slice(0, 30)
    .map(([term, quantity]) => ({ term, quantity }));
}
