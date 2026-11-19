/**
 * 18-11-2026: cupo de CoCo por persona, diario y semanal, en centavos de dólar.
 * Desde el 19-11-2026: administración y conserjería US$2 al día y US$6 a la
 * semana; residentes US$0,50 al día y US$1,50 a la semana. La comunidad: tope mensual.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '64d3e619-2a9f-41b3-aee0-d81632ba77db';
const COMMUNITY = '07212377-00de-4153-aa98-ab036661b662';
const state = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>>, inserted: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({
        from: (table: string) => {
            if (table === 'ai_budgets') {
                const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) };
                return q;
            }
            const q = {
                select: () => q, eq: () => q, gte: async () => ({ data: state.events, error: null }),
                insert: async (row: Record<string, unknown>) => { state.inserted.push(row); return { error: null }; },
            };
            return q;
        },
    }),
}));

import { chileWeekStart, enforceAiBudget, personCostLimits } from '@/lib/ai/budget';

const spent = (cents: number, at = new Date()) => ({ user_id: USER, total_tokens: 1000, image_count: 0, estimated_cost_cents: cents, action_type: 'chat', status: 'success', created_at: at.toISOString(), metadata: {} });
const ask = (role: string, cents: number) => enforceAiBudget({ communityId: COMMUNITY, userId: USER, role: role as 'admin', module: 'coco.chat', provider: 'anthropic', model: 'claude-sonnet-5', actionType: 'chat', estimatedPromptTokens: 1000, estimatedCompletionTokens: 100, estimatedCostCents: cents });

beforeEach(() => { state.events = []; state.inserted = []; });

describe('cupo de CoCo por persona', () => {
    it('administración y conserjería usan el cupo de staff; residentes el suyo', () => {
        const budget = { staff_daily_cost_cents: 100, staff_weekly_cost_cents: 400, resident_daily_cost_cents: 15, resident_weekly_cost_cents: 50 };
        expect(personCostLimits(budget, 'admin')).toEqual({ daily: 100, weekly: 400 });
        expect(personCostLimits(budget, 'concierge')).toEqual({ daily: 100, weekly: 400 });
        expect(personCostLimits(budget, 'resident')).toEqual({ daily: 15, weekly: 50 });
    });

    it('un residente que ya gastó US$0,49 hoy no puede uno de 3 centavos', async () => {
        state.events = [spent(49)];
        await expect(ask('resident', 3)).rejects.toThrow('cupo diario');
        expect(state.inserted[0]).toMatchObject({ status: 'blocked', blocked_reason: 'daily_person_cost_limit' });
    });

    it('un residente con cupo diario libre pero la semana gastada queda bloqueado hasta el lunes', async () => {
        const yesterday = new Date(Date.now() - 86_400_000);
        state.events = yesterday >= new Date(chileWeekStart()) ? [spent(149, yesterday)] : [spent(149)];
        await expect(ask('resident', 3)).rejects.toThrow(/semana|cupo diario/);
    });

    it('un residente sin condominio también tiene tope diario (19-11-2026)', async () => {
        state.events = [spent(49)];
        const sinComunidad = enforceAiBudget({ communityId: '', userId: USER, role: 'resident', module: 'coco.chat', provider: 'anthropic', model: 'claude-sonnet-5', actionType: 'chat', estimatedPromptTokens: 1000, estimatedCompletionTokens: 100, estimatedCostCents: 3 });
        await expect(sinComunidad).rejects.toThrow('cupo diario');
    });

    it('la administración puede seguir con US$1,90 gastados hoy y un mensaje de 5 centavos', async () => {
        state.events = [spent(190)];
        await expect(ask('admin', 5)).resolves.toBeUndefined();
    });

    it('la semana empieza el lunes en Chile', () => {
        const start = new Date(chileWeekStart(new Date('2026-11-18T15:00:00Z')));
        expect(start.toISOString()).toBe('2026-11-16T03:00:00.000Z');
    });
});
