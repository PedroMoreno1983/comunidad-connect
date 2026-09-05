import 'server-only';

import { VTEX_STORES } from '@/lib/supermarketDirectHandoff';
import type { SupermarketStore } from '@/lib/types';

/**
 * `supermarketBasket.ts` suma precio unitario por cantidad. Eso no puede
 * representar una promocion por volumen -"Combina 4 x 5990" en Lider, "4 X $990"
 * en aCuenta- y el esquema solo guarda `price` y `list_price`, asi que tampoco
 * hay donde escribirla. Medido el 2026-09-04 sobre la misma canasta de seis
 * productos, el desvio llego a $1.285 y dio vuelta el orden de las cadenas.
 *
 * En vez de modelar promociones ajenas, se le pregunta a la tienda cuanto cobra.
 * VTEX expone una simulacion de carro que devuelve el total ya calculado, con
 * sus promociones aplicadas: una peticion por cadena y canasta.
 *
 * Las promociones no viajan en el catalogo. Se revisaron ~150 productos de Jumbo
 * y `Teasers`, `PromotionTeasers` y `DiscountHighLight` venian siempre vacios;
 * VTEX las resuelve recien al simular. Por eso esto vive aca y no en el scraper.
 */

const FETCH_TIMEOUT_MS = 12_000;
const MAX_ITEMS = 60;
/** VTEX responde en centavos: 215000 es $2.150. */
const CENTS = 100;

export interface SimulationItem {
  sku: string;
  quantity: number;
  seller?: string;
}

export interface SimulationResult {
  supported: boolean;
  /** Total que la tienda dice que cobra, en pesos. */
  total?: number;
  /** Descuentos aplicados, en pesos y positivo. */
  discount?: number;
  /** Cuantas lineas reconocio la tienda, para detectar productos caidos. */
  resolvedItems?: number;
}

export function supportsSimulation(store: string): boolean {
  return Object.prototype.hasOwnProperty.call(VTEX_STORES, store);
}

function totalsOf(payload: Record<string, unknown>): Record<string, number> {
  const totals = Array.isArray(payload.totals) ? payload.totals : [];
  const output: Record<string, number> = {};
  for (const entry of totals) {
    if (entry === null || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const value = Number(row.value);
    if (id && Number.isFinite(value)) output[id] = value;
  }
  return output;
}

/**
 * Nunca lanza: si la tienda no responde, se devuelve `supported: false` y la
 * pantalla sigue mostrando el estimado en vez de quedarse sin comparacion.
 */
export async function simulateBasketTotal(
  store: string,
  items: SimulationItem[],
): Promise<SimulationResult> {
  const base = VTEX_STORES[store as SupermarketStore];
  const wanted = items
    .filter(item => item.sku.trim() && item.quantity > 0)
    .slice(0, MAX_ITEMS);
  if (!base || wanted.length === 0) return { supported: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/api/checkout/pub/orderForms/simulation?sc=1`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        country: 'CHL',
        items: wanted.map(item => ({
          id: item.sku.trim(),
          quantity: Math.max(1, Math.round(item.quantity)),
          seller: item.seller?.trim() || '1',
        })),
      }),
    });
    if (!response.ok) return { supported: false };
    const payload = await response.json() as unknown;
    if (payload === null || typeof payload !== 'object') return { supported: false };

    const record = payload as Record<string, unknown>;
    const totals = totalsOf(record);
    if (!('Items' in totals)) return { supported: false };

    const discount = Math.abs(totals.Discounts ?? 0) / CENTS;
    return {
      supported: true,
      total: (totals.Items - Math.abs(totals.Discounts ?? 0)) / CENTS,
      discount,
      resolvedItems: Array.isArray(record.items) ? record.items.length : 0,
    };
  } catch {
    return { supported: false };
  } finally {
    clearTimeout(timeout);
  }
}
