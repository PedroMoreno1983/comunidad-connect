import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('supermarket batch search migration', () => {
  it('uses the indexed search path and limits execution to service_role', () => {
    const sql = readFileSync(resolve(
      process.cwd(),
      'supabase/migrations/20260727001329_supermarket_batch_checkout_plan.sql',
    ), 'utf8');

    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain("to_tsvector('spanish', product.name)");
    expect(sql).toContain("plainto_tsquery('spanish', query.anchor)");
    expect(sql).toContain('LIMIT 200');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.search_supermarket_products_batch');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.search_supermarket_products_batch');
    expect(sql).toContain('TO service_role');
  });
});
