import type { SupermarketShoppingItem } from '@/lib/types';

/** Tie enrichment responses to the exact basket, including missing items. */
export function supermarketBasketIdentity(store: string | undefined, items: SupermarketShoppingItem[]): string {
  return JSON.stringify([store, items.map(item => [
    item.requestedTerm, item.sku, item.quantity, item.available,
  ])]);
}
