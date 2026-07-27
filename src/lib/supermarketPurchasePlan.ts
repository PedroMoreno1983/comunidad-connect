import type {
  SupermarketBasketCandidate,
  SupermarketPurchasePlan,
  SupermarketSearchCandidate,
} from '@/lib/types';

const DEFAULT_MAX_STORES = 3;

function combinations<T>(values: T[], maximumSize: number): T[][] {
  const result: T[][] = [];
  const total = 1 << values.length;
  for (let mask = 1; mask < total; mask += 1) {
    const selected = values.filter((_, index) => (mask & (1 << index)) !== 0);
    if (selected.length <= maximumSize) result.push(selected);
  }
  return result;
}

function planForStores(
  terms: string[],
  comparisons: SupermarketBasketCandidate[],
): SupermarketPurchasePlan {
  const selectedItems = terms.flatMap(term => {
    const candidates = comparisons
      .flatMap(basket => basket.items)
      .filter(item => item.requestedTerm === term)
      .sort((left, right) => left.lineTotal - right.lineTotal);
    return candidates[0] ? [candidates[0]] : [];
  });
  const unresolvedTerms = terms.filter(term => (
    !selectedItems.some(item => item.requestedTerm === term)
  ));
  const baskets = comparisons.flatMap(comparison => {
    const items = selectedItems.filter(item => item.store === comparison.store);
    if (items.length === 0) return [];
    return [{
      store: comparison.store,
      channelType: comparison.channelType,
      subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
      items,
    }];
  });
  const complete = unresolvedTerms.length === 0 && terms.length > 0;
  return {
    status: complete
      ? (baskets.length === 1 ? 'single_store' : 'split_store')
      : 'needs_substitution',
    complete,
    total: baskets.reduce((sum, basket) => sum + basket.subtotal, 0),
    requestedCount: terms.length,
    resolvedCount: selectedItems.length,
    storeCount: baskets.length,
    baskets,
    unresolvedTerms,
    substitutionTasks: [],
  };
}

function isBetterPlan(
  candidate: SupermarketPurchasePlan,
  current: SupermarketPurchasePlan | null,
): boolean {
  if (!current) return true;
  if (candidate.resolvedCount !== current.resolvedCount) {
    return candidate.resolvedCount > current.resolvedCount;
  }
  if (candidate.storeCount !== current.storeCount) {
    return candidate.storeCount < current.storeCount;
  }
  return candidate.total < current.total;
}

export function buildResilientPurchasePlan(
  terms: string[],
  comparisons: SupermarketBasketCandidate[],
  maximumStores = DEFAULT_MAX_STORES,
): SupermarketPurchasePlan {
  let best: SupermarketPurchasePlan | null = null;
  for (const selected of combinations(comparisons, maximumStores)) {
    const candidate = planForStores(terms, selected);
    if (isBetterPlan(candidate, best)) best = candidate;
  }
  return best ?? {
    status: 'needs_substitution',
    complete: false,
    total: 0,
    requestedCount: terms.length,
    resolvedCount: 0,
    storeCount: 0,
    baskets: [],
    unresolvedTerms: [...terms],
    substitutionTasks: [],
  };
}

export function flattenPurchasePlanItems(
  plan: SupermarketPurchasePlan,
): SupermarketSearchCandidate[] {
  return plan.baskets.flatMap(basket => basket.items);
}
