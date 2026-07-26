import { describe, expect, it } from 'vitest';
import { searchAllRetailerProducts } from '@/lib/supermarketLive';

const liveDescribe = process.env.RUN_SUPERMARKET_LIVE === '1' ? describe : describe.skip;

liveDescribe('public supermarket sources', () => {
  it('reads two current Unimarc result pages', async () => {
    const items = await searchAllRetailerProducts('Unimarc', 'arroz', { pages: 2 });

    expect(items.length).toBeGreaterThanOrEqual(80);
    expect(items.every(item => item.store === 'Unimarc' && item.price > 0)).toBe(true);
  }, 30_000);

  it('reads two current Tottus result pages', async () => {
    const items = await searchAllRetailerProducts('Tottus', 'arroz', { pages: 2 });

    expect(items.length).toBeGreaterThanOrEqual(80);
    expect(items.every(item => item.store === 'Tottus' && item.price > 0)).toBe(true);
  }, 30_000);
});
