import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/observability/logger';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { suggestRepurchases, type PurchaseRecord } from '@/lib/supermarketRecurrence';

export const runtime = 'nodejs';

const MAX_TERMS = 200;
/**
 * Con noventa dias sobran para estimar cualquier ritmo domestico, y guardar
 * menos historia del necesario es la forma barata de respetar a la gente.
 */
const LOOKBACK_DAYS = 90;

/**
 * Se usa el cliente del usuario, no el admin: asi las politicas RLS de la tabla
 * quedan de red de seguridad y ningun error de este archivo puede exponer el
 * supermercado de un vecino a otro.
 */
async function currentUser() {
  const supabase = await getSupabaseUserClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : user };
}

function cleanTerm(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120)
    : '';
}

async function historyEnabled(
  supabase: Awaited<ReturnType<typeof getSupabaseUserClient>>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('supermarket_history_enabled')
    .eq('id', userId)
    .maybeSingle();
  return data?.supermarket_history_enabled === true;
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const enabled = await historyEnabled(supabase, user.id);
    if (!enabled) return NextResponse.json({ enabled: false, suggestions: [] });

    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('supermarket_purchase_history')
      .select('term,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2_000);

    const records: PurchaseRecord[] = (data ?? []).map(row => ({
      term: String(row.term ?? ''),
      createdAt: String(row.created_at ?? ''),
    }));

    return NextResponse.json({ enabled: true, suggestions: suggestRepurchases(records) });
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/history', error, {
      publicMessage: 'No se pudo leer tu historial de compras.',
    });
  }
}

/** Registra los productos de una comparacion. Silencioso si no hay opt-in. */
export async function POST(req: NextRequest) {
  const limited = await enforceDistributedRateLimit(req, 'supermarket.history.write', {
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (!await historyEnabled(supabase, user.id)) {
      return NextResponse.json({ recorded: 0, enabled: false });
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const store = typeof body.store === 'string' ? body.store.trim().slice(0, 40) : null;
    const rows = (Array.isArray(body.terms) ? body.terms : [])
      .flatMap(entry => {
        if (entry === null || typeof entry !== 'object') return [];
        const item = entry as Record<string, unknown>;
        const term = cleanTerm(item.term);
        if (!term) return [];
        const quantity = Number(item.quantity);
        const unit = typeof item.unit === 'string' ? item.unit.trim().slice(0, 16) : null;
        return [{
          user_id: user.id,
          term,
          quantity: Number.isFinite(quantity) && quantity > 0 ? Math.min(9_999, quantity) : 1,
          unit: unit || null,
          store,
        }];
      })
      .slice(0, MAX_TERMS);

    if (rows.length === 0) return NextResponse.json({ recorded: 0, enabled: true });

    const { error } = await supabase.from('supermarket_purchase_history').insert(rows);
    if (error) throw error;
    return NextResponse.json({ recorded: rows.length, enabled: true });
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/history', error, {
      publicMessage: 'No se pudo guardar tu compra en el historial.',
    });
  }
}

/** Enciende o apaga la memoria. Apagarla borra lo guardado. */
export async function PATCH(req: NextRequest) {
  const limited = await enforceDistributedRateLimit(req, 'supermarket.history.toggle', {
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const enabled = body.enabled === true;

    const { error } = await supabase
      .from('profiles')
      .update({ supermarket_history_enabled: enabled })
      .eq('id', user.id);
    if (error) throw error;

    // Apagar y conservar lo guardado seria quedarse con el dato despues de que
    // la persona dijo que no. Se borra.
    if (!enabled) {
      await supabase.from('supermarket_purchase_history').delete().eq('user_id', user.id);
    }

    return NextResponse.json({ enabled });
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/history', error, {
      publicMessage: 'No se pudo cambiar la preferencia de historial.',
    });
  }
}

/** Borra el historial sin apagar la funcion. */
export async function DELETE(req: NextRequest) {
  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { error } = await supabase
      .from('supermarket_purchase_history')
      .delete()
      .eq('user_id', user.id);
    if (error) throw error;

    return NextResponse.json({ cleared: true });
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/history', error, {
      publicMessage: 'No se pudo borrar tu historial de compras.',
    });
  }
}
