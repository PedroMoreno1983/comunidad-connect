import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { buildDirectCartUrl, storeSupportsDirectCart, directCartConfidence } from '@/lib/supermarket/cartUrl';

export const runtime = 'nodejs';

const MAX_ITEMS = 200;

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' || typeof value === 'number'
        ? String(value).replace(/\s+/g, ' ').trim().slice(0, max)
        : '';
}

/**
 * Devuelve el enlace que deja el carro cargado en la tienda.
 *
 * La canasta viaja con nombre y URL de producto, no con SKU, así que el SKU se
 * resuelve acá contra el catálogo. Se hace en el servidor y no en el cliente
 * porque el catálogo no está expuesto vía PostgREST y porque así el enlace se
 * arma con la misma fuente de datos que calculó los precios.
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
            // No es un error: es información que la UI necesita para ofrecer el
            // otro camino en vez de un botón que no va a funcionar.
            return NextResponse.json({
                supported: false,
                store,
                reason: `${store || 'Esa tienda'} no permite cargar el carro desde un enlace. `
                    + 'Tendrás que agregar los productos en su sitio.',
            });
        }

        const rawItems = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
        const requested = rawItems.map(entry => {
            const item = entry as Record<string, unknown>;
            return {
                name: cleanText(item.name, 240),
                productUrl: cleanText(item.productUrl, 600),
                quantity: Math.min(99, Math.max(1, Math.round(Number(item.quantity) || 1))),
            };
        }).filter(item => item.name || item.productUrl);

        if (requested.length === 0) {
            return NextResponse.json({ error: 'La lista llegó vacía.' }, { status: 400 });
        }

        const admin = getSupabaseAdmin();

        // Se resuelve primero por URL de producto (identifica sin ambigüedad) y
        // solo se cae al nombre cuando no hay URL, que es más frágil porque dos
        // presentaciones distintas pueden compartir nombre.
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

        const cartUrl = buildDirectCartUrl(store, withSku);
        if (!cartUrl) {
            return NextResponse.json({
                supported: false,
                store,
                reason: 'No pudimos identificar los productos en el catálogo de la tienda. '
                    + 'Tendrás que agregarlos en su sitio.',
            });
        }

        return NextResponse.json({
            supported: true,
            store,
            cartUrl,
            // 'verified' (Jumbo, funciona) o 'attempt' (Lider/Unimarc: puede que la
            // tienda te pida verificación o bloquee). La UI avisa en el segundo caso.
            confidence: directCartConfidence(store),
            loadedCount: withSku.length,
            // La UI debe nombrar lo que quedó fuera: un carro incompleto que se
            // presenta como completo hace que la persona pague de menos sin saberlo.
            missingItems: missing.map(item => item.name).filter(Boolean),
        });
    } catch (error) {
        return apiErrorResponse(req, '/api/supermarket/cart-url', error, {
            publicMessage: 'No se pudo preparar el enlace del carro.',
        });
    }
}
