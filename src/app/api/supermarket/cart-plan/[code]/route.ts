import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';

export const runtime = 'nodejs';

// El cargador corre dentro del sitio del supermercado, así que este endpoint
// debe aceptar peticiones cross-origin -- pero solo desde esos dominios, nunca
// con '*' y nunca con credenciales (el código del plan es la única
// autorización necesaria; no viajan cookies de sesión).
const ALLOWED_ORIGINS = new Set([
  'https://super.lider.cl', 'https://www.lider.cl', 'https://lider.cl',
  'https://www.jumbo.cl', 'https://jumbo.cl',
  'https://www.santaisabel.cl', 'https://santaisabel.cl',
  'https://www.unimarc.cl', 'https://unimarc.cl',
  'https://www.tottus.cl', 'https://tottus.cl',
  'https://www.acuenta.cl', 'https://acuenta.cl',
  'https://irurzun.cl', 'https://www.irurzun.cl',
]);

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
  }
  return headers;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

export async function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  // Sin este límite, el código corto sería fuerza-bruteable dentro de su
  // ventana de vida.
  const limited = await enforceDistributedRateLimit(req, 'supermarket.cart_plan.fetch', {
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const { code: rawCode } = await context.params;
    const code = String(rawCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
      return NextResponse.json({ error: 'Código inválido.' }, { status: 400, headers });
    }

    const admin = getSupabaseAdmin();
    const { data: plan, error } = await admin
      .from('supermarket_cart_plans')
      .select('id, store, items, expires_at, fetch_count, max_fetches')
      .eq('code', code)
      .maybeSingle();
    if (error) throw error;

    // Mismo mensaje para "no existe", "vencido" y "agotado": distinguirlos le
    // diría a quien prueba códigos al azar cuáles existen.
    const notFound = NextResponse.json(
      { error: 'Ese código no existe, ya se usó o expiró.' },
      { status: 404, headers },
    );
    if (!plan) return notFound;
    if (new Date(plan.expires_at).getTime() < Date.now()) return notFound;
    if (plan.fetch_count >= plan.max_fetches) return notFound;

    await admin
      .from('supermarket_cart_plans')
      .update({ fetch_count: plan.fetch_count + 1 })
      .eq('id', plan.id);

    return NextResponse.json({ store: plan.store, items: plan.items }, { headers });
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/cart-plan/[code]', error, {
      publicMessage: 'No se pudo recuperar la lista.',
    });
  }
}
