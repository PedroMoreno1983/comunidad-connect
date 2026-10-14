import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    statement: vi.fn(), agreements: vi.fn(), create: vi.fn(), committee: vi.fn(), audit: vi.fn(),
    lastExpense: { amount: 80000, month: '2026-10' } as Record<string, unknown> | null,
}));

vi.mock('@/lib/finance/collectionService', () => ({ getUnitStatement: mocks.statement }));
vi.mock('@/lib/finance/agreementService', () => ({ listAgreementsForUnits: mocks.agreements, createAgreement: mocks.create }));
vi.mock('@/lib/finance/committeeMembers', () => ({ activeCommitteeMembers: mocks.committee }));
vi.mock('@/lib/operations/audit', () => ({ recordOperationEvent: mocks.audit }));
vi.mock('@/lib/agent-center/chileDate', () => ({ chileTodayISO: () => '2026-10-14' }));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({ from: () => {
        const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
            maybeSingle: async () => ({ data: mocks.lastExpense, error: null }) };
        return query;
    } }),
}));

import { executeAgentTool, isAgentToolAllowedForRole, validateAgentToolArgs } from '@/lib/agent-center/agentTools';
import { firstInstallmentDate, proposeAgreementPlan } from '@/lib/finance/agreementProposal';
import { READ_ONLY_AGENT_TOOLS, TOOL_RISK_LEVELS } from '@/lib/agent-center/domain';
import type { AgentProfile } from '@/lib/agent-center/domain';

const COMMUNITY = '11111111-1111-4111-8111-111111111111';
const UNIT = '00000000-0000-4000-8000-000000000001';
const admin: AgentProfile = { id: '00000000-0000-4000-8000-000000000010', name: 'Admin', role: 'admin', community_id: COMMUNITY };
const resident: AgentProfile = { ...admin, id: '00000000-0000-4000-8000-000000000011', role: 'resident' };

describe('proposeAgreementPlan', () => {
    it('keeps each installment near half a monthly fee', () => {
        const plan = proposeAgreementPlan({ balance: 240000, monthlyFee: 80000, today: '2026-10-14' });
        expect(plan).toMatchObject({ totalAmount: 240000, installmentCount: 6, installmentAmount: 40000, startDate: '2026-11-05' });
    });
    it('caps suggested installments at 12 and says so', () => {
        const plan = proposeAgreementPlan({ balance: 2000000, monthlyFee: 80000, today: '2026-10-14' });
        expect(plan.installmentCount).toBe(12);
        expect(plan.reasoning).toContain('conversarlo');
    });
    it('honours an explicit installment count and a minimum of two', () => {
        expect(proposeAgreementPlan({ balance: 90000, monthlyFee: 80000, today: '2026-10-14', installmentCount: 3 }).installmentCount).toBe(3);
        expect(proposeAgreementPlan({ balance: 30000, monthlyFee: 80000, today: '2026-10-14' }).installmentCount).toBe(2);
    });
    it('falls back to six installments without a reference fee', () => {
        expect(proposeAgreementPlan({ balance: 120000, monthlyFee: null, today: '2026-10-14' }).installmentCount).toBe(6);
    });
    it('refuses a unit with no debt', () => {
        expect(() => proposeAgreementPlan({ balance: 0, monthlyFee: 80000, today: '2026-10-14' })).toThrow('no tiene saldo');
    });
    it('rolls the first installment into January after December', () => {
        expect(firstInstallmentDate('2026-12-20')).toBe('2027-01-05');
    });
});

describe('payment agreement agent tools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.lastExpense = { amount: 80000, month: '2026-10' };
        mocks.statement.mockResolvedValue({ balance: 240000, overdueAmount: 240000, oldestOverdueMonth: '2026-07', unitLabel: '101' });
        mocks.agreements.mockResolvedValue([]);
        mocks.committee.mockResolvedValue([]);
        mocks.audit.mockResolvedValue({ ok: true });
        mocks.create.mockImplementation(async (_community, _by, input) => ({ id: 'agreement-1', status: input.reviewerId ? 'pending_committee' : 'active' }));
    });

    it('preview is a read for admins only; propose is a high-risk write', () => {
        expect(READ_ONLY_AGENT_TOOLS).toContain('preview_payment_agreement');
        expect(READ_ONLY_AGENT_TOOLS).not.toContain('propose_payment_agreement');
        expect(TOOL_RISK_LEVELS.propose_payment_agreement).toBe('write_high');
        expect(isAgentToolAllowedForRole('preview_payment_agreement', 'resident')).toBe(false);
        expect(isAgentToolAllowedForRole('propose_payment_agreement', 'concierge')).toBe(false);
    });

    it('rejects bad arguments before touching data', () => {
        expect(() => validateAgentToolArgs('preview_payment_agreement', { unitId: 'x' }, admin)).toThrow('identificador');
        expect(() => validateAgentToolArgs('propose_payment_agreement', { unitId: UNIT, installmentCount: 40 }, admin)).toThrow('entre 2 y 36');
    });

    it('preview computes the plan without creating anything', async () => {
        const result = await executeAgentTool('preview_payment_agreement', { unitId: UNIT }, admin);
        expect(result.data).toMatchObject({ installmentCount: 6, installmentAmount: 40000, startDate: '2026-11-05' });
        expect(result.message).toContain('6 cuotas');
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('preview does not stack a second agreement', async () => {
        mocks.agreements.mockResolvedValue([{ id: 'existing', status: 'active', unitLabel: '101' }]);
        const result = await executeAgentTool('preview_payment_agreement', { unitId: UNIT }, admin);
        expect(result.title).toBe('La unidad ya tiene convenio');
        expect(mocks.statement).not.toHaveBeenCalled();
    });

    it('propose sends the agreement to the committee when one exists', async () => {
        mocks.committee.mockResolvedValue([{ id: 'member-1', name: 'Comite', email: '' }]);
        const result = await executeAgentTool('propose_payment_agreement', { unitId: UNIT }, admin);
        expect(mocks.create).toHaveBeenCalledWith(COMMUNITY, admin.id, expect.objectContaining({
            unitId: UNIT, totalAmount: 240000, installmentCount: 6, startDate: '2026-11-05', reviewerId: 'member-1',
            title: 'Convenio comunitario unidad 101',
        }));
        expect(result.data).toMatchObject({ status: 'pending_committee' });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'agent.payment_agreement.proposed' }));
    });

    it('propose refuses a unit that already has an open agreement', async () => {
        mocks.agreements.mockResolvedValue([{ id: 'existing', status: 'pending_committee' }]);
        await expect(executeAgentTool('propose_payment_agreement', { unitId: UNIT }, admin)).rejects.toThrow('ya tiene un convenio');
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('residents cannot run it', async () => {
        await expect(executeAgentTool('propose_payment_agreement', { unitId: UNIT }, resident)).rejects.toThrow('rol');
    });
});
