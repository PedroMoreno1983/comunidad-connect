import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import {
    buildDirectCartUrl,
    storeSupportsDirectCart,
    directCartConfidence,
    MAX_ITEMS_PER_URL,
} from '@/lib/supermarket/cartUrl';
import { quoteVtexBasket, storeSupportsVtexQuote } from '@/lib/supermarket/vtexQuote';

export const runtime = 'nodejs';

const MAX_ITEMS = 200;

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' || typeof value === 'number'
        ? String(value).replace(/\s+/g, ' ').trim().slice(0, max)
        : '';
}

/**
 * Devuelve un enlace que agrega productos dentro de la sesión del navegador de
 * la tienda. No crea carros server-to-server: un orderForm remoto no transfiere
 * su cookie ni su propiedad al navegador de la persona.
 *
 * En tiendas VTEX, los productos y precios se vuelven a resolver contra la
 * tienda antes de construir el enlace. El resultado dice cuántos productos
 * viajan en el enlace, nunca cuántos quedaron en el carro; eso solo lo confirma
 * la persona en el checkout de la tienda.
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

        if (!storeSupportsDirectCart(store)) {
            return NextResponse.json({
                supported: false,
                store,
                reason: `${store || 'Esa tienda'} no permite cargar el carro desde un enlace. `
                    + 'Usa el cargador asistido para agregar los productos dentro de su sitio.',
            });
        }

        const rawItems = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
        const requested = rawItems.map(entry => {
            const item = entry as Record<string, unknown>;
            return {
                id: cleanText(item.id, 100),
                requestedTerm: cleanText(item.requestedTerm, 80),
                name: cleanText(item.name, 240),
                productUrl: cleanText(item.productUrl, 600),
                quantity: Math.min(99, Math.max(1, Math.round(Number(item.quantity) || 1))),
                catalogLineTotal: Math.max(0, Number(item.lineTotal) || 0),
            };
        }).filter(item => item.name || item.productUrl);

        if (requested.length === 0) {
            return NextResponse.json({ error: 'La lista llegó vacía.' }, { status: 400 });
        }

        if (storeSupportsVtexQuote(store)) {
            const quoteInput = requested.slice(0, MAX_ITEMS_PER_URL).map((item, index) => ({
                id: item.id || `item-${index + 1}`,
                requestedTerm: item.requestedTerm || item.name,
                name: item.name,
                productUrl: item.productUrl || undefined,
                quantity: item.quantity,
                catalogLineTotal: item.catalogLineTotal,
            }));
            const overflow = requested.slice(MAX_ITEMS_PER_URL);
            const quote = await quoteVtexBasket(store, quoteInput);
            const cartUrl = buildDirectCartUrl(store, quote.items);
            const allMissingTerms = [
                ...quote.missingTerms,
                ...overflow.map(item => item.requestedTerm || item.name),
            ];
            const unresolvedNames = quote.missingTerms.map(term => (
                quoteInput.find(item => item.requestedTerm === term)?.name || term
            ));

            if (!cartUrl) {
                return NextResponse.json({
                    supported: false,
                    store,
                    reason: 'La tienda no confirmo ningun SKU disponible para esta lista. '
                        + 'No abrimos un carro con productos distintos; usa otra tienda o el cargador asistido.',
                    quotedAt: quote.quotedAt,
                    missingItems: [...unresolvedNames, ...overflow.map(item => item.name)],
                });
            }

            return NextResponse.json({
                supported: true,
                mode: 'browser-session-link',
                store,
                cartUrl,
                confidence: directCartConfidence(store),
                plannedCount: quote.items.length,
                missingItems: [...unresolvedNames, ...overflow.map(item => item.name)].filter(Boolean),
                missingTerms: allMissingTerms,
                quotedItems: quote.items,
                quotedTotal: quote.subtotal,
                catalogTotal: quote.catalogSubtotal,
                quotedAt: quote.quotedAt,
                quoteSource: 'retailer_checkout',
            });
        }

        const admin = getSupabaseAdmin();

        // La URL identifica el producto sin ambigüedad. El nombre se usa solo
        // cuando la canasta no trae URL.
        const urls = requested.map(item => item.productUrl).filter(Boolean);
        const names = requested.filter(item => !item.productUrl).map(item => item.name);

        const [byUrl, byName] = await Promise.all([
            urls.length
                ? admin.from('supermarket_products')
                    .select('name, sku, product_url')
                    .eq('store', store)
                    .in('product_url', urls)
                : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
            names.length
                ? admin.from('supermarket_products')
                    .select('name, sku, product_url')
                    .eq('store', store)
                    .in('name', names)
                : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
        ]);

        const skuByUrl = new Map<string, string>();
        const skuByName = new Map<string, string>();
        for (const row of (byUrl.data ?? []) as Array<Record<string, unknown>>) {
            const sku = cleanText(row.sku, 60);
            const url = cleanText(row.product_url, 600);
            if (sku && url && !skuByUrl.has(url)) skuByUrl.set(url, sku);
        }
        for (const row of (byName.data ?? []) as Array<Record<string, unknown>>) {
            const sku = cleanText(row.sku, 60);
            const name = cleanText(row.name, 240);
            if (sku && name && !skuByName.has(name)) skuByName.set(name, sku);
        }

        const resolved = requested.map(item => ({
            name: item.name,
            quantity: item.quantity,
            sku: (item.productUrl && skuByUrl.get(item.productUrl)) || skuByName.get(item.name) || '',
        }));

        const withSku = resolved.filter(item => item.sku);
        const missing = resolved.filter(item => !item.sku);
        const planned = withSku.slice(0, MAX_ITEMS_PER_URL);
        const overflow = withSku.slice(MAX_ITEMS_PER_URL);
        const cartUrl = buildDirectCartUrl(store, planned);

        if (!cartUrl) {
            return NextResponse.json({
                supported: false,
                store,
                reason: 'No pudimos identificar los productos en el catálogo de la tienda. '
                    + 'Usa el cargador asistido para agregarlos en su sitio.',
            });
        }

        return NextResponse.json({
            supported: true,
            mode: 'browser-session-link',
            store,
            cartUrl,
            // Confirma el mecanismo, no el stock de los productos.
            confidence: directCartConfidence(store),
            plannedCount: planned.length,
            missingItems: [...missing, ...overflow].map(item => item.name).filter(Boolean),
        });
    } catch (error) {
        return apiErrorResponse(req, '/api/supermarket/cart-url', error, {
            publicMessage: 'No se pudo preparar el enlace del carro.',
        });
    }
}
