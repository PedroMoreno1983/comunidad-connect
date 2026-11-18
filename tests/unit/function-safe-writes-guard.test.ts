/**
 * El guard de funciones detecta un DELETE o UPDATE sin WHERE: Supabase lo
 * rechaza solo al ejecutarlo, y dos veces llegó así a producción.
 */

import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { unsafeWrites } = require('../../scripts/function-safe-writes-guard.js') as { unsafeWrites: (body: string) => string[] };

describe('sentencias sin WHERE', () => {
    it('detecta el caso de save_unit_rights y el del supermercado', () => {
        expect(unsafeWrites('BEGIN DELETE FROM pg_temp._unit_rights_input; END')).toHaveLength(1);
        expect(unsafeWrites('BEGIN DELETE FROM public.supermarket_search_terms; INSERT INTO x VALUES (1); END')).toHaveLength(1);
        expect(unsafeWrites('BEGIN UPDATE public.units SET share_permille = NULL; END')).toHaveLength(1);
    });

    it('acepta WHERE true, un WHERE real y un upsert', () => {
        expect(unsafeWrites('DELETE FROM pg_temp._unit_rights_input WHERE true;')).toEqual([]);
        expect(unsafeWrites('UPDATE public.units SET owner_id = p_owner WHERE id = p_unit;')).toEqual([]);
        expect(unsafeWrites('INSERT INTO t (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET n = 2;')).toEqual([]);
    });

    it('no confunde un comentario con una sentencia', () => {
        expect(unsafeWrites('-- antes: DELETE FROM tabla;\nSELECT 1;')).toEqual([]);
    });
});
