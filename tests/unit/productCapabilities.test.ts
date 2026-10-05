import { describe, expect, it } from 'vitest';
import { resolveProductCapabilities } from '../../src/lib/productCapabilities';

describe('resolveProductCapabilities', () => {
  it('exposes the operational IoT capability while hiding deferred commercial surfaces', () => {
    expect(resolveProductCapabilities({})).toEqual({
      onlinePayments: false,
      paymentProvider: null,
      marketingReels: false,
      iotAutomation: true,
      externalMonitoring: false,
      supermarketOrdering: false,
    });
  });

  it('enables online payments with Haulmer or Transbank credentials', () => {
    expect(resolveProductCapabilities({ HAULMER_ACCOUNT_ID: 'account' }).onlinePayments).toBe(false);
    expect(resolveProductCapabilities({
      HAULMER_ACCOUNT_ID: 'account',
      HAULMER_SECRET_KEY: 'secret',
    }).onlinePayments).toBe(true);
    expect(resolveProductCapabilities({
      TRANSBANK_COMMERCE_CODE: '597055555532',
      TRANSBANK_API_KEY: 'secret',
    }).paymentProvider).toBe('transbank');
    expect(resolveProductCapabilities({
      HAULMER_ACCOUNT_ID: 'account',
      HAULMER_SECRET_KEY: 'secret',
      TRANSBANK_COMMERCE_CODE: '597055555532',
      TRANSBANK_API_KEY: 'secret',
      PAYMENT_PROVIDER: 'transbank',
    }).paymentProvider).toBe('transbank');
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

  it('keeps supermarket ordering off without an explicit enablement signal', () => {
    expect(resolveProductCapabilities({}).supermarketOrdering).toBe(false);
    expect(resolveProductCapabilities({ SUPERMARKET_COMMERCE_ENABLED: 'false' }).supermarketOrdering).toBe(false);
  });

  it('enables supermarket ordering with SUPERMARKET_COMMERCE_ENABLED or a cart worker URL', () => {
    expect(resolveProductCapabilities({ SUPERMARKET_COMMERCE_ENABLED: 'true' }).supermarketOrdering).toBe(true);
    expect(resolveProductCapabilities({
      SUPERMARKET_CART_WORKER_URL: 'https://cart-worker.example.com',
    }).supermarketOrdering).toBe(true);
  });
});
