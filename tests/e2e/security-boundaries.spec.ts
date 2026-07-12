import { expect, test } from '@playwright/test';

test('production health and enforced headers are ready', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.status()).toBe(200);
    const payload = await health.json();
    expect(payload.ok).toBe(true);
    expect(health.headers()['cache-control']).toContain('no-store');

    const login = await request.get('/login');
    expect(login.status()).toBe(200);
    expect(login.headers()['strict-transport-security']).toContain('max-age=63072000');
    expect(login.headers()['x-content-type-options']).toBe('nosniff');
    expect(login.headers()['x-frame-options']).toBe('DENY');
    expect(login.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(login.headers()['content-security-policy-report-only']).toBeUndefined();
});

test('protected pages redirect anonymous users to login', async ({ request }) => {
    for (const path of ['/admin', '/resident/finances', '/concierge', '/superadmin']) {
        const response = await request.get(path, { maxRedirects: 0 });
        expect([302, 307, 308]).toContain(response.status());
        expect(response.headers().location).toContain('/login');
    }
});

test('sensitive API boundaries reject anonymous calls', async ({ request }) => {
    const cases: Array<{ path: string; method: 'get' | 'post'; expected: number }> = [
        { path: '/api/email/booking-confirmation', method: 'post', expected: 401 },
        { path: '/api/email/welcome', method: 'post', expected: 401 },
        { path: '/api/email/expense-alert', method: 'post', expected: 403 },
        { path: '/api/training/multi-agent', method: 'post', expected: 401 },
        { path: '/api/search?q=seguridad', method: 'get', expected: 401 },
        { path: '/api/email/new-community', method: 'post', expected: 410 },
    ];

    for (const item of cases) {
        const response = item.method === 'post'
            ? await request.post(item.path, { data: {} })
            : await request.get(item.path);
        expect(response.status(), item.path).toBe(item.expected);
    }
});

test('signup rejects incomplete and forged invitations', async ({ request }) => {
    const incomplete = await request.post('/api/auth/signup', { data: {} });
    expect(incomplete.status()).toBe(400);

    const forged = await request.post('/api/auth/signup', {
        data: {
            fullName: 'Security Boundary QA',
            email: `forged-${Date.now()}@qa.convive.local`,
            password: 'Boundary-QA-2026!',
            accessCode: 'FORGED-CODE-2026',
            role: 'admin',
        },
    });
    expect(forged.status()).toBe(403);
});
