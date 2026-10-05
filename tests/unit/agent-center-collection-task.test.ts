import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentAction, AgentProfile } from '@/lib/agent-center/domain';

const mocks = vi.hoisted(() => ({
    complete: vi.fn(), wait: vi.fn(), fail: vi.fn(), audit: vi.fn(), read: vi.fn(), resolve: vi.fn(), store: vi.fn(), verify: vi.fn(),
}));
vi.mock('@/lib/agent-center/collection', () => ({
    readCollectionExpenses: mocks.read, resolveCollectionRecipients: mocks.resolve,
    storeCollectionNotifications: mocks.store, verifyCollectionNotifications: mocks.verify,
}));
vi.mock('@/lib/operations/audit', () => ({ recordOperationEvent: mocks.audit }));
vi.mock('@/lib/agent-center/taskEngine', () => ({
    createAgentTask: vi.fn().mockResolvedValue('task'), completeAgentTask: mocks.complete,
    waitAgentTaskForHuman: mocks.wait, failAgentTask: mocks.fail,
    runVerifiedTaskStep: async (_task: string, _position: number, execute: () => Promise<unknown>, options: { verify?: (value: unknown) => boolean }) => {
        const result = await execute();
        if (options.verify && !options.verify(result)) throw new Error('verification failed');
        return result;
    },
}));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: vi.fn() }));
import { runAgentPlaybook } from '@/lib/agent-center/taskPlaybooks';

const profile = { id: 'admin', role: 'admin', community_id: 'community' } as AgentProfile;
const action = { args: { playbookKey: 'finance_collection_review' }, summary: 'Revisar cobranza' } as AgentAction;

describe('collection task outcomes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.read.mockResolvedValue([{ id: 'debt' }]);
        mocks.resolve.mockResolvedValue({ notifications: [{ id: 'notice' }], missingRecipients: [], recipientCount: 1 });
        mocks.store.mockResolvedValue(['notice']);
        mocks.verify.mockResolvedValue(1);
        mocks.audit.mockResolvedValue({ ok: true });
    });
    it('leaves unresolved debts awaiting an administrator rather than reporting completion', async () => {
        const missing = [{ expenseId: 'debt', unitId: 'unit', unitLabel: '101', reason: 'Sin residente' }];
        mocks.resolve.mockResolvedValue({ notifications: [], missingRecipients: missing, recipientCount: 0 });
        mocks.store.mockResolvedValue([]);
        mocks.verify.mockResolvedValue(0);
        const result = await runAgentPlaybook(action, profile);
        expect(mocks.complete).not.toHaveBeenCalled();
        expect(mocks.wait).toHaveBeenCalledWith('task', 3, expect.objectContaining({ missingRecipients: missing }));
        expect(result.data).toMatchObject({ taskStatus: 'waiting_human', channel: 'in_app' });
        expect(result.message).toContain('queda pendiente');
    });
    it('requires a persisted audit before completing', async () => {
        mocks.audit.mockResolvedValue({ ok: false, reason: 'database unavailable' });
        await expect(runAgentPlaybook(action, profile)).rejects.toThrow('auditoria');
        expect(mocks.complete).not.toHaveBeenCalled();
        expect(mocks.fail).toHaveBeenCalled();
    });
    it('completes verified internal notifications without claiming email delivery or readership', async () => {
        const result = await runAgentPlaybook(action, profile);
        expect(mocks.complete).toHaveBeenCalledOnce();
        expect(result.message).toContain('No se enviaron correos ni WhatsApp');
        expect(result.message).toContain('no se confirma lectura');
    });
});
