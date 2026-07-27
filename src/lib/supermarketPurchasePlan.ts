import type {
  SupermarketBasketCandidate,
  SupermarketPurchasePlan,
  SupermarketSearchCandidate,
} from '@/lib/types';

export function buildResilientPurchasePlan(
  terms: string[],
  comparisons: SupermarketBasketCandidate[],
): SupermarketPurchasePlan {
  const selected = comparisons[0];
  if (!selected) {
    return {
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

  return {
    status: selected.complete ? 'single_store' : 'needs_substitution',
    complete: selected.complete,
    total: selected.subtotal,
    requestedCount: terms.length,
    resolvedCount: selected.coveredCount,
    storeCount: 1,
    baskets: [{
      store: selected.store,
      channelType: selected.channelType,
      subtotal: selected.subtotal,
      items: selected.items,
    }],
    unresolvedTerms: selected.missingTerms,
    substitutionTasks: [],
  };
}

export function flattenPurchasePlanItems(
  plan: SupermarketPurchasePlan,
): SupermarketSearchCandidate[] {
  return plan.baskets.flatMap(basket => basket.items);
}
