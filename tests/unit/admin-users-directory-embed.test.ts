/**
 * 18-11-2026: la pantalla de Usuarios salía vacía ("0 usuarios", sin códigos de
 * invitación) en todas las comunidades. profiles y units se unen por dos
 * claves (owner_id y resident_profile_id) y el embed sin nombrar la relación
 * hacía que PostgREST respondiera PGRST201.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Usuarios: embed de unidades desde profiles', () => {
    it('nombra la relación con units en vez de un embed ambiguo', () => {
        const source = readFileSync('src/lib/api/users.ts', 'utf8');
        const profileSelects = source.match(/from\(["']profiles["']\)\s*\.select\(\s*["'`][^"'`]*["'`]/g) ?? [];
        for (const select of profileSelects) {
            expect(select).not.toMatch(/[\s,(]units\s*\(/);
        }
        expect(source).toContain('units!units_resident_profile_id_fkey');
    });
});
