import { describe, expect, it } from 'vitest';
import { resolveProductCapabilities } from '../../src/lib/productCapabilities';

describe('resolveProductCapabilities', () => {
  it('hides every deferred commercial surface by default', () => {
    expect(resolveProductCapabilities({})).toEqual({
      onlinePayments: false,
      marketingReels: false,
      iotAutomation: false,
      externalMonitoring: false,
      supermarketOrdering: false,
    });
  });

  it('enables online payments only with both Haulmer credentials', () => {
    expect(resolveProductCapabilities({ HAULMER_ACCOUNT_ID: 'account' }).onlinePayments).toBe(false);
    expect(resolveProductCapabilities({
      HAULMER_ACCOUNT_ID: 'account',
      HAULMER_SECRET_KEY: 'secret',
    }).onlinePayments).toBe(true);
  });

  it('requires a complete professional reel pipeline', () => {
    const partial = resolveProductCapabilities({
      ANTHROPIC_API_KEY: 'anthropic',
      HEYGEN_API_KEY: 'heygen',
    });
    expect(partial.marketingReels).toBe(false);

    const complete = resolveProductCapabilities({
      ANTHROPIC_API_KEY: 'anthropic',
      HEYGEN_API_KEY: 'heygen',
      META_APP_ID: 'meta-app',
      META_APP_SECRET: 'meta-secret',
      CRON_SECRET: 'cron',
    });
    expect(complete.marketingReels).toBe(true);
  });

  it('never exposes the simulated supermarket ordering flow', () => {
    expect(resolveProductCapabilities({ SUPERMARKET_COMMERCE_ENABLED: 'true' }).supermarketOrdering).toBe(false);
  });
});
