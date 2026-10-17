import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { normalizeGtin } from '@/lib/supermarketGtin';
import { significantWords } from '@/lib/supermarketText';

/**
 * "Mismo producto" por código de barras.
 *
 * El cruce entre cadenas era solo por nombre, y los nombres no calzan:
 * "Lasaña Carozzi 400 g" en Santa Isabel es "Lasaña Tradicional Caja 400 g
 * Carozzi" en Lider. Cuando un término pide un producto concreto (marca y
 * formato) y una tienda lo resuelve con un código GTIN, se busca ese MISMO
 * GTIN en las demás y se prefiere por sobre el match por nombre. Sin GTIN
 * (Jumbo y Tottus hasta que sus scrapers lo traigan) sigue el flujo actual.
 */

type Row = Record<string, unknown>;

const GTIN_ROW_LIMIT = 40;
const ID_CHUNK = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIZE_PATTERN = /\b\d+(?:[.,]\d+)?\s*(?:g|gr|grs|gramos?|kg|kilos?|ml|cc|l|lt|lts|litros?|un|unid|unidades?|u)\b/i;

function asRecord(value: unknown): Row | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
}

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(asRecord).filter((row): row is Row => row !== null) : [];
}

function relevance(row: Row): number {
  const value = Number(row.match_relevance);
  return Number.isFinite(value) ? value : -1;
}

/**
 * Un término "concreto" trae formato ("coca cola 3 l") o al menos tres
 * palabras con contenido ("lasaña tradicional carozzi"). "leche" o "coca cola"
 * a secas no: ahí se compara el más conveniente de cada tienda, no un SKU.
 */
export function isSpecificProductTerm(term: string): boolean {
  const words = significantWords(term);
  if (words.length === 0) return false;
  return (SIZE_PATTERN.test(term) && words.length >= 2) || words.length >= 3;
}

/** La marca de la fila (Coca-Cola, CocaCola, Colún) está escrita en el término. */
function brandNamedInTerm(brand: unknown, termWords: Set<string>): boolean {
  const words = significantWords(String(brand || ''));
  return words.length > 0 && words.every(word => termWords.has(word));
}

/**
 * GTIN ancla del término: el de la fila mejor puntuada de alguna tienda, solo
 * si la persona nombró su marca (si no, "leche entera 1 l" fijaría una marca
 * que no pidió). Entre varios, gana el que ya aparece en más tiendas y luego
 * el de mayor puntaje.
 */
export function pickAnchorGtin(rows: Row[], term: string): string | null {
  const termWords = new Set(significantWords(term));
  const bestByStore = new Map<string, number>();
  for (const row of rows) {
    const store = String(row.store || '');
    bestByStore.set(store, Math.max(bestByStore.get(store) ?? -1, relevance(row)));
  }
  const storesByGtin = new Map<string, Set<string>>();
  const topByGtin = new Map<string, number>();
  const brandedGtins = new Set<string>();
  for (const row of rows) {
    const gtin = normalizeGtin(row.gtin);
    if (!gtin) continue;
    const store = String(row.store || '');
    storesByGtin.set(gtin, (storesByGtin.get(gtin) ?? new Set()).add(store));
    if (brandNamedInTerm(row.brand, termWords)) brandedGtins.add(gtin);
    if (relevance(row) >= (bestByStore.get(store) ?? 0) && relevance(row) >= 0) {
      topByGtin.set(gtin, Math.max(topByGtin.get(gtin) ?? -1, relevance(row)));
    }
  }
  const ranked = [...topByGtin.entries()].filter(([gtin]) => brandedGtins.has(gtin)).sort((left, right) => (
    (storesByGtin.get(right[0])?.size ?? 0) - (storesByGtin.get(left[0])?.size ?? 0)
    || right[1] - left[1]
    || left[0].localeCompare(right[0])
  ));
  return ranked[0]?.[0] ?? null;
}

/**
 * Marca las filas del GTIN ancla como `same_product` y las sube por sobre el
 * match por nombre de su tienda. Las tiendas sin ese GTIN quedan intactas.
 */
export function mergeSameProductRows(rows: Row[], gtin: string, sameRows: Row[], term: string): Row[] {
  if (sameRows.length === 0) return rows;
  const top = Math.max(0, ...rows.map(relevance)) + 1;
  const marked: Row[] = sameRows.map(row => ({
    ...row,
    gtin,
    requested_term: term,
    same_product: true,
    match_relevance: Math.max(top, relevance(row)),
  }));
  const sameIds = new Set(marked.map(row => String(row.id)));
  return [...marked, ...rows.filter(row => !sameIds.has(String(row.id)))];
}

async function gtinById(ids: string[]): Promise<Map<string, string>> {
  const supabaseAdmin = getSupabaseAdmin();
  const result = new Map<string, string>();
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const { data, error } = await supabaseAdmin
      .from('supermarket_products')
      .select('id,gtin')
      .in('id', ids.slice(index, index + ID_CHUNK));
    if (error) throw error;
    for (const row of rowsOf(data)) {
      const gtin = normalizeGtin(row.gtin);
      if (gtin) result.set(String(row.id), gtin);
    }
  }
  return result;
}

export async function attachSameProductRows(
  rowsByTerm: Record<string, Row[]>,
  terms: string[],
  cutoff: string,
  columns: string,
): Promise<Record<string, Row[]>> {
  const specificTerms = terms.filter(term => isSpecificProductTerm(term) && (rowsByTerm[term] || []).length > 0);
  if (specificTerms.length === 0) return rowsByTerm;
  try {
    const ids = [...new Set(specificTerms.flatMap(term => (rowsByTerm[term] || [])
      .map(row => String(row.id || ''))
      .filter(id => UUID_PATTERN.test(id))))];
    if (ids.length === 0) return rowsByTerm;
    const gtins = await gtinById(ids);
    const supabaseAdmin = getSupabaseAdmin();
    const updated: Record<string, Row[]> = { ...rowsByTerm };
    await Promise.all(specificTerms.map(async term => {
      const rows = (rowsByTerm[term] || []).map(row => {
        const gtin = gtins.get(String(row.id || ''));
        return gtin ? { ...row, gtin } : row;
      });
      const anchor = pickAnchorGtin(rows, term);
      if (!anchor) return;
      const { data, error } = await supabaseAdmin
        .from('supermarket_products')
        .select(`${columns},gtin`)
        .eq('gtin', anchor)
        .eq('in_stock', true)
        .gte('last_seen_at', cutoff)
        .order('price', { ascending: true })
        .limit(GTIN_ROW_LIMIT);
      if (error) throw error;
      updated[term] = mergeSameProductRows(rows, anchor, rowsOf(data), term);
    }));
    return updated;
  } catch {
    // Sin la columna gtin (migración 20261017120000) se sigue solo por nombre.
    return rowsByTerm;
  }
}
