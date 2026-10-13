import { randomUUID } from 'node:crypto';
import { calculateProductQuantity, volumePromoLineTotal } from '@/lib/supermarketBasket';
import { buildSelectionReason, storeSearchUrl } from '@/lib/supermarketText';
import type { SupermarketMeasurementUnit, SupermarketShoppingItem, SupermarketVolumePromo } from '@/lib/types';

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
 * `sku` abre el camino oficial de Lider y el de ficha. `offerId` es obligatorio
 * para la app de Lider y viaja vacío en el resto. Si se pierden al serializar
 * la canasta, cada supermercado falla igual: el puente no tiene qué cargar.
 */
export function catalogOfferId(item: Record<string, unknown>): string | undefined {
  return optionalText(item.offerId) || optionalText(item.offer_id);
}

function volumePromoFrom(value: unknown): SupermarketVolumePromo | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const minQuantity = typeof record.minQuantity === 'number' ? Math.round(record.minQuantity) : 0;
  const totalPrice = typeof record.totalPrice === 'number' ? Math.round(record.totalPrice) : 0;
  if (minQuantity < 2 || totalPrice <= 0) return undefined;
  return {
    minQuantity,
    totalPrice,
    label: optionalText(record.label),
    group: optionalText(record.group),
  };
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
  const imageUrl = optionalText(item.imageUrl) || optionalText(item.image_url);
  const volumePromo = volumePromoFrom(item.volumePromo);
  const regularTotal = price * packs;
  // La canasta ya puede traer el total con una promoción combinada entre
  // productos ("Combina"); se respeta si no supera el precio normal. Si no
  // viene, se recalcula con la promo de la propia línea.
  const providedTotal = typeof item.lineTotal === 'number' && Number.isFinite(item.lineTotal)
    && typeof item.quantity === 'number' && Math.round(item.quantity) === packs
    ? item.lineTotal
    : undefined;
  const lineTotal = volumePromo && providedTotal !== undefined && providedTotal > 0 && providedTotal <= regularTotal
    ? providedTotal
    : volumePromoLineTotal(price, packs, volumePromo);
  return {
    id: typeof item.id === 'string' ? item.id : randomUUID(),
    name,
    brand,
    sku: optionalText(item.sku),
    offerId: catalogOfferId(item),
    salesUnit: optionalText(item.salesUnit) || optionalText(item.sales_unit),
    requestedTerm: requested.term,
    requestedQuantity,
    requestedUnit,
    quantity: packs,
    packUnits,
    suppliedQuantity,
    price,
    lineTotal,
    volumePromo,
    promoChecked: typeof item.promoChecked === 'boolean' ? item.promoChecked : undefined,
    promoSavings: regularTotal - lineTotal > 0 ? regularTotal - lineTotal : undefined,
    store,
    // Todo producto encontrado queda linkeable: ficha exacta si existe, o la
    // búsqueda del nombre exacto dentro del sitio de la tienda como respaldo.
    productUrl: rawProductUrl || storeSearchUrl(store, name),
    imageUrl,
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
