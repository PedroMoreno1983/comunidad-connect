import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('next/server', async importOriginal => ({
  ...await importOriginal<typeof import('next/server')>(),
  after: (callback: () => Promise<void>) => { void callback(); },
}));

const state = vi.hoisted(() => ({
  fresh: [] as Record<string, unknown>[], stale: [] as Record<string, unknown>[],
  filter: '', age: 0, liveFails: false,
  live: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/lib/server/agentIdentity', () => ({ getSupabaseUserClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'resident' } }, error: null }) },
}) }));
vi.mock('@/lib/supermarketCatalogLiveFill', () => ({ rememberLiveProducts: async () => undefined }));
vi.mock('@/lib/supermarketLive', () => ({ searchAllRetailerProducts: async () => {
  if (state.liveFails) throw new Error('Retailer timeout');
  return state.live;
} }));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => ({ from: () => {
  const query = {
    select: () => query, eq: () => query, gt: () => query, not: () => query,
    gte: (_column: string, date: string) => { state.age = Date.now() - Date.parse(date); return query; },
    or: (filter: string) => { state.filter = filter; return query; }, order: () => query,
    range: async (from: number, to: number) => ({
      data: (state.age > 5 * 86400000 ? state.stale : state.fresh).slice(from, to + 1), error: null,
    }),
  };
  return query;
} }) }));
import { POST } from '@/app/api/supermarket/catalog/resolve/route';

const product = (id: string, name: string) => ({
  id, name, store: 'Lider', sku: id, offer_id: `offer-${id}`, price: 1000,
});
const resolve = (list: string, store = 'Lider') => POST(new NextRequest('http://localhost/api/supermarket/catalog/resolve', {
  method: 'POST', body: JSON.stringify({ store, list }),
}));

describe('shopping list catalog resolution', () => {
  beforeEach(() => { state.fresh = []; state.stale = []; state.live = []; state.liveFails = false; });
  it('finds an exact variant beyond the former 350 candidate limit', async () => {
    state.fresh = Array.from({ length: 600 }, (_, i) => product(String(i), 'Leche Frutilla 200 ml'));
    state.fresh.push(product('exact', 'Leche Entera Soprole 1 L'));
    const response = await resolve('leche entera soprole 1 l');
    expect(response.status).toBe(200);
    expect((await response.json()).resolved[0].product.id).toBe('exact');
  });
  it('checks older exact matches when fresh candidates are unrelated', async () => {
    state.fresh = [product('wrong', 'Leche Frutilla 200 ml')];
    state.stale = [product('exact', 'Leche Entera Soprole 1 L')];
    const response = await resolve('leche entera soprole 1 l');
    expect((await response.json()).resolved[0].product.id).toBe('exact');
  });
  it('queries alternative catalog spellings', async () => {
    state.fresh = [product('yogurt', 'Yoghurt Natural Soprole 1 L')];
    await resolve('yogur');
    expect(state.filter).toContain('yoghurt');
  });
  it('prefers an older fresh pepper over a newer spice jar', async () => {
    state.fresh = [product('spice', 'Pimentón Paprika 100 g')];
    state.stale = [product('fresh', 'Pimentón rojo 1 un')];
    const response = await resolve('pimentón');
    expect((await response.json()).resolved[0].product.id).toBe('fresh');
  });
  it('reads the store when the saved catalog only has a weak match', async () => {
    state.fresh = [product('spice', 'Pimentón Paprika 100 g')];
    state.live = [{ name: 'Pimentón rojo 1 un', sku: 'fresh-live', offerId: 'offer-fresh', price: 1790, store: 'Lider' }];
    const response = await resolve('pimentón');
    expect((await response.json()).resolved[0].product.id).toBe('fresh-live');
  });
  it('preserves resolved lines when another live search fails', async () => {
    state.fresh = [product('milk', 'Leche Entera Soprole 1 L')];
    state.liveFails = true;
    const response = await resolve('leche entera soprole 1 l\nproducto inexistente');
    expect(response.status).toBe(200);
    const { resolved } = await response.json();
    expect(resolved[0].product.id).toBe('milk');
    expect(resolved[1].product).toBeUndefined();
  });
  it('keeps available products when a store without live search has a missing item', async () => {
    state.fresh = [product('milk', 'Leche Entera Soprole 1 L')];
    const response = await resolve('leche entera soprole 1 l\nproducto inexistente', 'aCuenta');
    expect(response.status).toBe(200);
    const { resolved } = await response.json();
    expect(resolved[0].product.id).toBe('milk');
    expect(resolved[1].product).toBeUndefined();
  });
});
