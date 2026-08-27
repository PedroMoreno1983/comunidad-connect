import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { comparePersistedSupermarkets } from '@/lib/supermarketCatalog';
import { isProductSuitableForRequest } from '@/lib/supermarketBasket';
import { searchLiveSupermarkets, buildLiveBasketComparison } from '@/lib/supermarketLive';
import { buildCheckoutPlan } from '@/lib/supermarketCheckoutPlan';
import {
  MAX_SHOPPING_LIST_CHARS,
  MAX_SHOPPING_LIST_ITEMS,
  parseGroupShoppingList,
} from '@/lib/supermarketGroupDomain';
import { toSupermarketShoppingItem } from '@/lib/supermarketResultItem';
import { createClient } from '@/lib/supabase/server';
import type { SupermarketMeasurementUnit, SupermarketShoppingItem } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const STORES = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus', 'aCuenta', 'Irurzun'] as const;
const STORE_URLS: Record<string, string> = {
  Jumbo: 'https://www.jumbo.cl',
  Lider: 'https://super.lider.cl',
  'Santa Isabel': 'https://www.santaisabel.cl',
  Unimarc: 'https://www.unimarc.cl',
  Tottus: 'https://www.tottus.cl/tottus-cl',
  aCuenta: 'https://www.acuenta.cl',
  Irurzun: 'https://irurzun.cl',
};

type RequestedItem = {
  term: string;
  quantity: number;
  unit?: SupermarketMeasurementUnit;
};

export async function POST(req: NextRequest) {
  try {
    const supabaseUser = await createClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body: unknown = await req.json();
    const message = body !== null && typeof body === 'object' && 'message' in body
      ? (body as Record<string, unknown>).message
      : undefined;

    if (typeof message !== 'string' || message.trim().length < 2 || message.length > MAX_SHOPPING_LIST_CHARS) {
      return NextResponse.json(
        { error: `Escribe hasta ${MAX_SHOPPING_LIST_ITEMS} productos (${MAX_SHOPPING_LIST_CHARS.toLocaleString('es-CL')} caracteres).` },
        { status: 400 },
      );
    }

    const requestedItems = parseGroupShoppingList(message.trim());
    const terms = requestedItems.map((item: RequestedItem) => item.term);
    const requestedQuantities = Object.fromEntries(requestedItems.map((item: RequestedItem) => [item.term, item.quantity]));
    const requestedUnits = Object.fromEntries(requestedItems.map((item: RequestedItem) => [item.term, item.unit]));
    if (terms.length === 0) {
      return NextResponse.json({
        message: 'Indica uno o más productos para buscar precios reales.',
        items: [],
      });
    }

    try {
      const comparison = await comparePersistedSupermarkets(terms, requestedQuantities, requestedUnits);
      const selected = comparison.recommended ?? comparison.bestAvailable;
      if (selected) {
        const selectedStore = selected.store;
        const safeSelectedItems = requestedItems.flatMap((requested: RequestedItem) => {
          const selectedItem = selected.items.find(item => item.requestedTerm === requested.term);
          if (selectedItem && isProductSuitableForRequest(selectedItem.name, requested.term, requested.unit)) {
            return [selectedItem];
          }
          const recovered = (comparison.alternativesByTerm?.[requested.term] || []).find(item => (
            item.store === selectedStore
            && isProductSuitableForRequest(item.name, requested.term, requested.unit)
          ));
          return recovered ? [recovered] : [];
        });
        const persistedByTerm = new Map<string, SupermarketShoppingItem>(
          safeSelectedItems.map(item => {
            const itemRecord: Record<string, unknown> = { ...item };
            const term = typeof itemRecord.requestedTerm === 'string' ? itemRecord.requestedTerm : '';
            const req = requestedItems.find((r: RequestedItem) => r.term === term) ?? { term, quantity: 1 };
            const optionCount = (comparison.alternativesByTerm?.[term] || []).length || 1;
            return [term, toSupermarketShoppingItem(itemRecord, req, 'catalog', optionCount)];
          })
        );
        const safeSelectedTerms = new Set(safeSelectedItems.map(item => item.requestedTerm));
        const termsMissingFromSafeSelection = terms.filter(term => !safeSelectedTerms.has(term));
        const liveItems = termsMissingFromSafeSelection.length > 0
          ? (await searchLiveSupermarkets(termsMissingFromSafeSelection.join(', '))).items
          : [];
        const liveByTerm = new Map<string, SupermarketShoppingItem>(
          liveItems
            .filter(item => item.store === selectedStore)
            .map(item => {
            const term = item.requestedTerm || item.query || '';
            const req = requestedItems.find((r: RequestedItem) => r.term === term) ?? { term, quantity: 1 };
            return [term, toSupermarketShoppingItem({
              id: randomUUID(),
              name: item.name,
              brand: item.brand,
              sku: item.sku,
              offerId: item.offerId,
              price: item.price,
              store: item.store,
              productUrl: item.productUrl,
              originalPrice: item.originalPrice,
              isOffer: item.isOffer,
              fetchedAt: new Date().toISOString(),
            }, req, 'live', 0)];
          })
        );
        const items: SupermarketShoppingItem[] = requestedItems.map((requested: RequestedItem) => (
          persistedByTerm.get(requested.term)
          || liveByTerm.get(requested.term)
          || {
            id: randomUUID(),
            name: requested.term,
            brand: '',
            requestedTerm: requested.term,
            requestedQuantity: requested.quantity,
            requestedUnit: requested.unit,
            quantity: requested.quantity,
            packUnits: 1,
            suppliedQuantity: requested.quantity,
            price: 0,
            lineTotal: 0,
            store: undefined,
            productUrl: undefined,
            originalPrice: undefined,
            isOffer: false,
            checked: false,
            available: false,
            source: 'missing',
          }
        ));
        const missingTerms = items.filter(item => !item.available).map(item => item.requestedTerm);
        const foundCount = items.length - missingTerms.length;
        const checkoutPlan = buildCheckoutPlan(items, terms, [selectedStore]);
        const ready = checkoutPlan.complete;
        const primaryStore = selectedStore;
        const subtotal = checkoutPlan.total;
        const checkoutMessage = ready
          ? `Canasta completa seleccionada en ${primaryStore} por $${subtotal.toLocaleString('es-CL')}.`
          : `${primaryStore} cubre ${foundCount} de ${requestedItems.length} productos; ${missingTerms.length} necesitan un equivalente dentro de la misma tienda.`;

        return NextResponse.json({
          message: checkoutMessage,
          items,
          fetchedAt: selected.fetchedAt ?? new Date().toISOString(),
          mode: checkoutPlan.status,
          recommendedStore: primaryStore ?? null,
          basketSubtotal: subtotal,
          basketReady: ready,
          requestedCount: requestedItems.length,
          foundCount,
          missingTerms,
          requestedItems,
          alternativesByTerm: comparison.alternativesByTerm,
          basketComparison: comparison.comparisons.map(basket => ({
            store: basket.store,
            subtotal: basket.subtotal,
            coveredCount: basket.coveredCount,
            requestedCount: basket.requestedCount,
            coveragePercent: basket.coveragePercent,
            missingTerms: basket.missingTerms,
            complete: basket.complete,
          })),
          basketOptions: [
            {
              ...selected,
              items: checkoutPlan.baskets[0]?.items ?? selected.items,
              subtotal,
              coveredCount: foundCount,
              coveragePercent: requestedItems.length > 0
                ? Math.round(foundCount * 100 / requestedItems.length)
                : 0,
              missingTerms,
              complete: ready,
            },
            ...comparison.comparisons
              .filter(basket => basket.store !== selectedStore),
          ],
          checkout: {
            status: checkoutPlan.status,
            store: primaryStore,
            storeUrl: primaryStore ? STORE_URLS[primaryStore] : undefined,
            productUrls: items.flatMap(item => item.productUrl ? [item.productUrl] : []),
            requiresRetailerSession: true,
            cartPreloaded: false,
            detail: ready
              ? `Convive preparó una sola canasta en ${primaryStore} para continuar sin volver a buscar los productos.`
              : `Convive mantuvo todo en ${primaryStore}; los faltantes no se repartirán entre otras tiendas.`,
            plan: checkoutPlan,
          },
          sources: STORES.map(store => ({
            store,
            status: items.some(item => item.store === store) || comparison.comparisons.some(basket => basket.store === store)
              ? 'ok'
              : 'no_results',
          })),
        });
      }
    } catch (error) {
      console.warn('[supermarket] persisted catalog unavailable, using live fallback:', error);
    }

    // Fallback live con buildLiveBasketComparison para obtener canastas por tienda
    const result = await buildLiveBasketComparison(message.trim());
    const fetchedAt = new Date().toISOString();
    const best = result.recommendedBasket;

    if (!best) {
      // Legacy fallback con searchLiveSupermarkets
      const legacyResult = await searchLiveSupermarkets(terms.join(', '));
      const liveByTerm = new Map(legacyResult.items.map(item => [item.requestedTerm || item.query || '', item]));
      const items: SupermarketShoppingItem[] = requestedItems.map((requested: RequestedItem) => {
        const item = liveByTerm.get(requested.term);
        if (!item) {
          return {
            id: randomUUID(),
            name: requested.term,
            brand: '',
            requestedTerm: requested.term,
            requestedQuantity: requested.quantity,
            requestedUnit: requested.unit,
            quantity: requested.quantity,
            packUnits: 1,
            suppliedQuantity: requested.quantity,
            price: 0,
            lineTotal: 0,
            store: undefined,
            productUrl: undefined,
            originalPrice: undefined,
            isOffer: false,
            checked: false,
            available: false,
            source: 'missing',
            fetchedAt,
          };
        }
        return toSupermarketShoppingItem({
          id: randomUUID(),
          name: item.name,
          brand: item.brand,
          sku: item.sku,
          offerId: item.offerId,
          price: item.price,
          store: item.store,
          productUrl: item.productUrl,
          originalPrice: item.originalPrice,
          isOffer: item.isOffer,
          fetchedAt,
        }, requested, 'live', 0);
      });
      const missingTerms = items.filter(item => !item.available).map(item => item.requestedTerm);

      return NextResponse.json({
        message: `Encontré ${items.length - missingTerms.length} de ${items.length} productos en fuentes públicas. No hay una canasta completa de una sola tienda.`,
        items,
        fetchedAt,
        mode: 'live_fallback',
        basketReady: false,
        requestedCount: requestedItems.length,
        foundCount: items.length - missingTerms.length,
        missingTerms,
        requestedItems,
        sources: STORES.map(store => ({
          store,
          status: legacyResult.items.some(i => i.store === store)
            ? 'ok'
            : 'no_results',
        })),
      });
    }

    // Construir respuesta con formato de master usando la canasta de buildLiveBasketComparison
    const ready = best.complete;
    const items: SupermarketShoppingItem[] = best.items.map(item => {
      const req = requestedItems.find((r: RequestedItem) => r.term === item.query) ?? { term: item.query, quantity: item.userQuantity ?? 1 };
      return toSupermarketShoppingItem({
        id: randomUUID(),
        name: item.name,
        brand: item.brand,
        sku: item.sku,
        offerId: item.offerId,
        price: item.price,
        store: item.store,
        productUrl: item.productUrl,
        originalPrice: item.originalPrice,
        isOffer: item.isOffer,
        selectionReason: item.selectionReason,
        fetchedAt,
      }, req, 'live', 0);
    });

    const missingTerms = best.missingTerms;
    const foundCount = items.length;

    return NextResponse.json({
      message: result.message,
      items,
      fetchedAt,
      mode: 'live_basket',
      recommendedStore: ready ? best.store : null,
      basketSubtotal: best.subtotal,
      basketReady: ready,
      requestedCount: requestedItems.length,
      foundCount,
      missingTerms,
      requestedItems,
      basketComparison: result.basketComparison?.map(basket => ({
        store: basket.store,
        subtotal: basket.subtotal,
        coveredCount: basket.coveredCount,
        requestedCount: basket.requestedCount,
        coveragePercent: basket.coveragePercent,
        missingTerms: basket.missingTerms,
        complete: basket.complete,
      })),
      degradedStores: result.degradedStores,
      checkout: {
        status: ready ? 'ready_for_assisted_checkout' : 'missing_products',
        store: best.store,
        storeUrl: STORE_URLS[best.store],
        productUrls: best.items.flatMap(item => item.productUrl ? [item.productUrl] : []),
        requiresRetailerSession: true,
        cartPreloaded: false,
        detail: 'Convive abre una sola vez el supermercado ganador y copia la lista exacta. El carro no se precarga porque la tienda exige la sesión del comprador.',
      },
      sources: STORES.map(store => ({
        store,
        status: result.basketComparison?.some(b => b.store === store)
          ? 'ok'
          : 'no_results',
      })),
    });
  } catch (error) {
    console.error('Supermarket search error:', error);
    return NextResponse.json(
      { error: 'No fue posible consultar los supermercados en este momento.' },
      { status: 502 },
    );
  }
}
