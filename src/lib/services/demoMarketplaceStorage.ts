import { MarketplaceItem } from "@/lib/types";

const demoMarketplaceItemsStorageKey = "cc_demo_marketplace_items";
const demoMarketplaceStatusStorageKey = "cc_demo_marketplace_status_overrides";

type StatusOverrides = Record<string, MarketplaceItem["status"]>;

function readJson<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
        return JSON.parse(window.localStorage.getItem(key) || "") as T;
    } catch {
        return fallback;
    }
}

function writeJson<T>(key: string, value: T) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
}

export function getDemoPublishedMarketplaceItems() {
    return readJson<MarketplaceItem[]>(demoMarketplaceItemsStorageKey, []);
}

export function saveDemoPublishedMarketplaceItems(items: MarketplaceItem[]) {
    const published = items.filter(item => item.id.startsWith("demo-market-published-"));
    writeJson(demoMarketplaceItemsStorageKey, published.slice(0, 30));
}

export function prependDemoPublishedMarketplaceItem(item: MarketplaceItem) {
    saveDemoPublishedMarketplaceItems([item, ...getDemoPublishedMarketplaceItems()]);
}

export function getDemoMarketplaceStatusOverrides() {
    return readJson<StatusOverrides>(demoMarketplaceStatusStorageKey, {});
}

export function saveDemoMarketplaceStatusOverride(itemId: string, status: MarketplaceItem["status"]) {
    const overrides = getDemoMarketplaceStatusOverrides();
    overrides[itemId] = status;
    writeJson(demoMarketplaceStatusStorageKey, overrides);
}

export function removeDemoMarketplaceStatusOverride(itemId: string) {
    const overrides = getDemoMarketplaceStatusOverrides();
    delete overrides[itemId];
    writeJson(demoMarketplaceStatusStorageKey, overrides);
}

export function applyDemoMarketplaceStatusOverrides(items: MarketplaceItem[]) {
    const overrides = getDemoMarketplaceStatusOverrides();
    return items.map(item => overrides[item.id] ? { ...item, status: overrides[item.id] } : item);
}
