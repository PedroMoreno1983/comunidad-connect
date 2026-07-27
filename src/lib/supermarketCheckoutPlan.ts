import { WHOLESALE_STORES } from '@/lib/supermarketBasket';
import { storeSearchUrl } from '@/lib/supermarketText';
import type {
  SupermarketPurchasePlan,
  SupermarketPurchasePlanBasket,
  SupermarketShoppingItem,
} from '@/lib/types';

export function buildCheckoutPlan(
  items: SupermarketShoppingItem[],
  requestedTerms: string[],
  preferredStores: string[],
): SupermarketPurchasePlan {
  const availableItems = items.filter(item => item.available && item.store);
  const unresolvedTerms = requestedTerms.filter(term => (
    !availableItems.some(item => item.requestedTerm === term)
  ));
  const discoveredStores = [...new Set(availableItems.flatMap(item => item.store ? [item.store] : []))];
  const orderedStores = [
    ...preferredStores.filter(store => discoveredStores.includes(store)),
    ...discoveredStores.filter(store => !preferredStores.includes(store)),
  ];
  const baskets: SupermarketPurchasePlanBasket[] = orderedStores.flatMap(store => {
    const basketItems = availableItems.filter(item => item.store === store);
    if (basketItems.length === 0) return [];
    return [{
      store,
      channelType: WHOLESALE_STORES.has(store) ? 'wholesale' : 'retail',
      subtotal: basketItems.reduce((sum, item) => sum + item.lineTotal, 0),
      items: basketItems,
    }];
  });
  const complete = unresolvedTerms.length === 0 && requestedTerms.length > 0;
  const suggestedStore = baskets[0]?.store;

  return {
    status: complete
      ? (baskets.length === 1 ? 'single_store' : 'split_store')
      : 'needs_substitution',
    complete,
    total: baskets.reduce((sum, basket) => sum + basket.subtotal, 0),
    requestedCount: requestedTerms.length,
    resolvedCount: availableItems.length,
    storeCount: baskets.length,
    baskets,
    unresolvedTerms,
    substitutionTasks: unresolvedTerms.map(requestedTerm => ({
      requestedTerm,
      suggestedStore,
      searchUrl: suggestedStore ? storeSearchUrl(suggestedStore, requestedTerm) : undefined,
      reason: 'Buscar un equivalente de la misma categoría, formato y unidad antes de cerrar el carro.',
    })),
  };
}
