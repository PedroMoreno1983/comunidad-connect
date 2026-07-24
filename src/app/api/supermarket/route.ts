import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { comparePersistedSupermarkets } from '@/lib/supermarketCatalog';
import { extractSupermarketTerms, buildLiveBasketComparison } from '@/lib/supermarketLive';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const STORES = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc'] as const;
const STORE_URLS: Record<string, string> = {
  Jumbo: 'https://www.jumbo.cl',
  Lider: 'https://super.lider.cl',
  'Santa Isabel': 'https://www.santaisabel.cl',
  Unimarc: 'https://www.unimarc.cl',
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

    if (typeof message !== 'string' || message.trim().length < 2 || message.length > 300) {
      return NextResponse.json(
        { error: 'Escribe entre 2 y 300 caracteres para buscar productos.' },
        { status: 400 },
      );
    }

    const termInfos = extractSupermarketTerms(message.trim());
    if (termInfos.length === 0) {
      return NextResponse.json({
        message: 'Indica uno o más productos para buscar precios reales.',
        items: [],
      });
    }
    const terms = termInfos.map(t => t.term);

    try {
      const comparison = await comparePersistedSupermarkets(terms);
      const selected = comparison.recommended ?? comparison.bestAvailable;
      if (selected) {
        const ready = selected.complete;
        return NextResponse.json({
          message: ready
            ? `Canasta completa seleccionada en ${selected.store} por $${selected.subtotal.toLocaleString('es-CL')}.`
            : `${selected.store} cubre ${selected.coveredCount} de ${selected.requestedCount} productos; ninguna tienda cubre todavía la lista completa.`,
          items: selected.items,
          fetchedAt: selected.fetchedAt ?? new Date().toISOString(),
          mode: 'persisted_basket',
          recommendedStore: ready ? selected.store : null,
          basketSubtotal: selected.subtotal,
          basketReady: ready,
          missingTerms: selected.missingTerms,
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
            productUrls: selected.items.flatMap(item => item.productUrl ? [item.productUrl] : []),
            requiresRetailerSession: true,
            cartPreloaded: false,
            detail: 'El supermercado exige que las acciones Agregar se ejecuten dentro de la sesión del comprador.',
          },
          sources: STORES.map(store => ({
            store,
            status: comparison.comparisons.some(basket => basket.store === store)
              ? 'ok'
              : store === 'Unimarc' ? 'unavailable' : 'no_results',
          })),
        });
      }
    } catch (error) {
      console.warn('[supermarket] persisted catalog unavailable, using live fallback:', error);
    }

    const result = await buildLiveBasketComparison(message.trim());
    const fetchedAt = new Date().toISOString();
    const best = result.recommendedBasket;

    if (!best) {
      return NextResponse.json({
        message: result.message,
        items: [],
        fetchedAt,
        mode: 'live_fallback',
        basketReady: false,
        sources: STORES.map(store => ({
          store,
          status: store === 'Unimarc' ? 'unavailable' : 'no_results',
        })),
      });
    }

    const ready = best.complete;
    const items = best.items.map(item => ({
      id: randomUUID(),
      name: item.name,
      brand: item.brand,
      quantity: item.quantity,
      userQuantity: item.userQuantity,
      totalPrice: item.totalPrice,
      price: item.price,
      store: item.store,
      originalPrice: item.originalPrice,
      isOffer: item.isOffer ?? false,
      checked: false,
      fetchedAt,
    }));

    return NextResponse.json({
      message: result.message,
      items,
      fetchedAt,
      mode: 'live_fallback',
      recommendedStore: ready ? best.store : null,
      basketSubtotal: best.subtotal,
      basketReady: ready,
      missingTerms: best.missingTerms,
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
        detail: 'El supermercado exige que las acciones Agregar se ejecuten dentro de la sesión del comprador.',
      },
      sources: STORES.map(store => ({
        store,
        status: result.basketComparison?.some(b => b.store === store)
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
