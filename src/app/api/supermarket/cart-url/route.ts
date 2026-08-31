import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import {
  buildDirectCartUrl,
  MAX_ITEMS_PER_URL,
  storeSupportsDirectCart,
  storeSupportsShopifyCart,
  storeSupportsVtexCart,
} from '@/lib/supermarket/cartUrl';
import { resolveIrurzunCartItems } from '@/lib/supermarket/irurzunCart';
import { quoteVtexBasket, storeSupportsVtexQuote } from '@/lib/supermarket/vtexQuote';
import type { SupermarketCartHandoff } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ITEMS = 200;
const MANUAL_REASON: Record<string, string> = {
  Lider: 'Lider no publica un enlace para armar el carro. Abre cada ficha y agrégalo en super.lider.cl.',
  Tottus: 'Tottus no publica un enlace para armar el carro. Abre cada ficha en tottus.cl y agrégalo ahí.',
  aCuenta: 'aCuenta no publica un enlace para armar el carro. Abre cada ficha en acuenta.cl y agrégalo ahí.',
};

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function parseItems(body: Record<string, unknown>) {
  const rawItems = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  return rawItems.map((entry, index) => {
    const item = entry as Record<string, unknown>;
    return {
      id: cleanText(item.id, 100) || `item-${index + 1}`,
      requestedTerm: cleanText(item.requestedTerm, 80),
      name: cleanText(item.name, 240),
      productUrl: cleanText(item.productUrl, 600),
      sku: cleanText(item.sku, 80),
      quantity: Math.min(99, Math.max(1, Math.round(Number(item.quantity) || 1))),
      catalogLineTotal: Math.max(0, Number(item.lineTotal) || 0),
    };
  }).filter(item => item.name || item.productUrl || item.sku);
}

/**
 * Prepara un enlace que agrega productos dentro de la sesión del navegador
 * de la tienda. No crea carros server-to-server: un orderForm remoto no
 * transfiere su cookie al navegador de la persona.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceDistributedRateLimit(req, 'supermarket.cart_url', {
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const store = cleanText(body.store, 40);
    const requested = parseItems(body);

    if (requested.length === 0) {
      return NextResponse.json({ error: 'La lista llegó vacía.' }, { status: 400 });
    }

    if (!storeSupportsDirectCart(store)) {
      const productUrls = requested.map(item => item.productUrl).filter(Boolean);
      const response: SupermarketCartHandoff = {
        supported: false,
        mode: 'manual',
        store,
        plannedCount: 0,
        missingItems: requested.map(item => item.name).filter(Boolean),
        productUrls,
        reason: MANUAL_REASON[store]
          || `${store || 'Esa tienda'} no permite cargar el carro desde un enlace. Abre las fichas y agrégalo en su sitio.`,
      };
      return NextResponse.json(response);
    }

    if (storeSupportsVtexCart(store) && storeSupportsVtexQuote(store)) {
      const quoteInput = requested.slice(0, MAX_ITEMS_PER_URL).map(item => ({
        id: item.id,
        requestedTerm: item.requestedTerm || item.name,
        name: item.name,
        sku: item.sku || undefined,
        productUrl: item.productUrl || undefined,
        quantity: item.quantity,
        catalogLineTotal: item.catalogLineTotal,
      }));
      const overflow = requested.slice(MAX_ITEMS_PER_URL);
      const quote = await quoteVtexBasket(store, quoteInput);
      const quotedItems = quote.items.map(item => ({
        sku: item.sku,
        quantity: item.quantity,
        seller: item.seller,
      }));
      const usedQuoted = quotedItems.length > 0;
      const handoffItems = usedQuoted
        ? quotedItems
        : requested.flatMap(item => (item.sku ? [{ sku: item.sku, quantity: item.quantity }] : []));
      const cartUrl = buildDirectCartUrl(store, handoffItems);
      const unresolvedNames = usedQuoted
        ? quote.missingTerms.map(term => (
          quoteInput.find(item => item.requestedTerm === term)?.name || term
        ))
        : requested.filter(item => !item.sku).map(item => item.name);
      const missingItems = [...unresolvedNames, ...overflow.map(item => item.name)].filter(Boolean);

      if (!cartUrl) {
        const response: SupermarketCartHandoff = {
          supported: false,
          mode: 'manual',
          store,
          plannedCount: 0,
          missingItems,
          quotedAt: quote.quotedAt,
          productUrls: requested.map(item => item.productUrl).filter(Boolean),
          reason: 'La tienda no confirmó ningún SKU disponible para esta lista. No abrimos un carro vacío.',
        };
        return NextResponse.json(response);
      }

      const response: SupermarketCartHandoff = {
        supported: true,
        mode: 'browser-session-link',
        store,
        cartUrl,
        plannedCount: usedQuoted ? quote.items.length : handoffItems.length,
        missingItems,
        quotedTotal: quote.subtotal,
        catalogTotal: quote.catalogSubtotal,
        quotedAt: quote.quotedAt,
      };
      return NextResponse.json(response);
    }

    if (storeSupportsShopifyCart(store)) {
      const planned = requested.slice(0, MAX_ITEMS_PER_URL);
      const overflow = requested.slice(MAX_ITEMS_PER_URL);
      const resolved = await resolveIrurzunCartItems(planned);
      const withVariant = resolved.flatMap(entry => 'sku' in entry ? [entry] : []);
      const missingItems = [
        ...resolved.flatMap(entry => 'missing' in entry ? [entry.missing] : []),
        ...overflow.map(item => item.name),
      ].filter(Boolean);
      const cartUrl = buildDirectCartUrl(store, withVariant);

      if (!cartUrl) {
        const response: SupermarketCartHandoff = {
          supported: false,
          mode: 'manual',
          store,
          plannedCount: 0,
          missingItems,
          productUrls: requested.map(item => item.productUrl).filter(Boolean),
          reason: 'No pudimos identificar las variantes en Irurzun. Abre las fichas y agrégalo en su sitio.',
        };
        return NextResponse.json(response);
      }

      const response: SupermarketCartHandoff = {
        supported: true,
        mode: 'browser-session-link',
        store,
        cartUrl,
        plannedCount: withVariant.length,
        missingItems,
      };
      return NextResponse.json(response);
    }

    return NextResponse.json({
      supported: false,
      mode: 'manual',
      store,
      plannedCount: 0,
      missingItems: requested.map(item => item.name).filter(Boolean),
      reason: 'Esta tienda no permite cargar el carro desde un enlace.',
    } satisfies SupermarketCartHandoff);
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/cart-url', error, {
      publicMessage: 'No se pudo preparar el enlace del carro.',
    });
  }
}
