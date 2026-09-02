import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/observability/logger';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { prepareRemoteCartHandoff } from '@/lib/supermarketRemoteCart';
import type { SupermarketCartHandoffItem } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ITEMS = 200;
const STORES = new Set(['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus', 'aCuenta', 'Irurzun']);

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function parseItems(body: Record<string, unknown>): SupermarketCartHandoffItem[] {
  return (Array.isArray(body.items) ? body.items : []).slice(0, MAX_ITEMS).flatMap((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const name = cleanText(item.name, 240);
    if (!name) return [];
    return [{
      id: cleanText(item.id, 100) || `item-${index + 1}`,
      name,
      requestedTerm: cleanText(item.requestedTerm, 100) || name,
      quantity: Math.min(99, Math.max(1, Math.round(Number(item.quantity) || 1))),
      sku: cleanText(item.sku, 80) || undefined,
      offerId: cleanText(item.offerId, 160) || undefined,
      productUrl: cleanText(item.productUrl, 700) || undefined,
    }];
  });
}

export async function POST(req: NextRequest) {
  const limited = await enforceDistributedRateLimit(req, 'supermarket.cart_handoff', {
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { data: { session } } = await supabaseUser.auth.getSession();
    if (!session?.access_token) return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const store = cleanText(body.store, 40);
    if (!STORES.has(store)) return NextResponse.json({ error: 'Supermercado no compatible.' }, { status: 400 });
    const items = parseItems(body);
    if (items.length === 0) return NextResponse.json({ error: 'La lista llegó vacía.' }, { status: 400 });

    return NextResponse.json(await prepareRemoteCartHandoff(store, items, session.access_token));
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/cart-handoff', error, {
      publicMessage: 'No se pudo preparar el carro del supermercado.',
    });
  }
}
