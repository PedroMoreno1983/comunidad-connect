import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, fakeClient, type FakeDb } from '../fixtures/fakeSupabase';

const mocks = vi.hoisted(() => ({ db: null as unknown as FakeDb, audit: vi.fn(), complete: vi.fn() }));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => fakeClient(mocks.db) }));
vi.mock('@/lib/operations/audit', () => ({ recordOperationEvent: mocks.audit }));
vi.mock('@/lib/agent-center/chileDate', () => ({ chileTodayISO: () => '2026-10-14' }));
vi.mock('@/lib/agent-center/taskEngine', () => ({
    createAgentTask: async () => 'task-1',
    runVerifiedTaskStep: async (_id: string, _pos: number, execute: () => Promise<unknown>, options: { verify?: (value: unknown) => boolean } = {}) => {
        const value = await execute();
        if (options.verify && !options.verify(value)) throw new Error('verify failed');
        return value;
    },
    completeAgentTask: mocks.complete,
    failAgentTask: async () => undefined,
    waitAgentTaskForHuman: async () => undefined,
}));

import { runAgentPlaybook } from '@/lib/agent-center/taskPlaybooks';
import type { AgentAction, AgentProfile } from '@/lib/agent-center/domain';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const admin: AgentProfile = { id: 'admin-a', name: 'Admin', role: 'admin', community_id: A };
const action = { toolName: 'run_playbook', summary: 'plan', args: { playbookKey: 'maintenance_preventive_plan', requestedText: 'arma el plan preventivo' } } as unknown as AgentAction;

describe('maintenance_preventive_plan playbook', () => {
    beforeEach(() => {
        mocks.audit.mockReset().mockResolvedValue({ ok: true });
        mocks.complete.mockReset();
        mocks.db = createFakeDb({
            building_assets: [
                { id: 'asset-a1', community_id: A, name: 'Ascensor A', category: 'elevator', health_status: 'optimal', last_maintenance: '2026-10-01', next_maintenance: null },
                { id: 'asset-a2', community_id: A, name: 'Bomba A', category: 'pump', health_status: 'optimal', last_maintenance: null, next_maintenance: null },
                { id: 'asset-b1', community_id: B, name: 'Ascensor B', category: 'elevator', health_status: 'optimal', last_maintenance: null, next_maintenance: null },
            ],
            maintenance_tasks: [
                { id: 'task-a2', community_id: A, asset_id: 'asset-a2', status: 'pending', due_date: '2026-09-01' },
                { id: 'task-b', community_id: B, asset_id: null, status: 'pending', due_date: '2026-01-01' },
            ],
        });
    });

    it('schedules only within the community, marks overdue and audits', async () => {
        const result = await runAgentPlaybook(action, admin);
        const created = mocks.db.inserts.filter(item => item.table === 'maintenance_tasks').map(item => item.payload);
        expect(created).toEqual([expect.objectContaining({ community_id: A, asset_id: 'asset-a1', due_date: '2026-11-01', status: 'pending' })]);
        expect(mocks.db.tables.maintenance_tasks.find(row => row.id === 'task-a2')?.status).toBe('overdue');
        expect(mocks.db.tables.maintenance_tasks.find(row => row.id === 'task-b')?.status).toBe('pending');
        expect(mocks.db.tables.building_assets.find(row => row.id === 'asset-a2')?.health_status).toBe('warning');
        expect(mocks.db.tables.building_assets.find(row => row.id === 'asset-b1')?.next_maintenance).toBeNull();
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'agent.task.maintenance_preventive_plan', communityId: A }));
        expect(result.message).toContain('Agende 1');
    });

    it('running it twice does not duplicate tasks', async () => {
        await runAgentPlaybook(action, admin);
        await runAgentPlaybook(action, admin);
        expect(mocks.db.inserts.filter(item => item.table === 'maintenance_tasks')).toHaveLength(1);
    });
});
