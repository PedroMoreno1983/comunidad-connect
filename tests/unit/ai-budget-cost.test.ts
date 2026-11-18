import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => ({}) }));

import { estimateAiCostCents } from '@/lib/ai/budget';

describe('estimateAiCostCents (Anthropic)', () => {
    it('cobra Sonnet 5 a su precio, no al de Sonnet 4.6', () => {
        const cents = estimateAiCostCents({ provider: 'anthropic', model: 'claude-sonnet-5', promptTokens: 1_000_000, completionTokens: 100_000 });
        expect(cents).toBeCloseTo(200 + 100, 6);
    });

    it('cobra la caché leída al 10 % y la escrita de 1 h al doble', () => {
        const cents = estimateAiCostCents({
            provider: 'anthropic',
            model: 'claude-sonnet-5',
            promptTokens: 3_000_000, // 1 M fresco + 1 M leído + 1 M escrito
            cacheReadTokens: 1_000_000,
            cacheWriteTokens: 1_000_000,
            cacheWriteTtl: '1h',
        });
        expect(cents).toBeCloseTo(200 + 20 + 400, 6);
    });

    it('distingue Haiku 5.5 de Haiku 4.5 y Opus 5.5 de Opus 5', () => {
        const base = { provider: 'anthropic', promptTokens: 1_000_000 };
        expect(estimateAiCostCents({ ...base, model: 'claude-haiku-5-5' })).toBeCloseTo(10, 6);
        expect(estimateAiCostCents({ ...base, model: 'claude-haiku-4-5' })).toBeCloseTo(100, 6);
        expect(estimateAiCostCents({ ...base, model: 'claude-opus-5-5' })).toBeCloseTo(400, 6);
        expect(estimateAiCostCents({ ...base, model: 'claude-opus-5' })).toBeCloseTo(500, 6);
    });

    it('sin datos de caché cobra todo como entrada fresca (lado seguro)', () => {
        expect(estimateAiCostCents({ provider: 'anthropic', model: 'claude-haiku-4-5', promptTokens: 1_000_000 })).toBeCloseTo(100, 6);
    });
});
