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
  const discoveredStores = [...new Set(items.flatMap(item => item.store ? [item.store] : []))];
  const selectedStore = preferredStores.find(store => discoveredStores.includes(store))
    ?? discoveredStores[0];
  const availableItems = items.filter(item => (
    item.available && item.store === selectedStore
  ));
  const unresolvedTerms = requestedTerms.filter(term => (
    !availableItems.some(item => item.requestedTerm === term)
  ));
  const baskets: SupermarketPurchasePlanBasket[] = selectedStore ? [{
    store: selectedStore,
    channelType: WHOLESALE_STORES.has(selectedStore) ? 'wholesale' : 'retail',
    subtotal: availableItems.reduce((sum, item) => sum + item.lineTotal, 0),
    items: availableItems,
  }] : [];
  const complete = unresolvedTerms.length === 0 && requestedTerms.length > 0;

  return {
    status: complete ? 'single_store' : 'needs_substitution',
    complete,
    total: baskets.reduce((sum, basket) => sum + basket.subtotal, 0),
    requestedCount: requestedTerms.length,
    resolvedCount: availableItems.length,
    storeCount: baskets.length,
    baskets,
    unresolvedTerms,
    substitutionTasks: unresolvedTerms.map(requestedTerm => ({
      requestedTerm,
      suggestedStore: selectedStore,
      searchUrl: selectedStore ? storeSearchUrl(selectedStore, requestedTerm) : undefined,
      reason: 'Buscar un equivalente de la misma categoría, formato y unidad en el supermercado elegido.',
    })),
  };
}
