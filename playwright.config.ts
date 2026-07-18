import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    expect: { timeout: 10_000 },
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
    use: {
        // Defaults to the local dev server on purpose -- these tests include a
        // POST to /api/auth/signup, and defaulting to production meant anyone
        // running `npm run test:e2e:security` without thinking about it would
        // mutate real production data. Point E2E_BASE_URL at a real
        // staging/production URL explicitly when that's actually intended.
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
        extraHTTPHeaders: { 'Cache-Control': 'no-cache' },
        trace: 'retain-on-failure',
    },
});
