import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  enabled: true,
  authenticated: true,
  insert: vi.fn(),
  rpc: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/lib/security/rateLimit', () => ({ enforceDistributedRateLimit: async () => null }));
vi.mock('@/lib/observability/logger', () => ({ apiErrorResponse: () => NextResponse.json({ error: 'Failed' }, { status: 500 }) }));
vi.mock('@/lib/server/agentIdentity', () => ({
  getSupabaseUserClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.authenticated ? { id: 'owner' } : null }, error: null }) },
    rpc: mocks.rpc,
    from: () => ({
      insert: mocks.insert,
      select: () => ({ eq: mocks.eq }),
    }),
  }),
}));

import { GET, POST, PATCH } from '@/app/api/supermarket/history/route';

function request(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/supermarket/history', {
    method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}

describe('confirmed purchase history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.authenticated = true;
    mocks.insert.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.eq.mockImplementation(() => ({
      maybeSingle: async () => ({ data: { supermarket_history_enabled: mocks.enabled }, error: null }),
      gte: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
    }));
  });

  it('rejects comparison writes without confirmation', async () => {
    const response = await POST(request('POST', { terms: [{ term: 'leche' }] }));
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('records an explicitly confirmed purchase for the authenticated owner', async () => {
    const response = await POST(request('POST', { confirmed: true, user_id: 'neighbor', terms: [{ term: 'Leche' }] }));
    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith([expect.objectContaining({ user_id: 'owner', term: 'leche', confirmed: true })]);
  });

  it('excludes legacy comparisons from suggestions', async () => {
    expect((await GET(request('GET'))).status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith('confirmed', true);
  });

  it('does not record without consent', async () => {
    mocks.enabled = false;
    expect(await (await POST(request('POST', { confirmed: true, terms: [{ term: 'leche' }] }))).json()).toMatchObject({ recorded: 0 });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('does not announce deletion when the atomic operation fails', async () => {
    mocks.rpc.mockResolvedValue({ error: new Error('delete failed') });
    expect((await PATCH(request('PATCH', { enabled: false }))).status).toBe(500);
    expect(mocks.rpc).toHaveBeenCalledWith('set_supermarket_history_enabled', { p_enabled: false });
  });

  it('requires authentication before changing preferences', async () => {
    mocks.authenticated = false;
    expect((await PATCH(request('PATCH', { enabled: false }))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
