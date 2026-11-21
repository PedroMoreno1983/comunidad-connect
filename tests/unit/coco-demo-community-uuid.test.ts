/**
 * 21-11-2026: la prueba de punta a punta encontró que CoCo no encontraba la
 * unidad de nadie en la comunidad demo (00000000-…): isUuid exigía versión 1–5.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => ({}), supabaseAdmin: {} }));

import { isUuid, scopedCommunity } from '@/lib/coco/tools/shared';

describe('comunidad demo en CoCo', () => {
    it('acepta el UUID nulo de la comunidad demo y uno v4 normal', () => {
        expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
        expect(isUuid('07212377-00de-4153-aa98-ab036661b662')).toBe(true);
        expect(isUuid('no-es-uuid')).toBe(false);
        expect(scopedCommunity({ community_id: '00000000-0000-0000-0000-000000000000' } as never)).toBe('00000000-0000-0000-0000-000000000000');
    });
});
