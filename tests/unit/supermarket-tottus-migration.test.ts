import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Tottus supermarket migration', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260726030000_supermarket_add_tottus.sql'),
    'utf8',
  );

  it('allows Tottus in product and group-order constraints', () => {
    expect(sql).toContain(
      "CHECK (store IN ('Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus', 'aCuenta', 'Irurzun'))",
    );
    expect(sql).toMatch(/selected_store[\s\S]+?'Tottus'/);
  });

  it('keeps Tottus in the ingestion allowlist', () => {
    expect(sql).toContain(
      "v_store NOT IN ('Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus', 'aCuenta', 'Irurzun')",
    );
  });
});
