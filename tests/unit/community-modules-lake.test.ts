/**
 * 19-11-2026: Bahía Las Palmas es un condominio de casas junto al lago Rapel.
 * Apaga estacionamientos/bodegas y control hídrico, y enciende "Vida junto al
 * lago" (embarcaciones y avisos de temporada).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => { throw new Error('sin base en tests'); } }));

import {
    COMMUNITY_MODULES, LAKE_SEASON_NOTICES, disabledModuleForPath, disabledModulesOf, extraModulesOf, toolsBlockedByModules,
} from '@/lib/community/modules';
import { validateBoatInput } from '@/lib/community/boats';
import { TOOL_DEFINITIONS } from '@/lib/coco/tools';

describe('módulos que la comunidad apaga', () => {
    it('ignora valores desconocidos', () => {
        expect(disabledModulesOf(['parking', 'water', 'otra', 3])).toEqual(['parking', 'water']);
        expect(disabledModulesOf(null)).toEqual([]);
        expect(extraModulesOf(['lake', 'x'])).toEqual(['lake']);
    });

    it('bloquea las pantallas del módulo apagado y no otras', () => {
        expect(disabledModuleForPath('/estacionamientos', ['parking'])).toBe('parking');
        expect(disabledModuleForPath('/estacionamientos?tab=admin', ['parking'])).toBe('parking');
        expect(disabledModuleForPath('/admin/consumo', ['water'])).toBe('water');
        expect(disabledModuleForPath('/amenities', ['parking', 'water'])).toBeNull();
        expect(disabledModuleForPath('/estacionamientos', [])).toBeNull();
    });

    it('CoCo deja de ofrecer las herramientas de estacionamientos, bodegas y agua', () => {
        const blocked = toolsBlockedByModules(['parking', 'water']);
        for (const name of ['book_parking', 'rent_storage', 'get_water_consumption', 'record_water_reading']) expect(blocked.has(name)).toBe(true);
        expect(blocked.has('create_reservation')).toBe(false);
    });

    it('cada herramienta de un módulo existe en CoCo', () => {
        const names = new Set(TOOL_DEFINITIONS.map(tool => tool.name));
        for (const entry of Object.values(COMMUNITY_MODULES)) for (const tool of entry.tools) expect(names.has(tool)).toBe(true);
    });

    it('la migración deja a Bahía con parking y water apagados, lake encendido y sus espacios', () => {
        const sql = readFileSync('supabase/migrations/20261119000000_community_disabled_modules.sql', 'utf8');
        expect(sql).toContain("SET disabled_modules = ARRAY['parking', 'water']");
        expect(sql).toContain("SET extra_modules = ARRAY['lake']");
        for (const name of ['Muelle', 'Rampa de botes y playa', 'Quincho', 'Sede social', 'Cancha de tenis', 'Cancha de futbolito']) expect(sql).toContain(`'${name}'`);
        expect(sql).toContain('GRANT SELECT (disabled_modules)');
        expect(sql).toContain('GRANT SELECT (extra_modules)');
    });
});

describe('embarcaciones', () => {
    it('valida tipo, largo y normaliza la matrícula', () => {
        expect(validateBoatInput({ kind: 'lancha', registration: ' valp-12 ', lengthM: 5.5 })).toMatchObject({ kind: 'lancha', registration: 'VALP-12', length_m: 5.5 });
        expect(() => validateBoatInput({ kind: 'submarino' as 'otro' })).toThrow('tipo');
        expect(() => validateBoatInput({ kind: 'kayak', lengthM: 200 })).toThrow('metros');
    });

    it('la tabla es privada: cada uno ve las suyas, la administración todas', () => {
        const sql = readFileSync('supabase/migrations/20261119000000_community_disabled_modules.sql', 'utf8');
        expect(sql).toContain("owner_id = auth.uid() OR (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin')");
        expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.community_boats FROM anon, authenticated');
    });

    it('hay plantillas de temporada para CoCo', () => {
        expect(LAKE_SEASON_NOTICES.length).toBeGreaterThanOrEqual(4);
        expect(LAKE_SEASON_NOTICES.join(' ')).toMatch(/lago/);
    });
});
