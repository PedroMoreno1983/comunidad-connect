import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { comparePersistedSupermarkets } from '@/lib/supermarketCatalog';
import { searchLiveSupermarkets } from '@/lib/supermarketLive';
import { parseGroupShoppingList } from '@/lib/supermarketGroupDomain';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const STORES = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'aCuenta', 'Irurzun'] as const;
const STORE_URLS: Record<string, string> = {
  Jumbo: 'https://www.jumbo.cl',
  Lider: 'https://super.lider.cl',
  'Santa Isabel': 'https://www.santaisabel.cl',
  Unimarc: 'https://www.unimarc.cl',
  aCuenta: 'https://www.acuenta.cl',
  Irurzun: 'https://irurzun.cl',
};

type SupermarketResultItem = {
  id: string;
  name: string;
  brand?: string;
  requestedTerm: string;
  requestedQuantity: number;
  quantity: number;
  packUnits: number;
  suppliedQuantity: number;
  price: number;
  lineTotal: number;
  store?: string;
  productUrl?: string;
  originalPrice?: number;
  isOffer?: boolean;
  checked: boolean;
  available: boolean;
  source: 'catalog' | 'live' | 'missing';
  fetchedAt?: string;
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

    if (typeof message !== 'string' || message.trim().length < 2 || message.length > 1_500) {
      return NextResponse.json(
        { error: 'Escribe entre 2 y 1.500 caracteres para buscar productos.' },
        { status: 400 },
      );
    }

    const requestedItems = parseGroupShoppingList(message.trim());
    const terms = requestedItems.map(item => item.term);
    const requestedQuantities = Object.fromEntries(requestedItems.map(item => [item.term, item.quantity]));
    if (terms.length === 0) {
      return NextResponse.json({
        message: 'Indica uno o más productos para buscar precios reales.',
        items: [],
      });
    }

    try {
      const comparison = await comparePersistedSupermarkets(terms, requestedQuantities);
      const selected = comparison.recommended ?? comparison.bestAvailable;
      if (selected) {
        const ready = selected.complete;
        const persistedByTerm = new Map<string, SupermarketResultItem>(selected.items.map(item => [item.requestedTerm, {
          ...item,
          checked: false,
          available: true,
          source: 'catalog',
        }]));
        const liveItems = selected.missingTerms.length > 0
          ? (await searchLiveSupermarkets(selected.missingTerms.join(', '))).items
          : [];
        const liveByTerm = new Map<string, SupermarketResultItem>(liveItems.map(item => {
          const requestedTerm = item.requestedTerm || '';
          const requestedQuantity = requestedQuantities[requestedTerm] || 1;
          return [requestedTerm, {
            id: randomUUID(),
            ...item,
            requestedTerm,
            requestedQuantity,
            quantity: requestedQuantity,
            packUnits: 1,
            suppliedQuantity: requestedQuantity,
            lineTotal: item.price * requestedQuantity,
            checked: false,
            available: true,
            source: 'live',
          }];
        }));
        const items: SupermarketResultItem[] = requestedItems.map(requested => (
          persistedByTerm.get(requested.term)
          || liveByTerm.get(requested.term)
          || {
            id: randomUUID(),
            name: requested.term,
            brand: '',
            requestedTerm: requested.term,
            requestedQuantity: requested.quantity,
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
        const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
        return NextResponse.json({
          message: ready
            ? `Canasta completa seleccionada en ${selected.store} por $${selected.subtotal.toLocaleString('es-CL')}.`
            : `Encontré ${foundCount} de ${requestedItems.length} productos. Los faltantes siguen visibles para que puedas corregirlos o intentar otra descripción.`,
          items,
          fetchedAt: selected.fetchedAt ?? new Date().toISOString(),
          mode: ready ? 'persisted_basket' : 'mixed_catalog_live',
          recommendedStore: ready ? selected.store : null,
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
          checkout: {
            status: ready ? 'ready_for_assisted_checkout' : 'missing_products',
            store: selected.store,
            storeUrl: STORE_URLS[selected.store],
            productUrls: items.flatMap(item => item.productUrl ? [item.productUrl] : []),
            requiresRetailerSession: true,
            cartPreloaded: false,
            detail: 'El supermercado exige que las acciones Agregar se ejecuten dentro de la sesión del comprador.',
          },
          sources: STORES.map(store => ({
            store,
            status: items.some(item => item.store === store) || comparison.comparisons.some(basket => basket.store === store)
              ? 'ok'
              : store === 'Unimarc' ? 'unavailable' : 'no_results',
          })),
        });
      }
    } catch (error) {
      console.warn('[supermarket] persisted catalog unavailable, using live fallback:', error);
    }

    const result = await searchLiveSupermarkets(terms.join(', '));
    const fetchedAt = new Date().toISOString();
    const liveByTerm = new Map(result.items.map(item => [item.requestedTerm || '', item]));
    const items: SupermarketResultItem[] = requestedItems.map(requested => {
      const item = liveByTerm.get(requested.term);
      return item ? {
        id: randomUUID(),
        ...item,
        requestedTerm: requested.term,
        requestedQuantity: requested.quantity,
        quantity: requested.quantity,
        packUnits: 1,
        suppliedQuantity: requested.quantity,
        lineTotal: item.price * requested.quantity,
        checked: false,
        available: true,
        source: 'live',
        fetchedAt,
      } : {
        id: randomUUID(),
        name: requested.term,
        brand: '',
        requestedTerm: requested.term,
        requestedQuantity: requested.quantity,
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
        status: items.some(item => item.store === store)
          ? 'ok'
          : store === 'Unimarc' ? 'unavailable' : 'no_results',
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
