import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    rows: [] as Record<string, string>[],
}));

vi.mock('@/lib/coco/autonomyGate', () => ({ blockCoCoWrite: vi.fn(async () => null) }));
vi.mock('@/lib/supabase/supabaseAdmin', () => {
    const client = {
        from: (table: string) => {
            if (table !== 'supermarket_saved_lists') throw new Error(`Unexpected table: ${table}`);
            const filters: Record<string, string> = {};
            let inserted: Record<string, string> | null = null;
            const matching = () => state.rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
            const builder = {
                select: () => builder,
                eq: (key: string, value: string) => { filters[key] = value; return builder; },
                maybeSingle: async () => ({ data: matching()[0] || null, error: null }),
                insert: (row: Record<string, string>) => {
                    inserted = { ...row, id: `list-${state.rows.length + 1}` };
                    state.rows.push(inserted);
                    return builder;
                },
                single: async () => ({ data: inserted, error: null }),
                then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: matching().length, error: null }).then(resolve),
            };
            return builder;
        },
    };
    return { supabaseAdmin: client, getSupabaseAdmin: () => client };
});

import { executeTool } from '@/lib/coco/tools';

const context = { user_id: 'andrea', role: 'resident', community_id: '0ec125f4-770a-42ec-9327-6a694af69787' };

describe('save_shopping_list', () => {
    beforeEach(() => { state.rows = []; });

    it('escribe la lista en la cuenta autenticada y evita duplicados', async () => {
        const input = { body: 'arroz, pan, lechuga, garbanzos, leche', store: 'Lider' };
        const result = await executeTool('save_shopping_list', input, context) as Record<string, unknown>;
        expect(result.success).toBe(true);
        expect(result.item_count).toBe(5);
        expect(state.rows).toEqual([expect.objectContaining({
            user_id: 'andrea', body: input.body, store: 'Lider', title: 'arroz, pan, lechuga y 2 más',
        })]);

        const repeated = await executeTool('save_shopping_list', input, context) as Record<string, unknown>;
        expect(repeated.success).toBe(true);
        expect(state.rows).toHaveLength(1);
    });

    it('separa las listas personales de dos residentes', async () => {
        const input = { body: 'arroz, pan, leche' };
        await executeTool('save_shopping_list', input, context);
        await executeTool('save_shopping_list', input, { ...context, user_id: 'otro-residente' });
        expect(state.rows.map(row => row.user_id)).toEqual(['andrea', 'otro-residente']);
    });
});
