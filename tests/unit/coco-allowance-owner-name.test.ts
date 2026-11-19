/**
 * 19-11-2026: CoCo avisa cuánto queda del cupo al cruzar 50, 75 y 90 %, y
 * set_unit_owner anota al propietario que todavía no tiene cuenta.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => { throw new Error('sin base en tests'); } }));
vi.mock('server-only', () => ({}));

import { allowanceFrom, allowanceNotice } from '@/lib/ai/budget';
import { setUnitOwner } from '@/lib/coco/finalGapTools';

const limits = { daily: 100, weekly: 400 };

describe('cupo de CoCo', () => {
    it('calcula el % que queda', () => {
        expect(allowanceFrom({ dailyUsed: 33.5, weeklyUsed: 33.5, limits })).toEqual({ dailyLeftPct: 67, weeklyLeftPct: 92 });
        expect(allowanceFrom({ dailyUsed: 150, weeklyUsed: 0, limits })).toEqual({ dailyLeftPct: 0, weeklyLeftPct: 100 });
    });

    it('avisa solo al cruzar un umbral', () => {
        const at = (daily: number, weekly = 0) => allowanceFrom({ dailyUsed: daily, weeklyUsed: weekly, limits });
        expect(allowanceNotice(at(40), at(45))).toBeNull();
        expect(allowanceNotice(at(45), at(55))).toContain('Te queda un 45 % de tu uso de CoCo de hoy');
        expect(allowanceNotice(at(55), at(60))).toBeNull();
        expect(allowanceNotice(at(80), at(92))).toContain('8 %');
        expect(allowanceNotice(at(10, 290), at(20, 310))).toContain('de esta semana');
        expect(allowanceNotice(null, null)).toBeNull();
    });
});

describe('propietario sin cuenta', () => {
    function fakeAdmin(people: Array<{ id: string; name: string }>) {
        const updates: Record<string, unknown>[] = [];
        const chain = (rows: unknown[]) => {
            const query: Record<string, unknown> = {};
            for (const method of ['select', 'eq', 'limit', 'ilike']) query[method] = () => query;
            query.then = (resolve: (value: unknown) => void) => resolve({ data: rows, error: null });
            return query;
        };
        const admin = {
            from: (table: string) => {
                if (table === 'units') {
                    const query = chain([{ id: 'u20', number: '20', tower: 'Casas' }]);
                    query.update = (patch: Record<string, unknown>) => { updates.push(patch); return chain([]); };
                    return query;
                }
                return chain(people);
            },
        };
        return { admin: admin as never, updates };
    }

    it('anota el nombre y explica cómo sumar a la persona', async () => {
        const { admin, updates } = fakeAdmin([]);
        const result = await setUnitOwner(admin, 'c1', { unit_number: '20', resident_name: 'José Ignacio Valenzuela' }) as { success?: boolean; message?: string };
        expect(result.success).toBe(true);
        expect(result.message).toContain('José Ignacio Valenzuela quedó anotado como propietario del 20');
        expect(result.message).toContain('/admin/users');
        expect(updates).toEqual([{ owner_id: null, owner_name: 'José Ignacio Valenzuela' }]);
    });

    it('con cuenta, une la unidad a la persona', async () => {
        const { admin, updates } = fakeAdmin([{ id: 'p1', name: 'Camilo Valenzuela' }]);
        const result = await setUnitOwner(admin, 'c1', { unit_number: '20', resident_name: 'Camilo' }) as { message?: string };
        expect(result.message).toBe('Camilo Valenzuela quedó como dueño del 20.');
        expect(updates).toEqual([{ owner_id: 'p1', owner_name: 'Camilo Valenzuela' }]);
    });
});
