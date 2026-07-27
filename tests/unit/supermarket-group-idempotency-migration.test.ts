import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('supermarket group create idempotency migration', () => {
  it('adds a nullable request id with a scoped unique index', () => {
    const sql = readFileSync(resolve(
      process.cwd(),
      'supabase/migrations/20260727011957_supermarket_group_create_idempotency.sql',
    ), 'utf8');

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS client_request_id UUID');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
    expect(sql).toContain('(created_by, client_request_id)');
    expect(sql).toContain('WHERE client_request_id IS NOT NULL');
    expect(sql).not.toMatch(/GRANT\s+ALL/i);
    expect(sql).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  });
});
