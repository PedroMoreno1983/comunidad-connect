/**
 * Policy for retailer cart handoff.
 *
 * Retailer `/checkout/cart/add` URLs are not a stable public API. Jumbo now
 * returns a missing-page response for the previously used endpoint, while the
 * VTEX account hosts used by other chains do not share the shopper session on
 * the branded site. Convive therefore loads carts only through the browser
 * loader, where each addition and the final cart can be observed and verified.
 */

export interface CartUrlItem {
  sku: string;
  quantity: number;
}

export type DirectCartConfidence = 'verified' | 'offsite';
export type StoreLoadability = 'direct' | 'offsite' | 'manual';

/** Retained for payload-size accounting in the legacy API response. */
export const MAX_ITEMS_PER_URL = 50;

export function directCartConfidence(store: string): DirectCartConfidence | null {
  void store;
  return null;
}

export function storeSupportsDirectCart(store: string): boolean {
  void store;
  return false;
}

export function storeLoadability(store: string): StoreLoadability {
  void store;
  return 'manual';
}

export function loadabilityRank(store: string): number {
  void store;
  return 2;
}

export function supportedDirectCartStores(): string[] {
  return [];
}

export function buildDirectCartUrl(store: string, items: CartUrlItem[]): string | null {
  void store;
  void items;
  return null;
}

/** Number of items that a legacy direct link would have omitted. */
export function countUnsupportedItems(items: CartUrlItem[]): number {
  const withSku = items.filter(item => item.sku && item.sku.trim()).length;
  const missingSku = items.length - withSku;
  const overflow = Math.max(0, withSku - MAX_ITEMS_PER_URL);
  return missingSku + overflow;
}
