import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('resident supermarket navigation', () => {
  it('stays visible even when the optional cart worker is disabled', () => {
    const sidebar = readFileSync(path.join(process.cwd(), 'src/components/cc/Sidebar.tsx'), 'utf8');
    const navigation = sidebar.match(/\{ href: "\/resident\/supermercado"[^}]*\}/)?.[0];

    expect(navigation).toContain('roles: ["resident"]');
    expect(navigation).not.toContain('capability:');
  });
});
