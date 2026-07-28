import { randomInt } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';

export const runtime = 'nodejs';

const MAX_ITEMS = 200;
const PLAN_TTL_MINUTES = 30;
const SUPPORTED_STORES = new Set([
  'Lider', 'Jumbo', 'Santa Isabel', 'Unimarc', 'Tottus', 'aCuenta', 'Irurzun',
]);

// Sin I/O/0/1: el código se dicta y se teclea a mano, y esos caracteres se
// confunden entre sí. 30 símbolos ^ 10 posiciones sigue siendo inadivinable
// dentro de la ventana de 30 minutos.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;

function generateCode() {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

export async function POST(req: NextRequest) {
  const limited = await enforceDistributedRateLimit(req, 'supermarket.cart_plan.create', {
    limit: 20,
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
    if (!SUPPORTED_STORES.has(store)) {
      return NextResponse.json({ error: 'Supermercado no compatible.' }, { status: 400 });
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = rawItems.slice(0, MAX_ITEMS).map((entry, index) => {
      const item = entry as Record<string, unknown>;
      return {
        id: cleanText(item.id, 100) || `item-${index + 1}`,
        name: cleanText(item.name, 240),
        quantity: Math.min(99, Math.max(1, Math.round(Number(item.quantity) || 1))),
        productUrl: cleanText(item.productUrl, 600) || undefined,
      };
    }).filter(item => item.name);

    if (items.length === 0) {
      return NextResponse.json({ error: 'La lista llegó vacía.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from('profiles')
      .select('community_id')
      .eq('id', user.id)
      .maybeSingle();

    const code = generateCode();
    const expiresAt = new Date(Date.now() + PLAN_TTL_MINUTES * 60_000).toISOString();

    const { error: insertError } = await admin
      .from('supermarket_cart_plans')
      .insert({
        code,
        user_id: user.id,
        community_id: profile?.community_id ?? null,
        store,
        items,
        item_count: items.length,
        expires_at: expiresAt,
      });
    if (insertError) throw insertError;

    void admin.rpc('purge_expired_supermarket_cart_plans').then(
      () => undefined,
      () => undefined,
    );

    return NextResponse.json({
      code,
      store,
      itemCount: items.length,
      expiresAt,
      expiresInMinutes: PLAN_TTL_MINUTES,
    });
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/cart-plan', error, {
      publicMessage: 'No se pudo preparar la carga del carro.',
    });
  }
}
