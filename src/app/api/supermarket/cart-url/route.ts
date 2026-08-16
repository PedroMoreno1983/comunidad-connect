import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { buildDirectCartUrl, storeSupportsDirectCart, directCartConfidence } from '@/lib/supermarket/cartUrl';
import { buildSharedCart, storeSupportsSharedCart } from '@/lib/supermarket/vtexSharedCart';
import { storeSearchUrl } from '@/lib/supermarketText';

export const runtime = 'nodejs';

const MAX_ITEMS = 200;

function cleanText(value: unknown, max: number): string {
    return typeof value === 'string' || typeof value === 'number'
        ? String(value).replace(/\s+/g, ' ').trim().slice(0, max)
        : '';
}

/**
 * Intenta extraer el SKU numérico o identificador del producto desde su URL.
 */
function extractSkuFromUrl(store: string, url: string): string {
    if (!url) return '';
    try {
        const decoded = decodeURIComponent(url);

        // Patrones específicos de tiendas chilenas
        if (store === 'Lider') {
            const match = decoded.match(/\/sku\/(\d+)/i) || decoded.match(/\/ip\/[^/]+\/(\d+)/i) || decoded.match(/\/(\d{5,12})(?:\/|\?|$)/);
            if (match) return match[1];
        }

        if (store === 'Jumbo' || store === 'Santa Isabel') {
            const match = decoded.match(/\/p\?id=(\d+)/i) || decoded.match(/\/(\d{5,12})\/p/i) || decoded.match(/id=(\d{5,12})/i);
            if (match) return match[1];
        }

        if (store === 'Unimarc') {
            const match = decoded.match(/\/product\/.*-(\d+)/i) || decoded.match(/\/(\d{5,12})(?:\/|\?|$)/);
            if (match) return match[1];
        }

        if (store === 'Tottus') {
            const match = decoded.match(/\/p\/(\d+)/i) || decoded.match(/\/(\d{5,12})(?:\/|\?|$)/);
            if (match) return match[1];
        }

        // Genérico: número de 5 a 10 dígitos antes de /p o en la URL
        const genericMatch = decoded.match(/(\d{5,10})/);
        if (genericMatch) return genericMatch[1];
    } catch {
        // Ignore parsing errors
    }
    return '';
}

/**
 * Devuelve el enlace que deja el carro cargado en la tienda o las URLs directas de compra.
 */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'supermarket.cart_url', {
        limit: 50,
        windowMs: 60_000,
    });
    if (limited) return limited;

    try {
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const store = cleanText(body.store, 40);

        if (!store) {
            return NextResponse.json({ error: 'Supermercado requerido.' }, { status: 400 });
        }

        const rawItems = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
        const requested = rawItems.map(entry => {
            const item = entry as Record<string, unknown>;
            const rawSku = cleanText(item.sku, 60);
            const rawUrl = cleanText(item.productUrl, 600);
            const name = cleanText(item.name, 240);
            const quantity = Math.min(99, Math.max(1, Math.round(Number(item.quantity) || 1)));

            const sku = rawSku || extractSkuFromUrl(store, rawUrl);

            return {
                id: cleanText(item.id, 100),
                name,
                sku,
                productUrl: rawUrl || storeSearchUrl(store, name),
                searchUrl: storeSearchUrl(store, name),
                quantity,
            };
        }).filter(item => item.name || item.productUrl);

        if (requested.length === 0) {
            return NextResponse.json({ error: 'La lista llegó vacía.' }, { status: 400 });
        }

        const admin = getSupabaseAdmin();

        // Resolver SKUs faltantes desde la base de datos
        const itemsNeedingSku = requested.filter(item => !item.sku);
        if (itemsNeedingSku.length > 0) {
            const urls = itemsNeedingSku.map(item => item.productUrl).filter(Boolean);
            const names = itemsNeedingSku.map(item => item.name).filter(Boolean);

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

            for (const item of requested) {
                if (!item.sku) {
                    item.sku = (item.productUrl && skuByUrl.get(item.productUrl))
                        || skuByName.get(item.name)
                        || extractSkuFromUrl(store, item.productUrl || '')
                        || '';
                }
            }
        }

        const withSku = requested.filter(item => item.sku);
        const missing = requested.filter(item => !item.sku);

        const canShare = storeSupportsSharedCart(store);

        // 1. Camino preferido para tiendas VTEX (Jumbo, Santa Isabel, Unimarc)
        if (canShare && withSku.length > 0) {
            try {
                const shared = await buildSharedCart(store, withSku.map(item => ({
                    sku: item.sku,
                    quantity: item.quantity,
                    name: item.name,
                })));

                if (shared.ok && shared.checkoutUrl) {
                    return NextResponse.json({
                        supported: true,
                        mode: 'shared-cart',
                        store,
                        confidence: 'verified',
                        cartUrl: shared.checkoutUrl,
                        loadedCount: shared.added.length,
                        cartTotal: shared.cartTotal,
                        items: requested,
                        missingItems: [
                            ...shared.rejected.map(item => item.name),
                            ...missing.map(item => item.name),
                        ].filter(Boolean),
                        rejectedDetail: shared.rejected,
                    });
                }
            } catch {
                // Fallback directo si el shared cart falla por timeout o red
            }
        }

        // 2. Camino Direct Link (GET /checkout/cart/add?... o búsqueda directa)
        if (withSku.length > 0) {
            const directUrl = buildDirectCartUrl(store, withSku.map(item => ({ sku: item.sku, quantity: item.quantity })));
            if (directUrl) {
                return NextResponse.json({
                    supported: true,
                    mode: 'direct-link',
                    store,
                    cartUrl: directUrl,
                    confidence: directCartConfidence(store) || 'verified',
                    loadedCount: withSku.length,
                    items: requested,
                    missingItems: missing.map(item => item.name).filter(Boolean),
                });
            }
        }

        // 3. Fallback inteligente: Tienda asistida con URLs directas de producto
        const storeHome = storeSearchUrl(store, requested[0]?.name || '');
        return NextResponse.json({
            supported: true,
            mode: 'assisted-links',
            store,
            cartUrl: storeHome,
            confidence: 'attempt',
            loadedCount: requested.length,
            items: requested,
            missingItems: [],
        });
    } catch (error) {
        return apiErrorResponse(req, '/api/supermarket/cart-url', error, {
            publicMessage: 'No se pudo preparar el enlace del carro.',
        });
    }
}
