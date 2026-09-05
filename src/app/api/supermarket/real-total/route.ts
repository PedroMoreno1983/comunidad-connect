import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/observability/logger';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { SUPERMARKET_STORES } from '@/lib/supermarketBasket';
import { simulateBasketTotal, supportsSimulation, type SimulationItem } from '@/lib/supermarketSimulation';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_ITEMS = 60;
const STORES = new Set<string>(SUPERMARKET_STORES);

function parseItems(value: unknown): SimulationItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    if (entry === null || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const sku = typeof item.sku === 'string' || typeof item.sku === 'number'
      ? String(item.sku).trim().slice(0, 80)
      : '';
    const quantity = Math.round(Number(item.quantity));
    if (!sku || !Number.isFinite(quantity) || quantity <= 0) return [];
    return [{ sku, quantity: Math.min(99, quantity) }];
  }).slice(0, MAX_ITEMS);
}

export async function POST(req: NextRequest) {
  const limited = await enforceDistributedRateLimit(req, 'supermarket.real_total', {
    limit: 30,
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

    // Lider y aCuenta no exponen una simulacion equivalente. Se responde 200 con
    // supported:false para que la pantalla lo diga en vez de mostrar un error.
    if (!supportsSimulation(store)) return NextResponse.json({ supported: false });

    const items = parseItems(body.items);
    if (items.length === 0) return NextResponse.json({ supported: false });

    return NextResponse.json(await simulateBasketTotal(store, items));
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/real-total', error, {
      publicMessage: 'No se pudo consultar el total real en la tienda.',
    });
  }
}
