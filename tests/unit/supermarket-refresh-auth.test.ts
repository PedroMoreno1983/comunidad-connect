import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    scrapeCalls: 0,
    adminCalls: 0,
}));

vi.mock('@/lib/supermarketLive', () => ({
    searchAllRetailerProducts: async () => {
        mocks.scrapeCalls += 1;
        return [];
    },
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => {
        mocks.adminCalls += 1;
        return {
            from: () => ({
                upsert: async () => ({ error: null }),
                delete: () => ({ lt: async () => ({ error: null }) }),
            }),
        };
    },
}));

import { GET, POST } from '@/app/api/supermarket/refresh/route';

const SECRET = 'cron-secret-de-prueba';

function request(headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost/api/supermarket/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ terms: ['leche'] }),
    });
}

describe('/api/supermarket/refresh authorization', () => {
    beforeEach(() => {
        mocks.scrapeCalls = 0;
        mocks.adminCalls = 0;
        process.env.CRON_SECRET = SECRET;
    });

    afterEach(() => {
        delete process.env.CRON_SECRET;
    });

    it('rejects the request when CRON_SECRET is not configured instead of running open', async () => {
        delete process.env.CRON_SECRET;

        const response = await POST(request({ 'x-cron-secret': 'lo-que-sea' }));

        expect(response.status).toBe(503);
        expect(mocks.scrapeCalls).toBe(0);
        expect(mocks.adminCalls).toBe(0);
    });

    it('rejects a request without any credential', async () => {
        const response = await POST(request());

        expect(response.status).toBe(401);
        expect(mocks.scrapeCalls).toBe(0);
    });

    it('rejects a wrong secret on both accepted headers', async () => {
        expect((await POST(request({ 'x-cron-secret': 'incorrecto' }))).status).toBe(401);
        expect((await POST(request({ authorization: 'Bearer incorrecto' }))).status).toBe(401);
        expect(mocks.scrapeCalls).toBe(0);
    });

    it('accepts the Authorization: Bearer header that Vercel Cron sends', async () => {
        const response = await POST(request({ authorization: `Bearer ${SECRET}` }));

        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(503);
        expect(mocks.scrapeCalls).toBeGreaterThan(0);
    });

    it('accepts the x-cron-secret header used for manual runs', async () => {
        const response = await POST(request({ 'x-cron-secret': SECRET }));

        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(503);
        expect(mocks.scrapeCalls).toBeGreaterThan(0);
    });

    it('applies the same rule to GET', async () => {
        const unauthorized = new NextRequest('http://localhost/api/supermarket/refresh');

        expect((await GET(unauthorized)).status).toBe(401);
        expect(mocks.scrapeCalls).toBe(0);
    });
});
