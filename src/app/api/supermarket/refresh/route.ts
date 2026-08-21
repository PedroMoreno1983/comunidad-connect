/**
 * /api/supermarket/refresh/route.ts
 * Endpoint para actualizar el catálogo de supermercados.
 * Solo lo invoca el cron: dispara scraping caro y escribe con la service role
 * key, así que nunca debe quedar accesible sin el secreto compartido.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { searchAllRetailerProducts } from '@/lib/supermarketLive';
import type { ScrapedItem } from '@/lib/supermarketLive';

export const runtime = 'nodejs';
export const maxDuration = 60;

function matchesSecret(provided: string | null, secret: string): boolean {
  if (!provided) return false;
  const providedBuf = Buffer.from(provided, 'utf8');
  const secretBuf = Buffer.from(secret, 'utf8');
  return providedBuf.length === secretBuf.length && crypto.timingSafeEqual(providedBuf, secretBuf);
}

/**
 * Autoriza la ejecución programada. Devuelve la respuesta de rechazo o `null`
 * si el llamante es legítimo.
 *
 * Vercel Cron manda el secreto como `Authorization: Bearer $CRON_SECRET`; se
 * acepta además `x-cron-secret` para invocaciones manuales.
 */
function denyUnlessCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: 'Refresco de catálogo no configurado.' }, { status: 503 });
  }
  const bearer = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? null;
  if (matchesSecret(bearer, secret) || matchesSecret(req.headers.get('x-cron-secret'), secret)) {
    return null;
  }
  return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
}

/** Delay entre términos para no saturar los servidores (ms). */
const TERM_DELAY_MS = 800;
/** Presupuesto de tiempo: se deja de abrir términos nuevos antes del límite. */
const TIME_BUDGET_MS = 45_000;
/** Tiendas a trackear en sourceStatus. */
const TRACKED_STORES = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus'] as const;
/** Tiendas que efectivamente se scrapean por término. */
const REFRESH_STORES: ScrapedItem['store'][] = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus'];

/**
 * Rotación diaria de términos: el catálogo completo no cabe en una sola
 * ejecución serverless, así que cada corrida empieza en un offset distinto
 * (día del año) y en ~2-3 días todos los términos quedan refrescados.
 * El TTL de lectura del catálogo (96h) cubre esa rotación.
 */
function rotatedTerms(terms: string[]): string[] {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);
    const offset = dayOfYear % terms.length;
    return [...terms.slice(offset), ...terms.slice(0, offset)];
}

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
  'pollo', 'carne molida', 'longaniza', 'atun', 'jamon', 'salchichas', 'pate', 'hamburguesa',
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
  const denied = denyUnlessCron(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const requestedTerms: string[] = Array.isArray(body.terms) && body.terms.length > 0
      ? body.terms
      : rotatedTerms(BASE_CATALOG_TERMS);

    const allItems: ScrapedItem[] = [];
    const sourceStatus: { store: string; status: string; term: string; error?: string }[] = [];
    const startedAt = Date.now();
    const terms: string[] = [];

    // Scrapear cada término con throttling para no saturar.
    // Se ingieren TODOS los productos encontrados por tienda (no solo el mejor
    // match) para que el catálogo persistido crezca a miles de productos.
    // Al acercarse al límite de tiempo se ingiere lo recolectado: el resto de
    // los términos queda para la siguiente corrida (rotación diaria).
    for (let i = 0; i < requestedTerms.length; i++) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      const term = requestedTerms[i];
      terms.push(term);
      try {
        const perStore = await Promise.all(REFRESH_STORES.map(store => searchAllRetailerProducts(
          store, term, { pages: store === 'Unimarc' || store === 'Tottus' ? 2 : 1 },
        )));
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
      if (i < requestedTerms.length - 1) {
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
      termsProcessed: terms.length,
      termsRequested: requestedTerms.length,
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
 * Requiere el mismo secreto de cron que el POST.
 */
export async function GET(req: NextRequest) {
  const denied = denyUnlessCron(req);
  if (denied) return denied;

  // Reenviar a POST con el catálogo base
  const fakeRequest = new NextRequest(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify({ terms: BASE_CATALOG_TERMS }),
  });
  
  return POST(fakeRequest);
}
