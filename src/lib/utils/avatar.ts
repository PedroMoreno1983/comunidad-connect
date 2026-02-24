/**
 * Generate avatar URL for a provider
 * Uses ui-avatars.com service to generate avatars based on name initials
 */
export function getProviderAvatar(name: string, photo?: string | null): string {
    // If provider has a photo, use it
    if (photo) {
        return photo;
    }

    // Otherwise, generate an avatar from initials
    const encodedName = encodeURIComponent(name);

    // Color palette based on name hash for consistency
    const colors = [
        { bg: '3b82f6', color: 'ffffff' }, // Blue
        { bg: '8b5cf6', color: 'ffffff' }, // Purple
        { bg: '06b6d4', color: 'ffffff' }, // Cyan
        { bg: 'f59e0b', color: 'ffffff' }, // Amber
        { bg: 'ec4899', color: 'ffffff' }, // Pink
        { bg: '10b981', color: 'ffffff' }, // Emerald
    ];

    // Simple hash function to pick consistent color for same name
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colorIndex = hash % colors.length;
    const { bg, color } = colors[colorIndex];

    return `https://ui-avatars.com/api/?name=${encodedName}&background=${bg}&color=${color}&size=200&bold=true&format=png`;
}

/**
 * Get initials from a name
 */
export function getInitials(name: string): string {
    return name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
}
