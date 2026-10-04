import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('next/server', async importOriginal => ({
  ...await importOriginal<typeof import('next/server')>(),
  after: (callback: () => Promise<void>) => { void callback(); },
}));

const liveItems = vi.hoisted(() => ({ current: [] as Array<Record<string, unknown>> }));

const rows = vi.hoisted(() => Array.from({ length: 30 }, (_, index) => ({
  id: `chocolate-${index}`,
  store: 'Lider',
  name: `Leche Frutilla ${index} 200 ml`,
  brand: 'Marca',
  sku: `007800000000${String(index).padStart(2, '0')}`,
  offer_id: `offer-${index}`,
  price: 1000,
  last_seen_at: new Date().toISOString(),
})).concat(Array.from({ length: 30 }, (_, index) => ({
  id: `milk-${index}`,
  store: 'Lider',
  name: `Leche Natural Entera ${index}`,
  brand: 'Marca',
  sku: `007800000001${String(index).padStart(2, '0')}`,
  offer_id: `milk-offer-${index}`,
  price: 1000,
  last_seen_at: new Date(Date.now() - 60_000).toISOString(),
}))));

vi.mock('@/lib/supermarketLive', () => ({
  searchAllRetailerProducts: async () => liveItems.current,
}));
vi.mock('@/lib/security/rateLimit', () => ({ enforceDistributedRateLimit: async () => null }));
vi.mock('@/lib/server/agentIdentity', () => ({
  getSupabaseUserClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'resident' } }, error: null }) } }),
}));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const query = {
        select: (columns?: string) => columns === 'id'
          ? Promise.resolve({ data: [{ id: 'saved' }], error: null })
          : query,
        update: () => query,
        eq: () => query,
        gt: () => query,
        gte: () => query,
        not: () => query,
        ilike: () => query,
        or: () => query,
        order: () => query,
        range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
      };
      return query;
    },
  }),
}));

import { GET } from '@/app/api/supermarket/catalog/route';

describe('supermarket catalog search', () => {
  it('ranks all matches before paging so ordinary milk is visible', async () => {
    const request = new NextRequest('http://localhost/api/supermarket/catalog?store=Lider&q=leche&page=0');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.products).toHaveLength(24);
    expect(body.products[0].name).toMatch(/^Leche Natural Entera/);
    expect(body.hasMore).toBe(true);
    const next = await GET(new NextRequest('http://localhost/api/supermarket/catalog?store=Lider&q=leche&page=1'));
    const nextBody = await next.json();
    expect(nextBody.products.length).toBeGreaterThan(0);
    const firstIds = new Set(body.products.map((product: { id: string }) => product.id));
    expect(nextBody.products.some((product: { id: string }) => firstIds.has(product.id))).toBe(false);
  });

  it('completa la búsqueda de brócoli con las fichas vigentes de Lider', async () => {
    liveItems.current = [
      { name: 'Brócoli, 1 Un', brand: '', quantity: 1, price: 1590, store: 'Lider', sku: 'sku-un', offerId: 'offer-un', query: 'brócoli' },
      { name: 'Brócoli Congelado, 350 g', brand: 'Lider', quantity: 1, price: 1490, store: 'Lider', sku: 'sku-frozen', offerId: 'offer-frozen', query: 'brócoli' },
      { name: 'Brotes de Brócoli Pote, 70 g', brand: '', quantity: 1, price: 1090, store: 'Lider', sku: 'sku-sprouts', offerId: 'offer-sprouts', query: 'brócoli' },
      { name: 'Repollo Crespo, 1 Un', brand: '', quantity: 1, price: 1750, store: 'Lider', sku: 'sku-cabbage', offerId: 'offer-cabbage', query: 'brócoli' },
    ];
    const response = await GET(new NextRequest('http://localhost/api/supermarket/catalog?store=Lider&q=Br%C3%B3coli&page=0'));
    expect(response.status).toBe(200);
    const body = await response.json();
    const names = body.products.map((product: { name: string }) => product.name);
    expect(names[0]).toBe('Brócoli, 1 Un');
    expect(names).toEqual(expect.arrayContaining([
      'Brócoli, 1 Un',
      'Brócoli Congelado, 350 g',
      'Brotes de Brócoli Pote, 70 g',
    ]));
    expect(names).not.toContain('Repollo Crespo, 1 Un');
    liveItems.current = [];
  });
});
