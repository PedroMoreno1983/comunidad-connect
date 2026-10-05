import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/observability/logger';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { SUPERMARKET_STORES } from '@/lib/supermarketBasket';
import { MAX_SHOPPING_LIST_CHARS, parseGroupShoppingList } from '@/lib/supermarketGroupDomain';
import { savedListKey, savedListTitle } from '@/lib/supermarketSavedLists';
import type { SavedShoppingList } from '@/lib/types';

export const runtime = 'nodejs';

const MAX_LISTS = 30;

async function currentUser() {
  const supabase = await getSupabaseUserClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : user };
}

function asList(row: Record<string, unknown>): SavedShoppingList {
  return {
    id: String(row.id),
    title: String(row.title),
    body: String(row.body),
    store: typeof row.store === 'string' ? row.store : null,
    updatedAt: String(row.updated_at),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { data, error } = await supabase
      .from('supermarket_saved_lists')
      .select('id,title,body,store,updated_at')
      .order('updated_at', { ascending: false })
      .limit(MAX_LISTS);
    if (error) throw error;
    return NextResponse.json({ lists: (data ?? []).map(row => asList(row as Record<string, unknown>)) });
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/lists', error, {
      publicMessage: 'No se pudieron leer tus listas.',
    });
  }
}

/** Crea o actualiza la lista que se está escribiendo. */
export async function PUT(req: NextRequest) {
  const limited = await enforceDistributedRateLimit(req, 'supermarket.lists.write', {
    limit: 40,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const text = typeof body?.body === 'string' ? body.body.trim().slice(0, MAX_SHOPPING_LIST_CHARS) : '';
    if (parseGroupShoppingList(text, true).length === 0) {
      return NextResponse.json({ error: 'La lista todavía no tiene productos.' }, { status: 400 });
    }
    const store = typeof body?.store === 'string' && SUPERMARKET_STORES.includes(body.store as typeof SUPERMARKET_STORES[number])
      ? body.store
      : null;
    const id = typeof body?.id === 'string' ? body.id : '';
    const patch = {
      title: savedListTitle(text),
      body: text,
      body_key: savedListKey(text),
      store,
      updated_at: new Date().toISOString(),
    };

    if (id) {
      const updated = await supabase
        .from('supermarket_saved_lists')
        .update(patch)
        .eq('id', id)
        .select('id,title,body,store,updated_at')
        .maybeSingle();
      if (updated.error) throw updated.error;
      if (updated.data) {
        await supabase.from('supermarket_saved_lists').delete().eq('body_key', patch.body_key).neq('id', updated.data.id);
        return NextResponse.json({ list: asList(updated.data as Record<string, unknown>) });
      }
    }

    const same = await supabase
      .from('supermarket_saved_lists')
      .select('id,title,body,store,updated_at')
      .eq('body_key', patch.body_key)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (same.error) throw same.error;
    if (same.data) {
      const refreshed = await supabase
        .from('supermarket_saved_lists')
        .update(patch)
        .eq('id', same.data.id)
        .select('id,title,body,store,updated_at')
        .maybeSingle();
      if (refreshed.error) throw refreshed.error;
      if (refreshed.data) return NextResponse.json({ list: asList(refreshed.data as Record<string, unknown>) });
    }

    const existing = await supabase.from('supermarket_saved_lists').select('id').order('updated_at', { ascending: true });
    if (existing.error) throw existing.error;
    const overflow = (existing.data ?? []).slice(0, Math.max(0, (existing.data ?? []).length - (MAX_LISTS - 1)));
    if (overflow.length > 0) {
      const removed = await supabase.from('supermarket_saved_lists').delete().in('id', overflow.map(row => row.id));
      if (removed.error) throw removed.error;
    }

    const inserted = await supabase
      .from('supermarket_saved_lists')
      .insert({ ...patch, user_id: user.id })
      .select('id,title,body,store,updated_at')
      .single();
    if (inserted.error) throw inserted.error;
    return NextResponse.json({ list: asList(inserted.data as Record<string, unknown>) });
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/lists', error, {
      publicMessage: 'No se pudo guardar la lista.',
    });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!id) return NextResponse.json({ error: 'Falta la lista.' }, { status: 400 });
    const { error } = await supabase.from('supermarket_saved_lists').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/lists', error, {
      publicMessage: 'No se pudo borrar la lista.',
    });
  }
}
