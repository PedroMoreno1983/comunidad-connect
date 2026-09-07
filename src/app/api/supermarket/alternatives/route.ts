import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/observability/logger';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { findLowerSealAlternatives, type BasketItemForAlternatives } from '@/lib/supermarketAlternatives';
import { SUPERMARKET_STORES } from '@/lib/supermarketBasket';
import { supportsSeals } from '@/lib/supermarketSeals';
import type { SupermarketMeasurementUnit } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_ITEMS = 60;
const STORES = new Set<string>(SUPERMARKET_STORES);
const UNITS = new Set<string>(['kg', 'g', 'l', 'ml']);

function parseItems(value: unknown): BasketItemForAlternatives[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): BasketItemForAlternatives[] => {
    if (entry === null || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const sku = typeof item.sku === 'string' || typeof item.sku === 'number'
      ? String(item.sku).trim().slice(0, 80)
      : '';
    const requestedTerm = typeof item.requestedTerm === 'string' ? item.requestedTerm.trim().slice(0, 120) : '';
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 300) : '';
    const price = Number(item.price);
    if (!sku || !requestedTerm || !name || !Number.isFinite(price) || price <= 0) return [];
    const unit = typeof item.requestedUnit === 'string' ? item.requestedUnit.trim() : '';
    return [{
      sku,
      requestedTerm,
      name,
      price,
      requestedUnit: UNITS.has(unit) ? unit as SupermarketMeasurementUnit : undefined,
    }];
  });
}

export async function POST(req: NextRequest) {
  const limited = await enforceDistributedRateLimit(req, 'supermarket.alternatives', {
    limit: 15,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const store = typeof body.store === 'string' ? body.store.trim() : '';
    if (!STORES.has(store)) return NextResponse.json({ error: 'Supermercado no compatible.' }, { status: 400 });

    // Sin sellos publicados no hay nada contra que comparar. Se responde 200 con
    // `supported: false` para que la pantalla lo diga en vez de mostrar un error.
    if (!supportsSeals(store)) return NextResponse.json({ supported: false, alternatives: [] });

    const items = parseItems(body.items);
    if (!Array.isArray(body.items) || items.length === 0 || items.length > MAX_ITEMS) {
      return NextResponse.json({ error: 'Envía hasta 60 productos con SKU, nombre y precio.' }, { status: 400 });
    }

    return NextResponse.json({
      supported: true,
      alternatives: await findLowerSealAlternatives(store, items),
    });
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/alternatives', error, {
      publicMessage: 'No se pudieron buscar alternativas con menos sellos.',
    });
  }
}
