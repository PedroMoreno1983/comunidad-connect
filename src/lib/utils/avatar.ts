import { realPhotoUrl } from "@/lib/utils/stockPhoto";

/**
 * Real uploaded portrait only.
 * Stock hosts (ui-avatars, Unsplash, pravatar, randomuser, and similar)
 * are ignored so the UI can draw a data glyph instead of a fake photo.
 */
export function getProviderAvatar(_name: string, photo?: string | null): string | null {
    return realPhotoUrl(photo) ?? null;
}

/**
 * Get initials from a name
 */
export function getInitials(name: string): string {
    return name
        .split(" ")
        .map(word => word[0])
        .filter(Boolean)
        .join("")
        .toUpperCase()
        .substring(0, 2);
}
