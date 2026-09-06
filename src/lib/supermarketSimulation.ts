import 'server-only';

import { VTEX_STORES } from '@/lib/supermarketDirectHandoff';
import type { SupermarketStore, SupermarketSimulationItem, SupermarketSimulationResult } from '@/lib/types';

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

export type SimulationItem = SupermarketSimulationItem;
export type SimulationResult = SupermarketSimulationResult;

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
 * Never expose a partial total as the basket total. Unsupported stores and
 * temporary failures are distinct; the estimate remains available in both cases.
 */
export async function simulateBasketTotal(
  store: string,
  items: SimulationItem[],
): Promise<SimulationResult> {
  const base = VTEX_STORES[store as SupermarketStore];
  if (!base) return { supported: false };
  if (items.length === 0 || items.length > MAX_ITEMS || items.some(item => (
    !item.sku.trim() || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 99
  ))) return { supported: true, complete: false, reason: 'La consulta admite hasta 60 productos con cantidades enteras de 1 a 99. No se calculó un total parcial.' };
  const wanted = items;

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
    if (!response.ok) return { supported: true, complete: false, reason: 'La tienda no respondió. Intenta nuevamente.' };
    const payload = await response.json() as unknown;
    if (payload === null || typeof payload !== 'object') return { supported: true, complete: false, reason: 'La tienda devolvió una respuesta inválida.' };

    const record = payload as Record<string, unknown>;
    const totals = totalsOf(record);
    const returned = Array.isArray(record.items) ? record.items : [];
    const expected = new Map<string, number>();
    for (const item of wanted) {
      const key = JSON.stringify([item.sku.trim(), item.seller?.trim() || '1']);
      expected.set(key, (expected.get(key) ?? 0) + item.quantity);
    }
    const resolved = new Map<string, number>();
    for (const entry of returned) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      if (row.availability !== 'available' || !Number.isInteger(row.quantity) || Number(row.quantity) <= 0) continue;
      const key = JSON.stringify([String(row.id), String(row.seller)]);
      resolved.set(key, (resolved.get(key) ?? 0) + Number(row.quantity));
    }
    const resolvedItems = wanted.filter(item => {
      const key = JSON.stringify([item.sku.trim(), item.seller?.trim() || '1']);
      return resolved.get(key) === expected.get(key);
    }).length;
    const hasErrors = Array.isArray(record.messages) && record.messages.some(message => (
      message && typeof message === 'object' && (message as Record<string, unknown>).status === 'error'
    ));
    const total = (totals.Items - Math.abs(totals.Discounts ?? 0)) / CENTS;
    if (hasErrors || resolvedItems !== wanted.length || resolved.size !== expected.size || !Number.isFinite(total) || total < 0) {
      return { supported: true, complete: false, resolvedItems, reason: 'No se pudo verificar toda la canasta con sus cantidades. Revisa los faltantes en la tienda.' };
    }

    const discount = Math.abs(totals.Discounts ?? 0) / CENTS;
    return {
      supported: true,
      complete: true,
      total,
      discount,
      resolvedItems,
    };
  } catch {
    return { supported: true, complete: false, reason: 'No se pudo contactar a la tienda. Intenta nuevamente.' };
  } finally {
    clearTimeout(timeout);
  }
}
