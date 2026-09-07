import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { formatSignature, isProductSuitableForRequest } from '@/lib/supermarketBasket';
import { FRESH_PRICE_AGE_MS } from '@/lib/supermarketCatalogGaps';
import { fetchSealsBySku, supportsSeals } from '@/lib/supermarketSeals';
import { matchAnchor, termMatchesProductName } from '@/lib/supermarketText';
import type {
  SupermarketMeasurementUnit,
  SupermarketSealAlternative,
  SupermarketSealAlternativeOption,
} from '@/lib/types';

/**
 * Alternativas de la misma canasta con menos sellos informados.
 *
 * Es una consulta voluntaria y no cambia la comparacion: el orden de las
 * cadenas se sigue calculando por precio. Aca solo se muestra que existe otro
 * producto equivalente con menos advertencias y cuanto costaria el cambio, para
 * que la persona decida con su propio presupuesto. No se aplica ningun peso
 * entre precio y sellos, porque ese peso es de quien compra.
 *
 * Tres reglas sostienen la honestidad de esto:
 *
 * - Menos sellos NO es una compra sana. Los sellos advierten sobre azucar,
 *   sodio, grasas y calorias; no miden aporte nutricional ni dicen nada del
 *   resto de la dieta. Aca se informa una diferencia, no se recomienda salud.
 *
 * - Desconocido no es cero. Si no se pudieron consultar los sellos del producto
 *   actual, no hay contra que comparar. Si no se pudieron consultar los de un
 *   candidato, no se puede afirmar que tenga menos. En ambos casos se omite en
 *   vez de suponer.
 *
 * - Comparar formatos distintos no es comparar. Un yogur de 120 g con un sello
 *   menos que uno de 1 kg no es mas barato ni el mismo producto. Por eso se
 *   exige el mismo formato declarado en el nombre, con la misma maquinaria de
 *   equivalencia que ya usa la comparacion de precios.
 */

/** Filas que se miran por producto antes de filtrar por equivalencia. */
const CANDIDATES_PER_TERM = 24;
/** Productos de la canasta que se analizan en una consulta. */
const MAX_TERMS = 12;
/** `fetchSealsBySku` corta en 60 SKU por peticion; sobre eso se pide por tandas. */
const SEALS_PER_REQUEST = 60;

interface CatalogRow {
  sku: string | null;
  name: string | null;
  price: number | null;
}

export interface BasketItemForAlternatives {
  requestedTerm: string;
  requestedUnit?: SupermarketMeasurementUnit;
  sku?: string;
  name: string;
  price: number;
}

/** Sellos de todos los SKU pedidos, en tandas del tamano que admite la tienda. */
async function sealsForAll(store: string, skus: string[]): Promise<Record<string, string[]>> {
  const unique = [...new Set(skus.filter(Boolean))];
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += SEALS_PER_REQUEST) {
    chunks.push(unique.slice(index, index + SEALS_PER_REQUEST));
  }
  const pages = await Promise.all(chunks.map(chunk => fetchSealsBySku(store, chunk)));
  return Object.assign({}, ...pages) as Record<string, string[]>;
}

export async function findLowerSealAlternatives(
  store: string,
  items: BasketItemForAlternatives[],
): Promise<SupermarketSealAlternative[]> {
  if (!supportsSeals(store)) return [];

  const wanted = items.filter(item => item.sku && item.requestedTerm).slice(0, MAX_TERMS);
  if (wanted.length === 0) return [];

  const admin = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - FRESH_PRICE_AGE_MS).toISOString();

  const byTerm = await Promise.all(wanted.map(async item => {
    const primary = matchAnchor(item.requestedTerm);
    if (!primary) return { item, rows: [] as CatalogRow[] };
    const pattern = primary.length <= 2 ? `${primary}%` : `%${primary}%`;
    const { data } = await admin
      .from('supermarket_products')
      .select('sku,name,price')
      .eq('store', store)
      .eq('in_stock', true)
      .gte('last_seen_at', cutoff)
      .ilike('name', pattern)
      .not('sku', 'is', null)
      .order('price', { ascending: true })
      .limit(CANDIDATES_PER_TERM);

    // Mismo criterio de equivalencia que la comparacion de precios, mas el
    // formato del producto elegido: sin eso "menos sellos" podria ser solo un
    // envase mas chico.
    const signature = formatSignature(item.name);
    const rows = ((data ?? []) as CatalogRow[]).filter(row => {
      const name = String(row.name ?? '');
      return Boolean(row.sku)
        && row.sku !== item.sku
        && Number(row.price) > 0
        && termMatchesProductName(item.requestedTerm, name)
        && isProductSuitableForRequest(name, item.requestedTerm, item.requestedUnit)
        && formatSignature(name) === signature;
    });
    return { item, rows };
  }));

  // Una sola tanda de sellos para todo, incluido el producto actual: sin su
  // conteo no hay contra que comparar.
  const seals = await sealsForAll(store, byTerm.flatMap(entry => [
    entry.item.sku as string,
    ...entry.rows.map(row => String(row.sku)),
  ]));

  return byTerm.flatMap(({ item, rows }): SupermarketSealAlternative[] => {
    const currentSeals = seals[item.sku as string];
    // Sin sellos conocidos del actual no se puede afirmar que otro tenga menos.
    if (!Array.isArray(currentSeals)) {
      return [{
        requestedTerm: item.requestedTerm,
        current: { sku: item.sku as string, name: item.name, price: item.price, seals: null },
        options: [],
        unknownCurrent: true,
      }];
    }

    const options: SupermarketSealAlternativeOption[] = rows
      .flatMap((row): SupermarketSealAlternativeOption[] => {
        const candidateSeals = seals[String(row.sku)];
        // Un candidato sin sellos conocidos no califica: no se puede sostener
        // que tenga menos, y ofrecerlo seria vender una suposicion.
        if (!Array.isArray(candidateSeals)) return [];
        if (candidateSeals.length >= currentSeals.length) return [];
        return [{
          sku: String(row.sku),
          name: String(row.name ?? ''),
          price: Number(row.price),
          seals: candidateSeals,
          priceDelta: Number(row.price) - item.price,
        }];
      })
      .sort((left, right) => left.seals.length - right.seals.length || left.priceDelta - right.priceDelta);

    return [{
      requestedTerm: item.requestedTerm,
      current: { sku: item.sku as string, name: item.name, price: item.price, seals: currentSeals },
      options,
      unknownCurrent: false,
    }];
  });
}
