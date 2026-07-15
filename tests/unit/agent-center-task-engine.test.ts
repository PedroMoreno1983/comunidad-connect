import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ updates: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({
        from: () => ({
            update: (payload: Record<string, unknown>) => {
                state.updates.push(payload);
                const query = {
                    eq: () => query,
                    then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
                };
                return query;
            },
        }),
    }),
}));

import { runVerifiedTaskStep } from '../../src/lib/agent-center/taskEngine';

describe('Agent Center persistent task engine', () => {
    beforeEach(() => {
        state.updates.length = 0;
    });

    it('retries a failed step and completes after verification', async () => {
        let attempts = 0;
        const result = await runVerifiedTaskStep('task-id', 1, async () => {
            attempts += 1;
            if (attempts === 1) throw new Error('temporary failure');
            return { verified: true };
        }, { verify: output => output.verified, output: output => output });

        expect(result).toEqual({ verified: true });
        expect(attempts).toBe(2);
        expect(state.updates).toContainEqual(expect.objectContaining({ status: 'failed', error: 'temporary failure' }));
        expect(state.updates).toContainEqual(expect.objectContaining({ status: 'completed' }));
        expect(state.updates).toContainEqual(expect.objectContaining({ retry_count: 1, last_error: null }));
    });

    it('escalates after the retry also fails', async () => {
        await expect(runVerifiedTaskStep('task-id', 0, async () => {
            throw new Error('persistent failure');
        })).rejects.toThrow('escalada');

        expect(state.updates).toContainEqual(expect.objectContaining({ status: 'escalated', last_error: 'persistent failure' }));
    });
});
