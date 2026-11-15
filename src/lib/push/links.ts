/** Solo rutas internas: un aviso no puede mandar la app a otro sitio. */
export function pushLinkFor(link: unknown): string | null {
    if (typeof link !== 'string') return null;
    const value = link.trim();
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
    return value;
}
