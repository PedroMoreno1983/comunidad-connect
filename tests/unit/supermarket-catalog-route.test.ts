import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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

vi.mock('@/lib/security/rateLimit', () => ({ enforceDistributedRateLimit: async () => null }));
vi.mock('@/lib/server/agentIdentity', () => ({
  getSupabaseUserClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'resident' } }, error: null }) } }),
}));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        gt: () => query,
        gte: () => query,
        not: () => query,
        ilike: () => query,
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
});
