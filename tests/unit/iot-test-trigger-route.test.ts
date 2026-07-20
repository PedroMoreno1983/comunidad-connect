import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    user: { id: 'user-a' } as { id: string } | null,
    profile: { role: 'admin', community_id: 'tenant-a' } as { role: string; community_id: string | null } | null,
    community: { iot_webhook_secret: 'tenant-secret-a', iot_autonomous_actions_enabled: true } as { iot_webhook_secret: string | null; iot_autonomous_actions_enabled: boolean } | null,
    communityError: null as Error | null,
}));

vi.mock('next/headers', () => ({
    cookies: async () => ({ getAll: () => [] }),
}));

vi.mock('@supabase/ssr', () => ({
    createServerClient: () => ({
        auth: { getUser: async () => ({ data: { user: mocks.user } }) },
        from: () => ({
            select: () => ({
                eq: () => ({
                    single: async () => ({ data: mocks.profile }),
                }),
            }),
        }),
    }),
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: mocks.community, error: mocks.communityError }),
                }),
            }),
        }),
    }),
}));

import { POST } from '@/app/api/iot/test-trigger/route';

function request(payload: unknown) {
    return new NextRequest('http://localhost/api/iot/test-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

describe('POST /api/iot/test-trigger', () => {
    beforeEach(() => {
        mocks.user = { id: 'user-a' };
        mocks.profile = { role: 'admin', community_id: 'tenant-a' };
        mocks.community = { iot_webhook_secret: 'tenant-secret-a', iot_autonomous_actions_enabled: true };
        mocks.communityError = null;
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const forwarded = JSON.parse(String(init?.body)) as Record<string, unknown>;
            return new Response(JSON.stringify({ forwarded }), { status: 200 });
        }));
    });

    it('rejects unauthenticated callers', async () => {
        mocks.user = null;
        const response = await POST(request({ community_id: 'tenant-b' }));
        expect(response.status).toBe(401);
    });

    it('rejects non-admin callers', async () => {
        mocks.profile = { role: 'resident', community_id: 'tenant-a' };
        const response = await POST(request({ community_id: 'tenant-b' }));
        expect(response.status).toBe(403);
    });

    it('overwrites a cross-tenant community and signs with the tenant secret', async () => {
        const response = await POST(request({ sensor_id: 'sensor-1', community_id: 'tenant-b' }));
        const data = await response.json() as { forwarded: Record<string, unknown> };
        expect(response.status).toBe(200);
        expect(data.forwarded.community_id).toBe('tenant-a');
        expect(fetch).toHaveBeenCalledWith(
            'http://localhost/api/webhooks/iot',
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: 'Bearer tenant-secret-a' }),
            }),
        );
    });

    it('fails closed when the tenant has no IoT secret', async () => {
        mocks.community = { iot_webhook_secret: null, iot_autonomous_actions_enabled: true };
        const response = await POST(request({ sensor_id: 'sensor-1' }));
        expect(response.status).toBe(503);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not trigger autonomous actions without explicit community opt-in', async () => {
        mocks.community = { iot_webhook_secret: 'tenant-secret-a', iot_autonomous_actions_enabled: false };
        const response = await POST(request({ sensor_id: 'sensor-1' }));
        expect(response.status).toBe(409);
        expect(fetch).not.toHaveBeenCalled();
    });
});
