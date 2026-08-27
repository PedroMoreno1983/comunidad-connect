import { randomUUID } from 'node:crypto';
import { calculateProductQuantity } from '@/lib/supermarketBasket';
import { buildSelectionReason, storeSearchUrl } from '@/lib/supermarketText';
import type { SupermarketMeasurementUnit, SupermarketShoppingItem } from '@/lib/types';

export interface SupermarketRequestedTerm {
  term: string;
  quantity: number;
  unit?: SupermarketMeasurementUnit;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Identificadores que el cargador necesita en TODAS las tiendas.
 *
 * `sku` abre el camino de API (Lider) y el de ficha. `offerId` es obligatorio
 * para Lider/Orchestra y viaja vacío en el resto. Si se pierden al serializar
 * la canasta, cada supermercado falla igual: el puente no tiene qué cargar.
 */
export function catalogOfferId(item: Record<string, unknown>): string | undefined {
  return optionalText(item.offerId) || optionalText(item.offer_id);
}

export function toSupermarketShoppingItem(
  item: Record<string, unknown>,
  requested: SupermarketRequestedTerm,
  source: SupermarketShoppingItem['source'],
  optionCount = 1,
): SupermarketShoppingItem {
  const price = typeof item.price === 'number' ? item.price : 0;
  const requestedQuantity = requested.quantity;
  const requestedUnit = requested.unit;
  const packUnits = typeof item.packUnits === 'number' ? item.packUnits : 1;
  const name = typeof item.name === 'string' ? item.name : requested.term;
  const calculated = calculateProductQuantity(name, requestedQuantity, requestedUnit, packUnits);
  const packs = typeof item.quantity === 'number'
    ? Math.max(1, Math.round(item.quantity))
    : calculated.packs;
  const suppliedQuantity = typeof item.suppliedQuantity === 'number'
    ? item.suppliedQuantity
    : calculated.suppliedQuantity;
  const brand = typeof item.brand === 'string' ? item.brand : undefined;
  const store = typeof item.store === 'string' ? item.store : undefined;
  const isOffer = typeof item.isOffer === 'boolean' ? item.isOffer : undefined;
  const rawProductUrl = optionalText(item.productUrl);
  return {
    id: typeof item.id === 'string' ? item.id : randomUUID(),
    name,
    brand,
    sku: optionalText(item.sku),
    offerId: catalogOfferId(item),
    requestedTerm: requested.term,
    requestedQuantity,
    requestedUnit,
    quantity: packs,
    packUnits,
    suppliedQuantity,
    price,
    lineTotal: price * packs,
    store,
    // Todo producto encontrado queda linkeable: ficha exacta si existe, o la
    // búsqueda del nombre exacto dentro del sitio de la tienda como respaldo.
    productUrl: rawProductUrl || storeSearchUrl(store, name),
    originalPrice: typeof item.originalPrice === 'number' ? item.originalPrice : undefined,
    isOffer,
    selectionReason: typeof item.selectionReason === 'string' && item.selectionReason
      ? item.selectionReason
      : buildSelectionReason({ brand, explicitBrand: null, optionCount, store, isOffer }),
    checked: false,
    available: source !== 'missing',
    source,
    fetchedAt: typeof item.fetchedAt === 'string' ? item.fetchedAt : undefined,
  };
}
