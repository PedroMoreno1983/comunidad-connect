/**
 * /api/supermarket/refresh/route.ts
 * Endpoint para actualizar el catálogo de supermercados.
 * Puede ser llamado manualmente o por un cron job.
 * Requiere el header x-cron-secret para ejecución autenticada.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { searchAllRetailerProducts } from '@/lib/supermarketLive';
import type { ScrapedItem } from '@/lib/supermarketLive';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Delay entre términos para no saturar los servidores (ms). */
const TERM_DELAY_MS = 800;
/** Tiendas a trackear en sourceStatus. */
const TRACKED_STORES = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc'] as const;
/** Tiendas que efectivamente se scrapean por término. */
const REFRESH_STORES: ScrapedItem['store'][] = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc'];

/**
 * Catálogo base de términos de búsqueda para mantener precios actualizados.
 * Cubre las categorías más comunes de un hogar chileno.
 */
const BASE_CATALOG_TERMS = [
  // Abarrotes
  'arroz', 'fideos', 'aceite', 'azucar', 'sal', 'tomate triturado', 'lentejas',
  'harina', 'avena', 'azucar flor', 'sal fina', 'aceite de oliva',
  'vinagre', 'mayonesa', 'ketchup', 'mostaza', 'manjar', 'miel', 'jalea',
  // Lácteos y huevos
  'huevos', 'leche', 'mantequilla', 'queso', 'yogurt', 'leche descremada',
  'queso laminado', 'queso crema',
  // Carnes y fríos
  'pollo', 'carne molida', 'atun', 'jamon', 'salchichas', 'pate', 'hamburguesa',
  // Verduras y frutas
  'tomate', 'cebolla', 'papa', 'limon', 'palta', 'manzana', 'platano', 'zanahoria',
  // Panadería
  'pan molde', 'pan integral', 'tortillas', 'galletas',
  // Bebidas
  'agua mineral', 'jugo naranja', 'coca cola', 'bebida light', 'cafe', 'te',
  // Higiene y limpieza
  'papel higienico', 'detergente', 'shampoo', 'pasta dental', 'lavandina',
  'jabon liquido', 'suavizante', 'desodorante', 'papel toalla', 'lavalozas',
];

interface IngestProduct {
  store: string;
  name: string;
  brand?: string;
  price: number;
  list_price?: number;
  in_stock: boolean;
  query: string;
  product_url?: string;
  image_url?: string;
  sku?: string;
  ean?: string;
}

function buildIngestPayload(items: ScrapedItem[]): IngestProduct[] {
  return items.map(item => ({
    store: item.store,
    name: item.name,
    brand: item.brand || undefined,
    price: item.price,
    list_price: item.originalPrice && item.originalPrice > item.price ? item.originalPrice : undefined,
    in_stock: true,
    query: item.query,
    product_url: item.productUrl,
    image_url: item.imageUrl,
    sku: item.sku,
    ean: item.ean,
  }));
}

/** Delay helper. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  // Verificar autenticación para ejecución programada
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('x-cron-secret');
  
  if (cronSecret && authHeader !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const terms: string[] = Array.isArray(body.terms) && body.terms.length > 0
      ? body.terms
      : BASE_CATALOG_TERMS;

    const allItems: ScrapedItem[] = [];
    const sourceStatus: { store: string; status: string; term: string; error?: string }[] = [];

    // Scrapear cada término con throttling para no saturar.
    // Se ingieren TODOS los productos encontrados por tienda (no solo el mejor
    // match) para que el catálogo persistido crezca a miles de productos.
    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      try {
        const perStore = await Promise.all(REFRESH_STORES.map(store => searchAllRetailerProducts(store, term)));
        const items = perStore.flat();
        if (items.length > 0) {
          allItems.push(...items);
        }

        // Registrar status por tienda
        const storesFound = new Set(items.map(item => item.store));
        TRACKED_STORES.forEach(store => {
          sourceStatus.push({
            store,
            status: storesFound.has(store as ScrapedItem['store']) ? 'ok' : 'no_results',
            term,
          });
        });
      } catch (termError) {
        console.error(`[supermarket refresh] Error scraping term "${term}":`, termError);
        TRACKED_STORES.forEach(store => {
          sourceStatus.push({
            store,
            status: 'error',
            term,
            error: termError instanceof Error ? termError.message : 'Unknown error',
          });
        });
      }

      // Throttling: esperar entre términos (excepto el último)
      if (i < terms.length - 1) {
        await delay(TERM_DELAY_MS);
      }
    }

    if (allItems.length === 0) {
      return NextResponse.json({
        status: 'failed',
        productCount: 0,
        message: 'No se encontraron productos en ninguna fuente.',
        sourceStatus,
      }, { status: 502 });
    }

    // Llamar a la función RPC de Supabase para ingestión
    const supabaseAdmin = getSupabaseAdmin();
    const fetchedAt = new Date().toISOString();
    const products = buildIngestPayload(allItems);

    const { data: ingestResult, error: ingestError } = await supabaseAdmin
      .rpc('ingest_supermarket_snapshot', {
        p_terms: terms,
        p_products: products,
        p_source_status: sourceStatus,
        p_fetched_at: fetchedAt,
      });

    if (ingestError) {
      console.error('[supermarket refresh] Ingestion error:', ingestError);
      return NextResponse.json({
        status: 'partial',
        scrapedCount: allItems.length,
        error: 'Ingestion failed',
        detail: ingestError.message,
        sourceStatus,
      }, { status: 502 });
    }

    return NextResponse.json({
      status: 'completed',
      ...ingestResult,
      scrapedCount: allItems.length,
      sourceStatus,
    });

  } catch (error) {
    console.error('[supermarket refresh] Unexpected error:', error);
    return NextResponse.json({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET handler para health check o ejecución manual simple.
 * Requiere x-cron-secret.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('x-cron-secret');
  
  if (cronSecret && authHeader !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Reenviar a POST con el catálogo base
  const fakeRequest = new NextRequest(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify({ terms: BASE_CATALOG_TERMS }),
  });
  
  return POST(fakeRequest);
}
