/**
 * Stock and placeholder portrait hosts. A URL on one of these hosts is not
 * a photo the provider uploaded, so the profile treats it as "no photo".
 */
const STOCK_PHOTO_HOSTS = [
    "images.unsplash.com",
    "source.unsplash.com",
    "unsplash.com",
    "ui-avatars.com",
    "randomuser.me",
    "i.pravatar.cc",
    "pravatar.cc",
    "picsum.photos",
    "api.dicebear.com",
    "dicebear.com",
    "generated.photos",
    "placehold.co",
    "via.placeholder.com",
    "placeholder.com",
    "placekitten.com",
    "loremflickr.com",
    "robohash.org",
] as const;

function hostnameOf(value: string): string | null {
    try {
        return new URL(value).hostname.toLowerCase();
    } catch {
        return null;
    }
}

function hostIsStock(hostname: string): boolean {
    return STOCK_PHOTO_HOSTS.some(stock => hostname === stock || hostname.endsWith(`.${stock}`));
}

/** True when the string points at a known stock, avatar-generator, or placeholder host. */
export function isStockPhotoUrl(value: string | null | undefined): boolean {
    const trimmed = value?.trim();
    if (!trimmed) return false;

    const hostname = hostnameOf(trimmed);
    if (hostname) return hostIsStock(hostname);

    const lower = trimmed.toLowerCase();
    return STOCK_PHOTO_HOSTS.some(stock => lower.includes(stock));
}

/** The URL when it is a real upload. Stock hosts and empty values become undefined. */
export function realPhotoUrl(value: string | null | undefined): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed || isStockPhotoUrl(trimmed)) return undefined;
    return trimmed;
}
