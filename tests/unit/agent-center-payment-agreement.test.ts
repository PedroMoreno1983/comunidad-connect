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
import { AGREEMENT_SIGNING_COPY, firstInstallmentDate, proposeAgreementPlan, secondInstallmentDate } from '@/lib/finance/agreementProposal';
import { agreementDueDates, splitInstallments } from '@/lib/finance/operationalFlows';
import { checkEligibilityPrivacy } from '@/lib/assemblies/eligibilityCopy';
import * as agreementCopy from '@/lib/finance/agreementCopy';
import { READ_ONLY_AGENT_TOOLS, TOOL_RISK_LEVELS } from '@/lib/agent-center/domain';
import type { AgentProfile } from '@/lib/agent-center/domain';

const COMMUNITY = '11111111-1111-4111-8111-111111111111';
const UNIT = '00000000-0000-4000-8000-000000000001';
const admin: AgentProfile = { id: '00000000-0000-4000-8000-000000000010', name: 'Admin', role: 'admin', community_id: COMMUNITY };
const resident: AgentProfile = { ...admin, id: '00000000-0000-4000-8000-000000000011', role: 'resident' };

describe('proposeAgreementPlan', () => {
    it('keeps each installment near half a monthly fee', () => {
        const plan = proposeAgreementPlan({ balance: 240000, monthlyFee: 80000, today: '2026-10-14' });
        expect(plan).toMatchObject({ totalAmount: 240000, installmentCount: 6, installmentAmount: 40000, startDate: '2026-10-14', secondDueDate: '2026-11-05' });
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
    it('the first installment falls due the day the agreement is signed', () => {
        expect(firstInstallmentDate('2026-10-14')).toBe('2026-10-14');
        expect(firstInstallmentDate('2026-12-20')).toBe('2026-12-20');
    });
    it('rolls the second installment into January after December', () => {
        expect(secondInstallmentDate('2026-12-20')).toBe('2027-01-05');
    });
});

describe('agreement due dates (first on signing, then the 5th, at least 15 days apart)', () => {
    it('signed on the 14th: first today, second on the 5th of next month', () => {
        expect(agreementDueDates('2026-10-14', 4)).toEqual(['2026-10-14', '2026-11-05', '2026-12-05', '2027-01-05']);
    });
    it('signed late in the month: skips a 5th that would land under 15 days', () => {
        expect(agreementDueDates('2026-10-25', 3)).toEqual(['2026-10-25', '2026-12-05', '2027-01-05']);
        expect(agreementDueDates('2026-10-21', 2)).toEqual(['2026-10-21', '2026-11-05']); // justo 15 días
        expect(agreementDueDates('2026-10-22', 2)).toEqual(['2026-10-22', '2026-12-05']); // 14 días: no
        expect(agreementDueDates('2027-01-31', 2)).toEqual(['2027-01-31', '2027-03-05']);
    });
    it('signed before the 5th: does not use this month\'s 5th (too close)', () => {
        expect(agreementDueDates('2026-10-03', 2)).toEqual(['2026-10-03', '2026-11-05']);
        expect(agreementDueDates('2026-10-05', 2)).toEqual(['2026-10-05', '2026-11-05']);
    });
    it('never leaves a gap under 15 days nor over two months between first and second', () => {
        for (let day = 1; day <= 31; day += 1) {
            const signed = `2026-10-${String(day).padStart(2, '0')}`;
            const [first, second] = agreementDueDates(signed, 2);
            const gap = (Date.parse(second) - Date.parse(first)) / 86_400_000;
            expect(first).toBe(signed);
            expect(second.endsWith('-05')).toBe(true);
            expect(gap).toBeGreaterThanOrEqual(15);
            expect(gap).toBeLessThan(47);
        }
    });
    it('splitInstallments uses the same schedule and keeps the total', () => {
        const rows = splitInstallments(100_000, 3, '2026-10-14');
        expect(rows.map(row => row.dueDate)).toEqual(['2026-10-14', '2026-11-05', '2026-12-05']);
        expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(100_000);
    });
    it('agreement copy is positive and carries no amounts nor debtor language', () => {
        expect(AGREEMENT_SIGNING_COPY).toBe('Al firmar pagas la primera cuota y quedas habilitado para votar en asambleas.');
        for (const text of Object.values(agreementCopy)) expect(checkEligibilityPrivacy(text)).toEqual([]);
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
        expect(result.data).toMatchObject({ installmentCount: 6, installmentAmount: 40000, startDate: '2026-10-14', secondDueDate: '2026-11-05' });
        expect(result.message).toContain('6 cuotas');
        expect(result.message).toContain('La primera cuota vence al firmar');
        expect(result.message).toContain(AGREEMENT_SIGNING_COPY);
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
            unitId: UNIT, totalAmount: 240000, installmentCount: 6, reviewerId: 'member-1',
            title: 'Convenio comunitario unidad 101',
        }));
        // Las fechas las fija el servidor al firmar, no la propuesta.
        expect(mocks.create.mock.calls[0][2]).not.toHaveProperty('startDate');
        expect(result.message).toContain('La primera cuota vence el dia en que el comite lo apruebe');
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
