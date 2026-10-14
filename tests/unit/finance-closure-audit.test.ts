import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const communityId = '11111111-1111-1111-1111-111111111111';
const adminId = '22222222-2222-2222-2222-222222222222';

describe('financial close audit', () => {
    let db: PGlite;

    beforeEach(async () => {
        db = new PGlite();
        await db.exec(`
            CREATE SCHEMA IF NOT EXISTS public;
            CREATE ROLE anon;
            CREATE ROLE authenticated;
            CREATE ROLE service_role;
            CREATE TABLE public.operation_events (
                community_id uuid NOT NULL, actor_id uuid, actor_role text,
                action text NOT NULL, entity_type text NOT NULL, entity_id text,
                severity text NOT NULL, status text NOT NULL, summary text NOT NULL,
                metadata jsonb NOT NULL
            );
            CREATE TABLE public.finance_period_closures (
                community_id uuid NOT NULL, month text NOT NULL,
                opening_cash bigint NOT NULL, statements jsonb NOT NULL,
                closed_by uuid NOT NULL
            );
            GRANT INSERT ON public.operation_events TO service_role;
            GRANT INSERT ON public.finance_period_closures TO service_role;
            GRANT USAGE ON SCHEMA public TO service_role;
        `);
        const migration = await readFile(resolve('supabase/migrations/20261014160711_finance_closure_atomic_audit.sql'), 'utf8');
        await db.exec(migration);
    });

    afterEach(async () => { await db.close(); });

    async function insertClose() {
        await db.exec('SET ROLE service_role');
        try {
            return await db.exec(`INSERT INTO public.finance_period_closures
                (community_id, month, opening_cash, statements, closed_by)
                VALUES ('${communityId}', '2026-09', 1000,
                    '{"income":{"totalIncome":500,"totalExpenses":250}}', '${adminId}')`);
        } finally {
            await db.exec('RESET ROLE');
        }
    }

    it('writes exactly one audit record with the same close', async () => {
        await insertClose();
        const result = await db.query<{ action: string; actor_id: string; metadata: { month: string; totalIncome: number } }>(
            'SELECT action, actor_id, metadata FROM public.operation_events',
        );
        expect(result.rows).toEqual([{
            action: 'finance.period_snapshot_saved', actor_id: adminId,
            metadata: { month: '2026-09', openingCash: 1000, totalIncome: 500, totalExpenses: 250 },
        }]);
    });

    it('does not persist the close when the audit insert is rejected', async () => {
        await db.exec(`ALTER TABLE public.operation_events ADD CONSTRAINT reject_close_audit
            CHECK (action <> 'finance.period_snapshot_saved')`);
        await expect(insertClose()).rejects.toThrow();
        const result = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.finance_period_closures');
        expect(result.rows[0].count).toBe(0);
    });
});
