import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/observability/logger';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { SUPERMARKET_STORES } from '@/lib/supermarketBasket';
import { fetchSealsBySku, supportsSeals } from '@/lib/supermarketSeals';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_SKUS = 60;
const STORES = new Set<string>(SUPERMARKET_STORES);

function parseSkus(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map(entry => (typeof entry === 'string' || typeof entry === 'number' ? String(entry).trim() : ''))
      .filter(entry => entry.length > 0 && entry.length <= 80),
  )].slice(0, MAX_SKUS);
}

export async function POST(req: NextRequest) {
  const limited = await enforceDistributedRateLimit(req, 'supermarket.seals', {
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

    // Lider y aCuenta no publican los sellos en sus fuentes actuales. Se responde
    // 200 con la lista vacia y `supported: false` para que la pantalla pueda
    // decir "esta cadena no los informa" en vez de mostrar un error.
    if (!supportsSeals(store)) return NextResponse.json({ supported: false, seals: {} });

    const skus = parseSkus(body.skus);
    if (skus.length === 0) return NextResponse.json({ supported: true, seals: {} });

    return NextResponse.json({ supported: true, seals: await fetchSealsBySku(store, skus) });
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/seals', error, {
      publicMessage: 'No se pudieron consultar los sellos nutricionales.',
    });
  }
}
