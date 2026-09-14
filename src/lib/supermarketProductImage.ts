import { SUPERMARKET_IMAGE_SOURCES } from '@/lib/supermarketImageSources';

const LIDER_TRANSFORM_SEARCH = /^\?source=url\[file:\/productos\/[A-Za-z0-9._-]+\](?:&scale=size\[180x180\])?&sink2?$/;

function matchesPathname(pathname: string, pattern: string): boolean {
  if (pattern.endsWith('/**')) {
    return pathname.startsWith(pattern.slice(0, -2));
  }

  const wildcard = pattern.indexOf('/*/');
  if (wildcard >= 0) {
    const prefix = pattern.slice(0, wildcard + 1);
    const suffix = pattern.slice(wildcard + 2);
    if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return false;
    const segment = pathname.slice(prefix.length, pathname.length - suffix.length);
    return segment.length > 0 && !segment.includes('/');
  }

  return pathname === pattern;
}

/**
 * Devuelve solo imagenes HTTPS de las rutas observadas en el catalogo.
 * `next/image` vuelve a validar los mismos patrones en `next.config.ts`.
 */
function allowedSupermarketImage(value?: string) {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.port
      || url.hash
    ) return null;

    const source = SUPERMARKET_IMAGE_SOURCES.find(source => (
      source.hostname === url.hostname.toLowerCase()
      && matchesPathname(url.pathname, source.pathname)
      && (source.optimize
        ? (!('search' in source) || source.search === url.search)
        : LIDER_TRANSFORM_SEARCH.test(url.search))
    ));
    if (!source) return null;
    if (!source.optimize && !url.search.includes('&scale=')) {
      url.search = url.search.replace(/&sink(2?)$/, '&scale=size[180x180]&sink$1');
    }
    return { source, url };
  } catch {
    return null;
  }
}

export function safeSupermarketProductImage(value?: string): string | null {
  return allowedSupermarketImage(value)?.url.href ?? null;
}

export function shouldOptimizeSupermarketProductImage(value: string): boolean {
  return allowedSupermarketImage(value)?.source.optimize === true;
}
