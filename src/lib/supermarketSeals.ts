import 'server-only';

import type { SupermarketStore } from '@/lib/types';

/**
 * Los sellos de la ley de etiquetado viven en las especificaciones del catalogo
 * VTEX, no en las APIs de storefront que recorre el scraper nocturno. Por eso se
 * piden aca y no en `full_catalog.py`: una peticion por tienda y canasta, con
 * los pocos SKU que la persona realmente eligio, en vez de enriquecer 60k filas
 * cada noche.
 *
 * Cada cadena bautizo la misma especificacion a su manera; medido el 2026-09-04.
 */
const SEAL_SOURCES: Partial<Record<SupermarketStore, { base: string; field: string }>> = {
  Jumbo: { base: 'https://jumbo.vtexcommercestable.com.br', field: 'Flag Nutricional' },
  'Santa Isabel': { base: 'https://santaisabel.vtexcommercestable.com.br', field: 'Flag Nutricional' },
  Unimarc: { base: 'https://unimarc.vtexcommercestable.com.br', field: 'Sellos' },
};

const FETCH_TIMEOUT_MS = 8_000;
const MAX_SKUS = 60;

export function supportsSeals(store: string): boolean {
  return Object.prototype.hasOwnProperty.call(SEAL_SOURCES, store);
}

/**
 * Unimarc antepone el conteo ("Tres sellos") a la lista. Solo interesan las
 * advertencias en si, que son las que la ley obliga a mostrar en el envase.
 */
export function cleanSeals(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map(entry => entry.trim())
    .filter(entry => /^alto en /i.test(entry))
    .filter((entry, index, all) => all.indexOf(entry) === index);
}

function skuOf(product: Record<string, unknown>): string[] {
  const items = Array.isArray(product.items) ? product.items : [];
  return items
    .map(item => (item && typeof item === 'object' ? String((item as Record<string, unknown>).itemId ?? '') : ''))
    .filter(Boolean);
}

/**
 * Devuelve los sellos por SKU. Nunca lanza: si la tienda no responde, la
 * comparacion sigue sin esta informacion en vez de caerse por un dato accesorio.
 */
export async function fetchSealsBySku(
  store: string,
  skus: string[],
): Promise<Record<string, string[]>> {
  const source = SEAL_SOURCES[store as SupermarketStore];
  const wanted = [...new Set(skus.map(sku => sku.trim()).filter(Boolean))].slice(0, MAX_SKUS);
  if (!source || wanted.length === 0) return {};

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const query = wanted.map(sku => `fq=skuId:${encodeURIComponent(sku)}`).join('&');
    const response = await fetch(
      `${source.base}/api/catalog_system/pub/products/search?${query}&_from=0&_to=${wanted.length - 1}`,
      {
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json', 'Accept-Language': 'es-CL,es;q=0.9' },
      },
    );
    if (!response.ok) return {};
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) return {};

    const bySku: Record<string, string[]> = {};
    for (const entry of payload) {
      if (entry === null || typeof entry !== 'object') continue;
      const product = entry as Record<string, unknown>;
      const seals = cleanSeals(product[source.field]);
      for (const sku of skuOf(product)) {
        if (wanted.includes(sku)) bySku[sku] = seals;
      }
    }
    return bySku;
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}
